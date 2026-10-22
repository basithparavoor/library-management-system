import { supabase } from './supabaseClient.js';
import { erp } from './erp_service.js';
import { shortcuts, DEFAULT_SHORTCUTS } from './shortcuts.js';
import { hardware } from './hardware.js';

const settingsForm = document.getElementById('settings-form');
const btnSave = document.getElementById('btn-save-settings');

// --- TAB SWITCHING ---
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');

tabButtons.forEach(button => {
    button.addEventListener('click', () => {
        tabButtons.forEach(btn => btn.classList.remove('active'));
        tabPanels.forEach(panel => panel.style.display = 'none');
        button.classList.add('active');
        const targetId = button.getAttribute('data-target');
        const targetPanel = document.getElementById(targetId);
        if (targetPanel) {
            targetPanel.style.display = 'block';
            if (targetId === 'panel-shortcuts') {
                renderShortcutsGrid();
            }
        }
    });
});

// --- GENERAL SETTINGS ---
async function loadSettings() {
    try {
        const { data, error } = await supabase.from('library_settings').select('*');
        if (error) return;
        if (data) {
            data.forEach(setting => {
                if (setting.setting_key === 'loan_days') document.getElementById('setting-loan-days').value = setting.setting_value;
                if (setting.setting_key === 'fine_amount') document.getElementById('setting-fine-amount').value = setting.setting_value;
                if (setting.setting_key === 'max_books') document.getElementById('setting-max-books').value = setting.setting_value;
                if (setting.setting_key === 'max_renewals') document.getElementById('setting-max-renewals').value = setting.setting_value;
            });
        }
    } catch (err) {
        console.error("Error loading settings:", err);
    }
}

settingsForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const originalText = btnSave.innerHTML;
    btnSave.innerText = "Saving...";
    btnSave.disabled = true;

    const updates = [
        { setting_key: 'loan_days', setting_value: document.getElementById('setting-loan-days').value },
        { setting_key: 'fine_amount', setting_value: document.getElementById('setting-fine-amount').value },
        { setting_key: 'max_books', setting_value: document.getElementById('setting-max-books').value },
        { setting_key: 'max_renewals', setting_value: document.getElementById('setting-max-renewals').value }
    ];

    try {
        await supabase.from('library_settings').upsert(updates, { onConflict: 'setting_key' });
        window.app.toast("Circulation rules saved successfully.", "success", "Settings Saved");
    } catch (err) {
        window.app.toast("Error saving settings.", "error", "Save Failed");
    } finally {
        btnSave.innerHTML = originalText;
        btnSave.disabled = false;
    }
});

// --- INSTITUTION PROFILE & BRANDING ---
let currentInstitutionLogo = '';
let currentInstitutionFavicon = '';

async function loadInstitutionProfile() {
    const profile = erp.getInstitutionProfile();
    populateProfileFields(profile);

    try {
        const remoteProfile = await erp.syncInstitutionProfileFromSupabase();
        if (remoteProfile) {
            populateProfileFields(remoteProfile);
        }
    } catch (e) {}
}

function populateProfileFields(profile) {
    if (!profile) return;
    if (document.getElementById('inst-name')) document.getElementById('inst-name').value = profile.name || '';
    if (document.getElementById('inst-tagline')) document.getElementById('inst-tagline').value = profile.tagline || '';
    if (document.getElementById('inst-reg-code')) document.getElementById('inst-reg-code').value = profile.reg_code || '';
    if (document.getElementById('inst-est-year')) document.getElementById('inst-est-year').value = profile.established_year || '';
    if (document.getElementById('inst-email')) document.getElementById('inst-email').value = profile.email || '';
    if (document.getElementById('inst-phone')) document.getElementById('inst-phone').value = profile.phone || '';
    if (document.getElementById('inst-website')) document.getElementById('inst-website').value = profile.website || '';
    if (document.getElementById('inst-address')) document.getElementById('inst-address').value = profile.address || '';
    if (document.getElementById('inst-logo-url')) document.getElementById('inst-logo-url').value = profile.logo_url || '';
    if (document.getElementById('inst-favicon-url')) document.getElementById('inst-favicon-url').value = profile.favicon_url || '';

    currentInstitutionLogo = profile.logo_url || '';
    currentInstitutionFavicon = profile.favicon_url || '';

    renderLogoPreview();
    renderFaviconPreview();
}

