// shelf_auditor.js - Computer Vision Shelf Misplacement Auditor
import { supabase } from './supabaseClient.js';
import { showToast, playAudioChime } from './ui.js';

let html5QrCode = null;
let isScanning = false;
let currentFacingMode = 'environment'; // 'environment' (back) or 'user' (front)

let selectedShelfId = '';
let selectedShelfName = '';
let selectedRackId = '';
let selectedRackName = '';

// Session statistics & log
let stats = {
    total: 0,
    correct: 0,
    misplaced: 0,
    unknown: 0
};
let auditLog = [];
let recentScans = new Map(); // barcode -> timestamp for cooldown

// Audio Buzzer Synthesizer (Web Audio API)
let audioCtx = null;
function getAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
}

function playWarningBuzzer() {
    try {
        const ctx = getAudioContext();
        if (ctx.state === 'suspended') ctx.resume();

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(160, ctx.currentTime);
        osc.frequency.setValueAtTime(120, ctx.currentTime + 0.15);

        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        osc.stop(ctx.currentTime + 0.36);
    } catch (e) {
        console.error('Buzzer error:', e);
    }
}

function playSuccessChime() {
    try {
        playAudioChime();
    } catch (e) {
        // Fallback tone
        try {
            const ctx = getAudioContext();
            if (ctx.state === 'suspended') ctx.resume();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(660, ctx.currentTime);
            osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.2, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.3);
        } catch (err) {}
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initShelfDropdowns();
    setupControls();
});

// Load Shelves & Racks with Supabase + LocalStorage Fallback
async function initShelfDropdowns() {
    const shelfSelect = document.getElementById('select-audit-shelf');
    const rackSelect = document.getElementById('select-audit-rack');

    try {
        let shelves = [];
        try {
            const { data, error } = await supabase
                .from('shelves')
                .select('id, name')
                .order('name');
            if (!error && data && data.length > 0) {
                shelves = data;
            }
        } catch (dbErr) {
            console.warn('Supabase shelves error:', dbErr);
        }

        // Fallback to localStorage if database query was empty
        if (!shelves || shelves.length === 0) {
            const localShelves = JSON.parse(localStorage.getItem('erp_storage_shelves') || '[]');
            if (localShelves.length > 0) {
                shelves = localShelves.map(s => ({ id: s.id, name: s.name }));
            }
        }

        if (shelves.length === 0) {
            shelfSelect.innerHTML = '<option value="">-- No Shelves Found --</option>';
            showToast('No shelves found in database or local storage.', 'warning');
            return;
        }

        shelfSelect.innerHTML = '<option value="">-- Select Target Shelf --</option>' +
            shelves.map(s => `<option value="${s.id}">${s.name}</option>`).join('');

        shelfSelect.addEventListener('change', async (e) => {
            selectedShelfId = e.target.value;
            selectedShelfName = selectedShelfId ? e.target.options[e.target.selectedIndex].text : '';
            selectedRackId = '';
            selectedRackName = '';

            updateTargetBadge();

            if (!selectedShelfId) {
                rackSelect.innerHTML = '<option value="">Select Shelf First...</option>';
                rackSelect.disabled = true;
                return;
            }

            rackSelect.innerHTML = '<option value="">Loading Racks...</option>';
            rackSelect.disabled = true;

            let racks = [];
            try {
                const { data, error } = await supabase
                    .from('racks')
                    .select('id, name')
                    .eq('shelf_id', selectedShelfId)
                    .order('name');
                if (!error && data && data.length > 0) {
                    racks = data;
                }
            } catch (err) {}

            // Fallback to localStorage racks
            if (!racks || racks.length === 0) {
                const localRacks = JSON.parse(localStorage.getItem('erp_storage_racks') || '[]');
                racks = localRacks.filter(r => String(r.shelf_id) === String(selectedShelfId));
            }

            rackSelect.innerHTML = '<option value="">-- All Racks on this Shelf --</option>' +
                (racks || []).map(r => `<option value="${r.id}">${r.name}</option>`).join('');
            rackSelect.disabled = false;
        });

        rackSelect.addEventListener('change', (e) => {
            selectedRackId = e.target.value;
            selectedRackName = selectedRackId ? e.target.options[e.target.selectedIndex].text : '';
            updateTargetBadge();
        });

    } catch (err) {
        console.error('Failed to load shelves:', err);
        showToast('Failed to load shelves: ' + (err.message || err), 'error');
    }
}

