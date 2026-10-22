import { supabase } from './supabaseClient.js';

let html5QrcodeScanner = null;
let expectedCopiesMap = new Map(); // barcode -> { id, barcode, title, author }
let scannedBarcodes = new Set();
let soundEnabled = true;

const scanCountEl = document.getElementById('scan-count');
const expectedCountEl = document.getElementById('expected-count');
const verifiedCountEl = document.getElementById('verified-count');
const progressBarEl = document.getElementById('audit-progress-bar');
const percentTextEl = document.getElementById('audit-percent-text');
const recentScansList = document.getElementById('recent-scans-list');
const btnStart = document.getElementById('btn-start-audit');
const btnStop = document.getElementById('btn-stop-audit');
const manualInput = document.getElementById('manual-audit-barcode');
const btnToggleSound = document.getElementById('btn-toggle-sound');
const modalDiscrepancy = document.getElementById('modal-discrepancy');

// 1. Fetch Expected Available Inventory from Supabase
async function loadExpectedInventory() {
    expectedCopiesMap.clear();
    scannedBarcodes.clear();

    try {
        const { data, error } = await supabase
            .from('book_copies')
            .select(`
                id, barcode, status,
                books(title, author)
            `)
            .eq('status', 'AVAILABLE');

        if (error) throw error;

        if (data) {
            data.forEach(item => {
                if (item.barcode) {
                    expectedCopiesMap.set(item.barcode, {
                        id: item.id,
                        barcode: item.barcode,
                        title: item.books?.title || 'Unknown Title',
                        author: item.books?.author || 'Unknown'
                    });
                }
            });
        }

        if (expectedCountEl) expectedCountEl.innerText = expectedCopiesMap.size.toLocaleString();
        updateProgress();
    } catch (err) {
        console.error("Failed to load inventory:", err);
        if (expectedCountEl) expectedCountEl.innerText = "Error";
    }
}

// 2. Process a Barcode Scan
function processBarcode(barcode) {
    if (!barcode) return;
    barcode = barcode.trim();

    if (soundEnabled && window.app?.playBeep) {
        window.app.playBeep(expectedCopiesMap.has(barcode) ? 'scan' : 'error');
    }

    if (!scannedBarcodes.has(barcode)) {
        scannedBarcodes.add(barcode);

        if (scannedBarcodes.size === 1 && recentScansList) {
            recentScansList.innerHTML = '';
        }

        const isVerified = expectedCopiesMap.has(barcode);
        const bookInfo = expectedCopiesMap.get(barcode);
        const title = bookInfo ? bookInfo.title : 'Unregistered or Borrowed Copy';

        const itemHtml = `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 0.85rem; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-sm); gap: 0.75rem;">
                <div style="min-width: 0;">
                    <div style="font-family: var(--font-mono); font-weight: 700; font-size: 0.85rem; color: var(--text-primary);">${barcode}</div>
                    <div style="font-size: 0.75rem; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${title}</div>
                </div>
                <span class="badge ${isVerified ? 'badge-success' : 'badge-warning'}" style="font-size: 0.65rem; flex-shrink: 0;">
                    <span class="badge-dot"></span> ${isVerified ? 'Verified' : 'Unknown / Out'}
                </span>
            </div>
        `;

        if (recentScansList) {
            recentScansList.insertAdjacentHTML('afterbegin', itemHtml);
            if (window.lucide) lucide.createIcons();

    // Refresh mobile card view
    if (window.initMobileCardTables) window.initMobileCardTables();
        }

        if (scanCountEl) scanCountEl.innerText = `${scannedBarcodes.size} Scanned`;
        updateProgress();
    }

    if (manualInput) manualInput.value = '';
}

function updateProgress() {
    let matchCount = 0;
    scannedBarcodes.forEach(b => {
        if (expectedCopiesMap.has(b)) matchCount++;
    });

    if (verifiedCountEl) verifiedCountEl.innerText = matchCount.toLocaleString();

    const total = expectedCopiesMap.size;
    const percentage = total > 0 ? Math.min(Math.round((matchCount / total) * 100), 100) : 0;

    if (progressBarEl) progressBarEl.style.width = `${percentage}%`;
    if (percentTextEl) percentTextEl.innerText = `${percentage}%`;
}

// 3. Scanner Controls
btnStart?.addEventListener('click', () => {
    const readerEl = document.getElementById('audit-reader');
    if (!readerEl) return;
    readerEl.innerHTML = '';

    if (!html5QrcodeScanner) {
        html5QrcodeScanner = new Html5QrcodeScanner("audit-reader", { 
            fps: 12, 
            qrbox: { width: 260, height: 120 },
            aspectRatio: 1.0,
            showTorchButtonIfSupported: true
        }, false);
    }

    html5QrcodeScanner.render(
        (decodedText) => processBarcode(decodedText),
        (err) => {}
    );

    btnStart.disabled = true;
    if (btnStop) btnStop.disabled = false;
});

btnStop?.addEventListener('click', () => {
    if (html5QrcodeScanner) {
        html5QrcodeScanner.clear().then(() => {
            const readerEl = document.getElementById('audit-reader');
            if (readerEl) {
                readerEl.innerHTML = `
                    <div style="text-align: center; padding: 2rem;">
                        <i data-lucide="camera-off" style="width: 36px; height: 36px; opacity: 0.6; margin-bottom: 0.5rem;"></i>
                        <div style="font-size: 0.85rem; color: #94a3b8;">Scanner paused. Click "Start Continuous Scan" to resume.</div>
                    </div>
                `;
                if (window.lucide) lucide.createIcons();

    // Refresh mobile card view
    if (window.initMobileCardTables) window.initMobileCardTables();
            }
        });
        if (btnStart) btnStart.disabled = false;
        btnStop.disabled = true;
    }
});