function renderLogoPreview() {
    const preview = document.getElementById('inst-logo-preview');
    if (!preview) return;
    if (currentInstitutionLogo) {
        preview.innerHTML = `<img src="${currentInstitutionLogo}" alt="Logo" style="width: 100%; height: 100%; object-fit: contain;">`;
    } else {
        preview.innerHTML = `<i data-lucide="building-2" style="width: 24px; height: 24px; color: var(--text-muted);"></i>`;
        if (window.lucide) lucide.createIcons();

    // Refresh mobile card view
    if (window.initMobileCardTables) window.initMobileCardTables();
    }
}

function renderFaviconPreview() {
    const preview = document.getElementById('inst-favicon-preview');
    if (!preview) return;
    if (currentInstitutionFavicon) {
        preview.innerHTML = `<img src="${currentInstitutionFavicon}" alt="Favicon" style="width: 100%; height: 100%; object-fit: contain;">`;
    } else {
        preview.innerHTML = `<i data-lucide="bookmark" style="width: 20px; height: 20px; color: var(--text-muted);"></i>`;
        if (window.lucide) lucide.createIcons();

    // Refresh mobile card view
    if (window.initMobileCardTables) window.initMobileCardTables();
    }
}

function compressImageFile(file, maxWidth = 400, maxHeight = 400, quality = 0.88) {
    return new Promise((resolve) => {
        if (!file || !file.type.startsWith('image/')) {
            resolve('');
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                if (width > maxWidth || height > maxHeight) {
                    if (width / height > maxWidth / maxHeight) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    } else {
                        width = Math.round((width * maxHeight) / height);
                        height = maxHeight;
                    }
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/png', quality));
            };
            img.onerror = () => resolve(e.target.result);
            img.src = e.target.result;
        };
        reader.onerror = () => resolve('');
        reader.readAsDataURL(file);
    });
}

// Logo file picker
document.getElementById('inst-logo-file')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        currentInstitutionLogo = await compressImageFile(file, 400, 400);
        document.getElementById('inst-logo-url').value = '';
        renderLogoPreview();
    }
});

document.getElementById('inst-logo-url')?.addEventListener('input', (e) => {
    currentInstitutionLogo = e.target.value.trim();
    renderLogoPreview();
});

document.getElementById('btn-clear-logo')?.addEventListener('click', () => {
    currentInstitutionLogo = '';
    document.getElementById('inst-logo-url').value = '';
    const fileInput = document.getElementById('inst-logo-file');
    if (fileInput) fileInput.value = '';
    renderLogoPreview();
    window.app.toast('Logo removed from draft. Click "Save Profile" to apply.', 'info');
});

// Favicon file picker
document.getElementById('inst-favicon-file')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        currentInstitutionFavicon = await compressImageFile(file, 128, 128);
        document.getElementById('inst-favicon-url').value = '';
        renderFaviconPreview();
    }
});

document.getElementById('inst-favicon-url')?.addEventListener('input', (e) => {
    currentInstitutionFavicon = e.target.value.trim();
    renderFaviconPreview();
});

document.getElementById('btn-clear-favicon')?.addEventListener('click', () => {
    currentInstitutionFavicon = '';
    document.getElementById('inst-favicon-url').value = '';
    const fileInput = document.getElementById('inst-favicon-file');
    if (fileInput) fileInput.value = '';
    renderFaviconPreview();
    window.app.toast('Favicon removed from draft. Click "Save Profile" to apply.', 'info');
});