function updateTargetBadge() {
    const badge = document.getElementById('target-shelf-badge');
    const nameEl = document.getElementById('target-location-name');

    if (!selectedShelfId) {
        badge.style.display = 'none';
        return;
    }

    badge.style.display = 'inline-flex';
    nameEl.innerText = `${selectedShelfName}${selectedRackName ? ' → ' + selectedRackName : ' (Whole Shelf)'}`;
}

function setupControls() {
    // Camera toggle
    const btnToggle = document.getElementById('btn-toggle-camera');
    const btnSwitch = document.getElementById('btn-switch-camera');
    const btnManualVerify = document.getElementById('btn-manual-verify');
    const manualInput = document.getElementById('manual-barcode-input');
    const btnExport = document.getElementById('btn-export-audit');
    const btnClear = document.getElementById('btn-clear-audit');
    const searchFilter = document.getElementById('log-search-filter');

    btnToggle.addEventListener('click', toggleCamera);

    btnSwitch.addEventListener('click', async () => {
        currentFacingMode = (currentFacingMode === 'environment') ? 'user' : 'environment';
        if (isScanning) {
            await stopCamera();
            await startCamera();
            showToast(`Switched to ${currentFacingMode === 'environment' ? 'back' : 'front'} camera`, 'info');
        }
    });

    btnManualVerify.addEventListener('click', () => {
        const code = manualInput.value.trim();
        if (code) {
            verifyBarcode(code);
            manualInput.value = '';
        }
    });

    manualInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const code = manualInput.value.trim();
            if (code) {
                verifyBarcode(code);
                manualInput.value = '';
            }
        }
    });

    btnExport.addEventListener('click', exportAuditCSV);
    btnClear.addEventListener('click', resetSession);

    searchFilter?.addEventListener('input', (e) => {
        renderAuditTable(e.target.value.trim().toLowerCase());
    });
}

// Camera Scanner Implementation
async function toggleCamera() {
    if (isScanning) {
        await stopCamera();
    } else {
        await startCamera();
    }
}

async function startCamera() {
    if (!selectedShelfId) {
        showToast('Please select a Target Shelf above first!', 'warning');
        return;
    }

    const placeholder = document.getElementById('camera-idle-placeholder');
    const btnToggle = document.getElementById('btn-toggle-camera');

    try {
        if (!html5QrCode) {
            html5QrCode = new Html5Qrcode('auditor-reader');
        }

        if (placeholder) placeholder.style.display = 'none';

        const config = {
            fps: 15,
            qrbox: { width: 300, height: 180 },
            aspectRatio: 1.5
        };

        await html5QrCode.start(
            { facingMode: currentFacingMode },
            config,
            (decodedText) => onBarcodeDetected(decodedText),
            () => {} // silent on frame without barcode
        );

        isScanning = true;
        btnToggle.className = 'btn btn-outline';
        btnToggle.style.color = 'var(--color-danger)';
        btnToggle.innerHTML = '<i data-lucide="square" style="width: 16px;"></i> Stop Camera';
        if (window.lucide) lucide.createIcons();
        showToast('Live shelf scanner active', 'success');

    } catch (err) {
        console.error('Camera start error:', err);
        showToast('Unable to access camera: ' + (err.message || err), 'error');
        if (placeholder) placeholder.style.display = 'block';
    }
}

async function stopCamera() {
    if (!html5QrCode) return;
    const btnToggle = document.getElementById('btn-toggle-camera');
    const placeholder = document.getElementById('camera-idle-placeholder');

    try {
        await html5QrCode.stop();
        isScanning = false;
        btnToggle.className = 'btn btn-primary';
        btnToggle.style.color = '';
        btnToggle.innerHTML = '<i data-lucide="video" style="width: 16px;"></i> Start Camera Stream';
        if (placeholder) placeholder.style.display = 'block';
        if (window.lucide) lucide.createIcons();
    } catch (err) {
        console.error('Camera stop error:', err);
    }
}