// Manual Add
document.getElementById('btn-add-manual')?.addEventListener('click', () => {
    if (manualInput) processBarcode(manualInput.value.trim());
});

manualInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') processBarcode(manualInput.value.trim());
});

// Audio Toggle
btnToggleSound?.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    btnToggleSound.classList.toggle('active', soundEnabled);
    window.app?.toast(`Audio feedback ${soundEnabled ? 'enabled' : 'disabled'}.`, "info", "Audio Settings", 2000);
});

// Clear Stream
document.getElementById('btn-clear-scans')?.addEventListener('click', () => {
    if (recentScansList) {
        recentScansList.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 2.5rem 1rem;">Audit stream cleared. Scans are still recorded for this session.</div>`;
    }
});

// Reset Session
document.getElementById('btn-reset-audit')?.addEventListener('click', () => {
    window.app.confirm("Reset this audit session? All scanned progress will be cleared.", "Reset Audit", () => {
        scannedBarcodes.clear();
        if (recentScansList) {
            recentScansList.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 2.5rem 1rem;">Session reset. Ready to scan.</div>`;
        }
        if (scanCountEl) scanCountEl.innerText = "0 Scanned";
        updateProgress();
        window.app.toast("Audit session reset.", "info", "Reset");
    });
});

// 4. Generate Discrepancy Report Modal
document.getElementById('btn-reconcile')?.addEventListener('click', () => {
    const missing = [];
    expectedCopiesMap.forEach((book, barcode) => {
        if (!scannedBarcodes.has(barcode)) {
            missing.push(book);
        }
    });

    const unknown = [];
    scannedBarcodes.forEach(barcode => {
        if (!expectedCopiesMap.has(barcode)) {
            unknown.push(barcode);
        }
    });

    const summaryEl = document.getElementById('discrepancy-summary');
    const tableContainer = document.getElementById('discrepancy-table-container');

    if (summaryEl) {
        summaryEl.innerHTML = `
            <div style="background: var(--bg-muted); padding: 0.75rem; border-radius: var(--radius-sm); text-align: center; border: 1px solid var(--border-color);">
                <div style="font-size: 0.75rem; color: var(--text-muted);">Expected</div>
                <div style="font-size: 1.25rem; font-weight: 800; color: var(--text-primary);">${expectedCopiesMap.size}</div>
            </div>
            <div style="background: rgba(16,185,129,0.1); padding: 0.75rem; border-radius: var(--radius-sm); text-align: center; border: 1px solid rgba(16,185,129,0.2);">
                <div style="font-size: 0.75rem; color: var(--success);">Verified</div>
                <div style="font-size: 1.25rem; font-weight: 800; color: var(--success);">${expectedCopiesMap.size - missing.length}</div>
            </div>
            <div style="background: rgba(239,68,68,0.1); padding: 0.75rem; border-radius: var(--radius-sm); text-align: center; border: 1px solid rgba(239,68,68,0.2);">
                <div style="font-size: 0.75rem; color: var(--danger);">Missing</div>
                <div style="font-size: 1.25rem; font-weight: 800; color: var(--danger);">${missing.length}</div>
            </div>
        `;
    }

    if (tableContainer) {
        if (missing.length === 0) {
            tableContainer.innerHTML = `<div style="padding: 2rem; text-align: center; color: var(--success); font-weight: 600;">✓ Perfect stock match! No missing books detected.</div>`;
        } else {
            tableContainer.innerHTML = `
                <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
                    <thead style="background: var(--bg-muted);">
                        <tr>
                            <th style="padding: 0.6rem 0.85rem;">Barcode</th>
                            <th style="padding: 0.6rem 0.85rem;">Book Title</th>
                            <th style="padding: 0.6rem 0.85rem;">Author</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${missing.map(m => `
                            <tr>
                                <td style="padding: 0.6rem 0.85rem; font-family: var(--font-mono); font-weight: 600; color: var(--danger);">${m.barcode}</td>
                                <td style="padding: 0.6rem 0.85rem; font-weight: 600;">${m.title}</td>
                                <td style="padding: 0.6rem 0.85rem; color: var(--text-secondary);">${m.author}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        }
    }

    if (modalDiscrepancy) {
        modalDiscrepancy.classList.add('active');
        if (window.lucide) lucide.createIcons();

    // Refresh mobile card view
    if (window.initMobileCardTables) window.initMobileCardTables();
    }
});

modalDiscrepancy?.querySelectorAll('.close-discrepancy').forEach(b => {
    b.addEventListener('click', () => modalDiscrepancy.classList.remove('active'));
});

// CSV Export for Discrepancies
document.getElementById('btn-download-discrepancy-csv')?.addEventListener('click', () => {
    const missing = [];
    expectedCopiesMap.forEach((book, barcode) => {
        if (!scannedBarcodes.has(barcode)) {
            missing.push(book);
        }
    });

    const csvContent = [
        "Barcode,Title,Author,Audit_Status",
        ...missing.map(m => `"${m.barcode}","${(m.title || '').replace(/"/g, '""')}","${(m.author || '').replace(/"/g, '""')}","MISSING"`)
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Inventory_Discrepancy_Report_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    window.app.toast("Discrepancy report CSV downloaded.", "success", "Report Ready");
});

document.addEventListener('DOMContentLoaded', loadExpectedInventory);