// Save Institution Profile Form
document.getElementById('form-institution-profile')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-save-institution');
    const originalHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.innerHTML = '<i data-lucide="loader-2" class="animate-spin" style="width: 16px;"></i> Saving to Cloud...';
        btn.disabled = true;
        if (window.lucide) lucide.createIcons();

    // Refresh mobile card view
    if (window.initMobileCardTables) window.initMobileCardTables();
    }

    const profileData = {
        name: document.getElementById('inst-name').value.trim() || 'INSTITUTION NAME',
        tagline: document.getElementById('inst-tagline').value.trim(),
        reg_code: document.getElementById('inst-reg-code').value.trim(),
        established_year: document.getElementById('inst-est-year').value.trim(),
        email: document.getElementById('inst-email').value.trim(),
        phone: document.getElementById('inst-phone').value.trim(),
        website: document.getElementById('inst-website').value.trim(),
        address: document.getElementById('inst-address').value.trim(),
        logo_url: currentInstitutionLogo,
        favicon_url: currentInstitutionFavicon
    };

    try {
        await erp.saveInstitutionProfile(profileData);
        window.app.toast(`Institution Profile & Branding for "${profileData.name}" saved to Database!`, 'success', 'Profile Saved');
    } catch (err) {
        console.error("Save profile error:", err);
        window.app.toast("Could not save profile to database.", "error", "Save Failed");
    } finally {
        if (btn) {
            btn.innerHTML = originalHtml;
            btn.disabled = false;
            if (window.lucide) lucide.createIcons();

    // Refresh mobile card view
    if (window.initMobileCardTables) window.initMobileCardTables();
        }
    }
});

// Reset Institution Profile to Defaults
document.getElementById('btn-reset-profile')?.addEventListener('click', async () => {
    window.app.confirm('Reset institution profile, logo, and favicon back to system default credentials?', 'Reset Profile', async () => {
        await erp.resetInstitutionProfile();
        loadInstitutionProfile();
        window.app.toast('Institution profile reset to default.', 'info', 'Profile Reset');
    });
});

// --- INSTITUTIONAL SUB-CAMPUSES ---
let currentCampusLogo = '';

function loadCampuses() {
    const tbody = document.getElementById('campuses-tbody');
    if (!tbody) return;

    const campuses = erp.getCampuses();
    if (campuses.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="padding: 2rem; text-align: center; color: var(--text-muted);">No campuses registered yet.</td></tr>`;
        return;
    }

    tbody.innerHTML = campuses.map(c => `
        <tr>
            <td>
                <div style="width: 32px; height: 32px; border-radius: 6px; overflow: hidden; background: var(--bg-muted); border: 1px solid var(--border-color); display: flex; align-items: center; justify-content: center;">
                    ${c.logo_url ? `<img src="${c.logo_url}" alt="${c.name}" style="width: 100%; height: 100%; object-fit: cover;">` : `<i data-lucide="building-2" style="width: 16px; height: 16px; color: var(--brand-primary);"></i>`}
                </div>
            </td>
            <td style="font-family: var(--font-mono); font-weight: 700; color: var(--brand-primary);">${c.code}</td>
            <td style="font-weight: 700; color: var(--text-primary);">${c.name}</td>
            <td>${c.city || 'Bangalore'}</td>
            <td style="font-weight: 600;">${c.head_name || 'Dean Office'}</td>
            <td style="font-size: 0.85rem; color: var(--text-muted);">${c.email || 'campus@tgi.edu'}</td>
            <td style="font-size: 0.85rem;">${c.phone || '+91 80 0000 0000'}</td>
            <td>
                <div style="display: flex; gap: 0.25rem;">
                    <button class="btn btn-ghost btn-sm" style="padding: 0.2rem 0.4rem;" title="Edit Campus" onclick="window.editCampus('${c.id}')">
                        <i data-lucide="edit-3" style="width: 14px;"></i>
                    </button>
                    <button class="btn btn-ghost btn-sm" style="color: var(--danger); padding: 0.2rem 0.4rem;" title="Delete Campus" onclick="window.deleteCampus('${c.id}', '${c.name.replace(/'/g, "\\'")}')">
                        <i data-lucide="trash-2" style="width: 14px;"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');

    if (window.lucide) lucide.createIcons();

    // Refresh mobile card view
    if (window.initMobileCardTables) window.initMobileCardTables();
}