function onBarcodeDetected(decodedText) {
    if (!decodedText) return;
    const code = decodedText.trim();

    // Prevent spam scanning of the exact same code within 3.5 seconds
    const now = Date.now();
    const lastScanTime = recentScans.get(code);
    if (lastScanTime && (now - lastScanTime) < 3500) {
        return;
    }
    recentScans.set(code, now);

    verifyBarcode(code);
}

// ==========================================
// BARCODE VERIFICATION ENGINE
// ==========================================
async function verifyBarcode(barcode) {
    if (!selectedShelfId) {
        showToast('Please select a Target Shelf above first!', 'warning');
        return;
    }

    const soundEnabled = document.getElementById('check-sound-alert')?.checked;

    try {
        // Query copy with its relations
        const { data: copy, error } = await supabase
            .from('book_copies')
            .select(`
                id,
                barcode,
                status,
                shelf_id,
                rack_id,
                books (id, title, author, isbn, cover_url),
                shelves (id, name),
                racks (id, name)
            `)
            .eq('barcode', barcode)
            .maybeSingle();

        stats.total++;
        document.getElementById('stat-total-scanned').innerText = stats.total;

        if (!copy) {
            // UNKNOWN BARCODE
            stats.unknown++;
            document.getElementById('stat-unknown').innerText = stats.unknown;
            if (soundEnabled) playWarningBuzzer();

            renderUnknownVerdict(barcode);
            addLogItem({
                time: new Date().toLocaleTimeString(),
                barcode,
                title: 'Unknown / Uncatalogued',
                expected: 'None',
                detected: `${selectedShelfName}${selectedRackName ? ' / ' + selectedRackName : ''}`,
                status: 'Unknown',
                copyId: null
            });
            return;
        }

        const bookTitle = copy.books?.title || 'Untitled Book';
        const bookAuthor = copy.books?.author || 'Unknown Author';
        const expectedShelf = copy.shelves?.name || 'Unassigned Shelf';
        const expectedRack = copy.racks?.name || 'Unassigned Rack';
        const expectedLocation = `${expectedShelf} → ${expectedRack}`;
        const targetLocation = `${selectedShelfName}${selectedRackName ? ' → ' + selectedRackName : ''}`;

        // Verify Shelf and Rack match
        const isShelfMatch = String(copy.shelf_id) === String(selectedShelfId);
        const isRackMatch = !selectedRackId || (String(copy.rack_id) === String(selectedRackId));

        const isCorrect = isShelfMatch && isRackMatch;

        if (isCorrect) {
            // ✅ CORRECT
            stats.correct++;
            document.getElementById('stat-correct').innerText = stats.correct;
            if (soundEnabled) playSuccessChime();

            renderCorrectVerdict(copy, targetLocation);
            addLogItem({
                time: new Date().toLocaleTimeString(),
                barcode,
                title: bookTitle,
                expected: expectedLocation,
                detected: targetLocation,
                status: 'Correct',
                copyId: copy.id
            });
        } else {
            // 🚨 MISPLACED
            stats.misplaced++;
            document.getElementById('stat-misplaced').innerText = stats.misplaced;
            if (soundEnabled) playWarningBuzzer();

            renderMisplacedVerdict(copy, expectedLocation, targetLocation);
            addLogItem({
                time: new Date().toLocaleTimeString(),
                barcode,
                title: bookTitle,
                expected: expectedLocation,
                detected: targetLocation,
                status: 'Misplaced',
                copyId: copy.id
            });
        }

    } catch (err) {
        console.error('Verify barcode error:', err);
        showToast('Error looking up barcode: ' + err.message, 'error');
    }
}

// Verdict UI Renderers
function renderCorrectVerdict(copy, location) {
    const verdictCard = document.getElementById('audit-verdict-card');
    const idleState = document.getElementById('verdict-idle-state');
    const activeState = document.getElementById('verdict-active-state');

    idleState.style.display = 'none';
    activeState.style.display = 'block';

    verdictCard.style.borderColor = 'var(--color-success)';
    verdictCard.style.background = 'rgba(16, 185, 129, 0.05)';
    verdictCard.className = 'card card-glass pulse-green';

    activeState.innerHTML = `
        <div style="width: 72px; height: 72px; border-radius: 50%; background: rgba(16, 185, 129, 0.15); color: var(--color-success); display: flex; align-items: center; justify-content: center; margin: 0 auto 1.25rem;">
            <i data-lucide="check-circle-2" style="width: 44px; height: 44px;"></i>
        </div>
        <span class="badge badge-success" style="font-size: 0.85rem; padding: 0.35rem 0.85rem; margin-bottom: 0.75rem;">
            ✓ CORRECT LOCATION
        </span>
        <h2 style="font-size: 1.35rem; font-weight: 800; margin: 0.5rem 0 0.25rem 0;">${copy.books?.title || 'Book'}</h2>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1rem;">${copy.books?.author || ''} • Barcode: <code style="font-weight: 700;">${copy.barcode}</code></p>
        
        <div style="background: var(--bg-surface-secondary); padding: 0.85rem 1.25rem; border-radius: 8px; border: 1px solid var(--border-color); display: inline-block; text-align: left; font-size: 0.85rem;">
            <div style="color: var(--text-muted); font-size: 0.75rem;">VERIFIED POSITION:</div>
            <div style="font-weight: 700; color: var(--color-success);">${location}</div>
        </div>
    `;

    if (window.lucide) lucide.createIcons();
}

function renderMisplacedVerdict(copy, expectedLocation, detectedLocation) {
    const verdictCard = document.getElementById('audit-verdict-card');
    const idleState = document.getElementById('verdict-idle-state');
    const activeState = document.getElementById('verdict-active-state');

    idleState.style.display = 'none';
    activeState.style.display = 'block';

    verdictCard.style.borderColor = 'var(--color-danger)';
    verdictCard.style.background = 'rgba(239, 68, 68, 0.06)';
    verdictCard.className = 'card card-glass pulse-red';

    activeState.innerHTML = `
        <div style="width: 72px; height: 72px; border-radius: 50%; background: rgba(239, 68, 68, 0.15); color: var(--color-danger); display: flex; align-items: center; justify-content: center; margin: 0 auto 1.25rem;">
            <i data-lucide="alert-octagon" style="width: 44px; height: 44px;"></i>
        </div>
        <span class="badge" style="background: var(--color-danger); color: white; font-size: 0.85rem; padding: 0.35rem 0.85rem; margin-bottom: 0.75rem;">
            🚨 MISPLACED BOOK
        </span>
        <h2 style="font-size: 1.35rem; font-weight: 800; margin: 0.5rem 0 0.25rem 0; color: var(--color-danger);">${copy.books?.title || 'Book'}</h2>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1.25rem;">${copy.books?.author || ''} • Barcode: <code style="font-weight: 700;">${copy.barcode}</code></p>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; text-align: left; margin-bottom: 1.5rem;">
            <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.25); padding: 0.75rem 1rem; border-radius: 8px;">
                <div style="font-size: 0.72rem; font-weight: 700; color: var(--color-success); text-transform: uppercase;">Belongs To:</div>
                <div style="font-weight: 800; font-size: 0.95rem;">${expectedLocation}</div>
            </div>
            <div style="background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.25); padding: 0.75rem 1rem; border-radius: 8px;">
                <div style="font-size: 0.72rem; font-weight: 700; color: var(--color-danger); text-transform: uppercase;">Found On:</div>
                <div style="font-weight: 800; font-size: 0.95rem;">${detectedLocation}</div>
            </div>
        </div>

        <button class="btn btn-primary" id="btn-reassign-${copy.id}" style="background: var(--color-primary); padding: 0.6rem 1.5rem; font-size: 0.9rem;">
            <i data-lucide="arrow-right-left" style="width: 16px;"></i> Reassign to this Rack Now
        </button>
    `;

    if (window.lucide) lucide.createIcons();

    // Attach quick reassign action
    document.getElementById(`btn-reassign-${copy.id}`)?.addEventListener('click', () => {
        reassignCopy(copy.id, copy.barcode);
    });
}