const modalCampus = document.getElementById('modal-campus');
const formCampus = document.getElementById('form-campus');

function renderCampusLogoPreview() {
    const preview = document.getElementById('camp-logo-preview');
    if (!preview) return;
    if (currentCampusLogo) {
        preview.innerHTML = `<img src="${currentCampusLogo}" alt="Logo" style="width: 100%; height: 100%; object-fit: cover;">`;
    } else {
        preview.innerHTML = `<i data-lucide="building-2" style="width: 18px; height: 18px; color: var(--text-muted);"></i>`;
        if (window.lucide) lucide.createIcons();

    // Refresh mobile card view
    if (window.initMobileCardTables) window.initMobileCardTables();
    }
}

document.getElementById('camp-logo-file')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (evt) => {
            currentCampusLogo = evt.target.result;
            document.getElementById('camp-logo-url').value = '';
            renderCampusLogoPreview();
        };
        reader.readAsDataURL(file);
    }
});

document.getElementById('camp-logo-url')?.addEventListener('input', (e) => {
    currentCampusLogo = e.target.value.trim();
    renderCampusLogoPreview();
});

document.getElementById('btn-add-campus')?.addEventListener('click', () => {
    document.getElementById('modal-campus-title').innerText = 'Register Institutional Campus';
    document.getElementById('camp-id').value = '';
    currentCampusLogo = '';
    formCampus.reset();
    renderCampusLogoPreview();
    modalCampus.classList.add('active');
});

modalCampus?.querySelectorAll('.close-campus-modal').forEach(b => b.addEventListener('click', () => modalCampus.classList.remove('active')));

window.editCampus = function(id) {
    const c = erp.getCampuses().find(item => item.id === id);
    if (!c) return;

    document.getElementById('modal-campus-title').innerText = 'Edit Institutional Campus';
    document.getElementById('camp-id').value = c.id;
    document.getElementById('camp-code').value = c.code || '';
    document.getElementById('camp-city').value = c.city || '';
    document.getElementById('camp-name').value = c.name || '';
    document.getElementById('camp-head').value = c.head_name || '';
    document.getElementById('camp-email').value = c.email || '';
    document.getElementById('camp-phone').value = c.phone || '';
    document.getElementById('camp-logo-url').value = c.logo_url || '';
    currentCampusLogo = c.logo_url || '';
    renderCampusLogoPreview();

    modalCampus.classList.add('active');
};

window.deleteCampus = function(id, name) {
    window.app.confirm(`Are you sure you want to delete campus "${name}"?`, "Delete Campus", () => {
        erp.deleteCampus(id);
        window.app.toast(`Campus "${name}" deleted.`, "info", "Campus Removed");
        loadCampuses();
    });
};

formCampus?.addEventListener('submit', (e) => {
    e.preventDefault();
    const campId = document.getElementById('camp-id').value;
    const campusData = {
        id: campId || undefined,
        code: document.getElementById('camp-code').value.trim().toUpperCase(),
        name: document.getElementById('camp-name').value.trim(),
        city: document.getElementById('camp-city').value.trim(),
        head_name: document.getElementById('camp-head').value.trim(),
        email: document.getElementById('camp-email').value.trim(),
        phone: document.getElementById('camp-phone').value.trim(),
        logo_url: currentCampusLogo
    };

    erp.saveCampus(campusData);
    window.app.toast(`Campus "${campusData.name}" ${campId ? 'updated' : 'registered'} successfully!`, 'success', campId ? 'Campus Updated' : 'Campus Added');
    modalCampus.classList.remove('active');
    formCampus.reset();
    loadCampuses();
});