function renderUnknownVerdict(barcode) {
    const verdictCard = document.getElementById('audit-verdict-card');
    const idleState = document.getElementById('verdict-idle-state');
    const activeState = document.getElementById('verdict-active-state');

    idleState.style.display = 'none';
    activeState.style.display = 'block';

    verdictCard.style.borderColor = 'var(--color-warning)';
    verdictCard.style.background = 'rgba(245, 158, 11, 0.05)';
    verdictCard.className = 'card card-glass';

    activeState.innerHTML = `
        <div style="width: 72px; height: 72px; border-radius: 50%; background: rgba(245, 158, 11, 0.15); color: var(--color-warning); display: flex; align-items: center; justify-content: center; margin: 0 auto 1.25rem;">
            <i data-lucide="help-circle" style="width: 44px; height: 44px;"></i>
        </div>
        <span class="badge badge-warning" style="font-size: 0.85rem; padding: 0.35rem 0.85rem; margin-bottom: 0.75rem;">
            ❓ UNCATALOGUED ITEM
        </span>
        <h2 style="font-size: 1.35rem; font-weight: 800; margin: 0.5rem 0 0.25rem 0;">Unknown Barcode</h2>
        <p style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 1.25rem;"><code style="font-weight: 700; font-size: 1.1rem;">${barcode}</code></p>
        
        <p style="font-size: 0.85rem; color: var(--text-secondary); max-width: 320px; margin: 0 auto 1.5rem;">
            This barcode is not registered in the book copies inventory. Register it in the Book Catalogue.
        </p>
        <a href="books.html" target="_blank" class="btn btn-outline btn-sm">
            <i data-lucide="plus" style="width: 14px;"></i> Catalog in Books
        </a>
    `;

    if (window.lucide) lucide.createIcons();
}

// Quick Reassign copy to current target
async function reassignCopy(copyId, barcode) {
    try {
        const updateData = {
            shelf_id: selectedShelfId,
            rack_id: selectedRackId || null
        };

        const { error } = await supabase
            .from('book_copies')
            .update(updateData)
            .eq('id', copyId);

        if (error) throw error;

        playSuccessChime();
        showToast(`Copy ${barcode} reassigned successfully!`, 'success');

        // Update item in auditLog
        const logItem = auditLog.find(l => l.copyId === copyId);
        if (logItem) {
            logItem.status = 'Reassigned';
            renderAuditTable();
        }

        // Update stats
        if (stats.misplaced > 0) stats.misplaced--;
        stats.correct++;
        document.getElementById('stat-misplaced').innerText = stats.misplaced;
        document.getElementById('stat-correct').innerText = stats.correct;

        // Reset verdict card styling
        const verdictCard = document.getElementById('audit-verdict-card');
        verdictCard.className = 'card card-glass pulse-green';
        verdictCard.style.borderColor = 'var(--color-success)';
        verdictCard.style.background = 'rgba(16, 185, 129, 0.05)';

        const activeState = document.getElementById('verdict-active-state');
        activeState.innerHTML = `
            <div style="width: 72px; height: 72px; border-radius: 50%; background: rgba(16, 185, 129, 0.15); color: var(--color-success); display: flex; align-items: center; justify-content: center; margin: 0 auto 1.25rem;">
                <i data-lucide="check" style="width: 44px; height: 44px;"></i>
            </div>
            <span class="badge badge-success" style="font-size: 0.85rem; padding: 0.35rem 0.85rem;">REASSIGNED</span>
            <h3 style="margin-top: 0.75rem;">Book Copy Successfully Moved Here!</h3>
            <p style="font-size: 0.85rem; color: var(--text-muted);">Database record updated to current Shelf and Rack.</p>
        `;
        if (window.lucide) lucide.createIcons();

    } catch (err) {
        console.error('Reassign error:', err);
        showToast('Failed to reassign: ' + err.message, 'error');
    }
}