// ==========================================================================
// KEYBOARD SHORTCUTS REBINDING & HARDWARE DIAGNOSTIC
// ==========================================================================
let activeCategoryFilter = 'ALL';
let currentRecordingActionId = null;
let capturedKeyCombo = '';

function renderShortcutsGrid() {
    const container = document.getElementById('shortcuts-grid-container');
    if (!container) return;

    const allShortcuts = shortcuts.getShortcuts();
    const filtered = allShortcuts.filter(s => activeCategoryFilter === 'ALL' || s.category === activeCategoryFilter);

    container.innerHTML = filtered.map(s => {
        const isModified = s.currentKey !== s.defaultKey;
        return `
            <div class="shortcut-card">
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
                        <span class="badge" style="font-size: 0.65rem; background: var(--bg-muted); color: var(--text-muted);">${s.category}</span>
                        ${isModified ? '<span class="badge badge-brand" style="font-size: 0.65rem;">Customized</span>' : ''}
                    </div>
                    <div style="font-weight: 700; font-size: 0.95rem; color: var(--text-primary);">${s.name}</div>
                    <div style="font-size: 0.78rem; color: var(--text-secondary); margin-top: 0.25rem; line-height: 1.35;">${s.description}</div>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 0.75rem; border-top: 1px solid var(--border-color);">
                    <div style="display: flex; gap: 0.25rem;">
                        ${shortcuts.renderKbdBadges(s.currentKey)}
                    </div>
                    <div style="display: flex; gap: 0.35rem;">
                        <button class="btn btn-outline btn-sm btn-rebind-key" data-id="${s.id}" data-name="${s.name}" style="padding: 0.25rem 0.55rem; font-size: 0.75rem;">
                            <i data-lucide="edit-3" style="width: 12px;"></i> Assign
                        </button>
                        ${isModified ? `
                            <button class="btn btn-ghost btn-sm btn-reset-single-key" data-id="${s.id}" title="Reset to default (${s.defaultKey})" style="padding: 0.25rem 0.4rem; color: var(--text-muted);">
                                <i data-lucide="rotate-ccw" style="width: 12px;"></i>
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    if (window.lucide) lucide.createIcons();

    // Refresh mobile card view
    if (window.initMobileCardTables) window.initMobileCardTables();

    // Attach Rebind Handlers
    container.querySelectorAll('.btn-rebind-key').forEach(btn => {
        btn.addEventListener('click', () => {
            openRebindModal(btn.dataset.id, btn.dataset.name);
        });
    });

    // Attach Single Reset Handlers
    container.querySelectorAll('.btn-reset-single-key').forEach(btn => {
        btn.addEventListener('click', () => {
            const def = DEFAULT_SHORTCUTS.find(d => d.id === btn.dataset.id);
            if (def) {
                shortcuts.rebind(btn.dataset.id, def.defaultKey);
                window.app.toast(`Reset to default: ${def.defaultKey}`, 'info', 'Shortcut Reset');
                renderShortcutsGrid();
            }
        });
    });
}

function openRebindModal(actionId, actionName) {
    currentRecordingActionId = actionId;
    capturedKeyCombo = '';

    const modal = document.getElementById('modal-rebind-recorder');
    const nameEl = document.getElementById('recorder-action-name');
    const boxEl = document.getElementById('recorder-captured-box');
    const confirmBtn = document.getElementById('btn-confirm-recording');

    nameEl.innerText = `Rebind: ${actionName}`;
    boxEl.innerHTML = `<em>Press any key combo on your keyboard...</em>`;
    confirmBtn.disabled = true;

    modal.classList.add('active');

    shortcuts.startRecording((combo) => {
        capturedKeyCombo = combo;
        boxEl.innerHTML = `<span style="color: var(--brand-primary); font-size: 1.4rem;">${combo}</span>`;
        confirmBtn.disabled = false;
        if (window.app?.playBeep) window.app.playBeep('scan');
    });
}

function closeRebindModal() {
    shortcuts.cancelRecording();
    document.getElementById('modal-rebind-recorder')?.classList.remove('active');
    currentRecordingActionId = null;
    capturedKeyCombo = '';
}

document.getElementById('btn-cancel-recording')?.addEventListener('click', closeRebindModal);

document.getElementById('btn-confirm-recording')?.addEventListener('click', () => {
    if (!currentRecordingActionId || !capturedKeyCombo) return;

    const res = shortcuts.rebind(currentRecordingActionId, capturedKeyCombo);
    if (!res.success) {
        window.app.toast(`Key combination "${capturedKeyCombo}" is already assigned to: ${res.conflict}`, 'warning', 'Shortcut Conflict');
        return;
    }

    window.app.toast(`Successfully bound to: ${capturedKeyCombo}`, 'success', 'Key Assigned');
    closeRebindModal();
    renderShortcutsGrid();
});

document.getElementById('btn-reset-shortcuts')?.addEventListener('click', () => {
    window.app.confirm('Reset all keyboard shortcuts to factory defaults?', 'Reset Keybindings', () => {
        shortcuts.resetDefaults();
        window.app.toast('All keyboard shortcuts restored to default configuration.', 'success', 'Defaults Restored');
        renderShortcutsGrid();
    });
});

// Category Filter Buttons
document.querySelectorAll('.shortcut-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.shortcut-filter-btn').forEach(b => {
            b.className = 'btn btn-outline btn-sm shortcut-filter-btn';
        });
        btn.className = 'btn btn-primary btn-sm shortcut-filter-btn';
        activeCategoryFilter = btn.dataset.cat;
        renderShortcutsGrid();
    });
});

// --- HARDWARE SCANNER LIVE TEST PAD ---
const scannerInput = document.getElementById('scanner-test-input');
const scannerResult = document.getElementById('scanner-test-result');

function handleScannerDiagnostic(code) {
    if (!code) return;
    const classified = hardware.classifyCode(code);
    
    scannerResult.style.display = 'block';
    scannerResult.innerHTML = `
        <div style="padding: 0.75rem; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-sm); display: flex; justify-content: space-between; align-items: center;">
            <div>
                <div style="font-weight: 700; color: var(--text-primary); font-size: 0.85rem;">Input Code: <span style="font-family: var(--font-mono); color: var(--brand-primary);">${code}</span></div>
                <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">Latency: Fast Wedge Scan (<80ms) • Prefix: <strong>${classified.prefix || 'NONE'}</strong></div>
            </div>
            <div style="display: flex; gap: 0.5rem; align-items: center;">
                <span class="badge badge-brand" style="font-size: 0.75rem;">${classified.type}</span>
                <button class="btn btn-primary btn-sm" onclick="window.hardware.showUniversalInspectorModal({ type: '${classified.type}', id: '${code}' }, 'TEST_PAD')">Inspect</button>
            </div>
        </div>
    `;

    if (window.app?.playBeep) window.app.playBeep('scan');
}

scannerInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        handleScannerDiagnostic(scannerInput.value.trim());
    }
});

document.getElementById('btn-test-nfc-tap')?.addEventListener('click', async () => {
    const supported = await hardware.isNfcSupported();
    if (supported) {
        window.app.toast('Tap NFC smartcard on device reader now...', 'info', 'NFC Active');
        hardware.startNfcScan((payload) => {
            scannerInput.value = payload;
            handleScannerDiagnostic(payload);
        });
    } else {
        // Fallback test card UID
        const mockUid = 'NFC-' + Math.floor(10000000 + Math.random() * 90000000);
        scannerInput.value = mockUid;
        handleScannerDiagnostic(mockUid);
        window.app.toast(`Simulated NFC UID generated: ${mockUid}`, 'info', 'Simulated NFC Tap');
    }
});

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
    loadInstitutionProfile();
    loadSettings();
    loadCampuses();
    renderShortcutsGrid();
});