// Log Management
function addLogItem(item) {
    auditLog.unshift(item);
    renderAuditTable();
}

function renderAuditTable(filterQuery = '') {
    const tbody = document.getElementById('audit-log-tbody');
    if (!tbody) return;

    let items = auditLog;
    if (filterQuery) {
        items = items.filter(i =>
            i.barcode.toLowerCase().includes(filterQuery) ||
            i.title.toLowerCase().includes(filterQuery)
        );
    }

    if (items.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">
                    ${auditLog.length === 0 ? 'No items scanned yet in this audit session.' : 'No items match your filter.'}
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = items.map(item => {
        let badgeClass = 'badge-brand';
        let badgeText = item.status;
        if (item.status === 'Correct') {
            badgeClass = 'badge-success';
        } else if (item.status === 'Misplaced') {
            badgeClass = 'badge-danger';
        } else if (item.status === 'Reassigned') {
            badgeClass = 'badge-brand';
            badgeText = '✓ Reassigned';
        } else if (item.status === 'Unknown') {
            badgeClass = 'badge-warning';
        }

        return `
            <tr>
                <td style="color: var(--text-muted); font-size: 0.8rem;">${item.time}</td>
                <td><code style="font-weight: 700;">${item.barcode}</code></td>
                <td style="font-weight: 600;">${item.title}</td>
                <td style="color: var(--text-secondary);">${item.expected}</td>
                <td><strong>${item.detected}</strong></td>
                <td><span class="badge ${badgeClass}" style="font-size: 0.75rem;">${badgeText}</span></td>
                <td style="text-align: right;">
                    ${item.status === 'Misplaced' && item.copyId ? `
                        <button class="btn btn-outline btn-sm" onclick="window.auditorReassign('${item.copyId}', '${item.barcode}')" style="font-size: 0.72rem; padding: 0.2rem 0.5rem;">
                            Move Here
                        </button>
                    ` : '-'}
                </td>
            </tr>
        `;
    }).join('');
}

// Expose reassign to global window for table button click
window.auditorReassign = (copyId, barcode) => {
    reassignCopy(copyId, barcode);
};

// Export to CSV
function exportAuditCSV() {
    if (auditLog.length === 0) {
        showToast('No audit data to export yet', 'warning');
        return;
    }

    const headers = ['Time', 'Barcode', 'Book Title', 'Expected Location', 'Audited Location', 'Status'];
    const rows = auditLog.map(i => [
        `"${i.time}"`,
        `"${i.barcode}"`,
        `"${i.title.replace(/"/g, '""')}"`,
        `"${i.expected.replace(/"/g, '""')}"`,
        `"${i.detected.replace(/"/g, '""')}"`,
        `"${i.status}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Shelf_Audit_${selectedShelfName || 'General'}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Audit report downloaded as CSV', 'success');
}

// Reset Session
function resetSession() {
    if (auditLog.length === 0) return;
    if (!confirm('Are you sure you want to clear current audit session logs and counters?')) return;

    stats = { total: 0, correct: 0, misplaced: 0, unknown: 0 };
    auditLog = [];
    recentScans.clear();

    document.getElementById('stat-total-scanned').innerText = '0';
    document.getElementById('stat-correct').innerText = '0';
    document.getElementById('stat-misplaced').innerText = '0';
    document.getElementById('stat-unknown').innerText = '0';

    const idleState = document.getElementById('verdict-idle-state');
    const activeState = document.getElementById('verdict-active-state');
    const verdictCard = document.getElementById('audit-verdict-card');

    idleState.style.display = 'block';
    activeState.style.display = 'none';
    verdictCard.className = 'card card-glass';
    verdictCard.style.borderColor = '';
    verdictCard.style.background = '';

    renderAuditTable();
    showToast('Audit session reset', 'info');
}
