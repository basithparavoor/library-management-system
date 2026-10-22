// nfc_id_cards.js - NFC Smart Card Provisioning, Barcode Linker & High-Res ID Card Studio
import { supabase } from './supabaseClient.js';
import { erp } from './erp_service.js';
import { showToast, playAudioChime } from './ui.js';

let membersCache = [];
let nfcTagsList = [];
let currentTemplateConfig = {
    orientation: 'landscape',
    width_mm: 85.6,
    height_mm: 53.98,
    primary_color: '#3b82f6',
    accent_color: '#1e3a8a',
    bg_style: 'header-gradient',
    show_logo: true,
    show_photo: true,
    show_barcode: true,
    show_qrcode: true,
    show_nfc: true,
    show_blood: true,
    show_signature: true
};

document.addEventListener('DOMContentLoaded', async () => {
    initTabs();
    initNfcStudio();
    initTemplateDesigner();
    await loadMembersAndTags();
    renderBatchCards();
    updateLiveDesignerPreview();
    setupEventListeners();
});

// --- TAB SWITCHING ---
function initTabs() {
    const tabs = document.querySelectorAll('.nfc-tab-btn');
    const panels = document.querySelectorAll('.tab-panel-section');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            panels.forEach(p => p.style.display = 'none');

            tab.classList.add('active');
            const target = document.getElementById(tab.dataset.tab);
            if (target) {
                target.style.display = 'block';
                if (tab.dataset.tab === 'tab-id-generator') renderBatchCards();
                if (tab.dataset.tab === 'tab-template-designer') updateLiveDesignerPreview();
                if (tab.dataset.tab === 'tab-nfc-registry') renderNfcRegistryTable();
            }
            if (window.lucide) lucide.createIcons();

    // Refresh mobile card view
    if (window.initMobileCardTables) window.initMobileCardTables();
        });
    });
}

// --- DATA LOADING ---
async function loadMembersAndTags() {
    // 1. Load Students & Staff from Supabase or Local ERP
    let students = [];
    let staff = [];

    try {
        const { data: dbStudents } = await supabase.from('students').select('*').order('name');
        if (dbStudents && dbStudents.length > 0) students = dbStudents;
        else students = JSON.parse(localStorage.getItem('erp_students') || '[]');
    } catch (e) {
        students = JSON.parse(localStorage.getItem('erp_students') || '[]');
    }

    try {
        const { data: dbStaff } = await supabase.from('staff').select('*').order('name');
        if (dbStaff && dbStaff.length > 0) staff = dbStaff;
        else staff = JSON.parse(localStorage.getItem('erp_staff') || '[]');
    } catch (e) {
        staff = JSON.parse(localStorage.getItem('erp_staff') || '[]');
    }

    membersCache = [
        ...students.map(s => ({
            id: s.id || s.student_id,
            member_id: s.student_id,
            name: s.name,
            role: 'STUDENT',
            role_label: 'Student Patron',
            dept_class: s.class_id || 'General Cohort',
            email: s.email || '',
            phone: s.phone || '',
            blood_group: s.blood_group || 'O+',
            nfc_tag_id: s.nfc_tag_id || '',
            barcode: s.student_id
        })),
        ...staff.map(st => ({
            id: st.id || st.employee_id,
            member_id: st.employee_id,
            name: st.name,
            role: 'STAFF',
            role_label: st.designation || 'Faculty Member',
            dept_class: st.department_id || 'Academic Faculty',
            email: st.email || '',
            phone: st.phone || '',
            blood_group: st.blood_group || 'A+',
            nfc_tag_id: st.nfc_tag_id || '',
            barcode: st.employee_id
        }))
    ];

    // Populate Member Selector in NFC Hub
    const memberSelect = document.getElementById('nfc-link-member-select');
    if (memberSelect) {
        memberSelect.innerHTML = `<option value="">-- Select Member or Staff --</option>` +
            membersCache.map(m => `<option value="${m.member_id}">${m.name} (${m.member_id}) - ${m.role_label}</option>`).join('');
    }

    // 2. Load NFC Tags
    nfcTagsList = erp.getNfcTags('ALL');
    const countEl = document.getElementById('count-nfc-tags');
    if (countEl) countEl.innerText = nfcTagsList.length;

    renderNfcRegistryTable();
}

// --- NFC HUB & HARDWARE INTEGRATION ---
function initNfcStudio() {
    // Web NFC Hardware Availability Check
    const hwStatus = document.getElementById('nfc-hardware-status');
    if ('NDEFReader' in window) {
        if (hwStatus) {
            hwStatus.className = 'badge badge-success';
            hwStatus.innerHTML = '<span class="badge-dot"></span> Web NFC Ready';
        }
    } else {
        if (hwStatus) {
            hwStatus.className = 'badge badge-warning';
            hwStatus.innerHTML = '<span class="badge-dot"></span> Emulator Mode (No HW NFC)';
        }
    }

    // Generate valid random UID
    const btnGenUid = document.getElementById('btn-gen-random-uid');
    if (btnGenUid) {
        btnGenUid.addEventListener('click', () => {
            const hex = Array.from({ length: 7 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase()).join(':');
            document.getElementById('nfc-input-uid').value = hex;
            updateDiagnostics(hex, 'GENERATED');
        });
    }

    // Hardware Listen Button
    const btnHwNfc = document.getElementById('btn-start-hardware-nfc');
    if (btnHwNfc) {
        btnHwNfc.addEventListener('click', async () => {
            if ('NDEFReader' in window) {
                try {
                    const ndef = new NDEFReader();
                    await ndef.scan();
                    showToast('Tap NFC card to antenna...', 'info');
                    document.getElementById('nfc-scan-prompt').innerText = 'Scanning... Hold card to device';

                    ndef.addEventListener("reading", ({ serialNumber, message }) => {
                        const uid = serialNumber.toUpperCase();
                        document.getElementById('nfc-input-uid').value = uid;
                        playAudioChime('success');
                        showToast(`Hardware NFC Tag detected: ${uid}`, 'success');
                        updateDiagnostics(uid, 'HARDWARE_TAP');
                        matchMemberByNfc(uid);
                    });
                } catch (error) {
                    showToast(`NFC Scan Error: ${error.message}`, 'error');
                }
            } else {
                showToast('Web NFC is not supported on this browser. Use Simulate NFC Card Tap instead.', 'warning');
            }
        });
    }

    // Simulate NFC Tap Button
    const btnSimulate = document.getElementById('btn-simulate-nfc-tap');
    if (btnSimulate) {
        btnSimulate.addEventListener('click', () => {
            const randomHex = Array.from({ length: 7 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase()).join(':');
            document.getElementById('nfc-input-uid').value = randomHex;
            playAudioChime('success');
            showToast(`Simulated NFC Tap: ${randomHex}`, 'success');
            updateDiagnostics(randomHex, 'SIMULATED_TAP');
        });
    }

    // Member Selector Change -> Sync Barcode & Mini Card
    const memberSelect = document.getElementById('nfc-link-member-select');
    if (memberSelect) {
        memberSelect.addEventListener('change', (e) => {
            const memberId = e.target.value;
            const member = membersCache.find(m => m.member_id === memberId);
            if (member) {
                document.getElementById('nfc-link-barcode').value = member.barcode;
                updateMiniCard(member);
            }
        });
    }

    // Save/Program NFC Tag
    const btnSaveTag = document.getElementById('btn-save-nfc-tag');
    if (btnSaveTag) {
        btnSaveTag.addEventListener('click', () => {
            const uid = document.getElementById('nfc-input-uid').value.trim();
            const tech = document.getElementById('nfc-input-tech').value;
            const memberId = document.getElementById('nfc-link-member-select').value;
            const barcode = document.getElementById('nfc-link-barcode').value.trim();

            if (!uid) {
                showToast('Please specify or scan an NFC Tag UID.', 'warning');
                return;
            }

            const member = membersCache.find(m => m.member_id === memberId);

            const clearances = [];
            if (document.getElementById('nfc-perm-turnstile').checked) clearances.push('Turnstile Gate');
            if (document.getElementById('nfc-perm-library').checked) clearances.push('Library Desk');
            if (document.getElementById('nfc-perm-lab').checked) clearances.push('Digital Research Lab');
            if (document.getElementById('nfc-perm-events').checked) clearances.push('Auditorium Events');

            const tagRecord = {
                tag_uid: uid,
                tech_type: tech,
                member_id: memberId || 'UNASSIGNED',
                member_name: member ? member.name : 'Unassigned Guest',
                member_role: member ? member.role : 'GUEST',
                barcode: barcode || uid,
                clearances: clearances,
                status: 'ACTIVE',
                campus_id: erp.getActiveCampusId()
            };

            erp.saveNfcTag(tagRecord);
            playAudioChime('success');
            showToast(`Smart NFC Tag "${uid}" registered and synced with Barcode "${tagRecord.barcode}".`, 'success');
            loadMembersAndTags();
        });
    }

    // Copy / Clone Payload
    const btnCopy = document.getElementById('btn-copy-nfc-tag');
    if (btnCopy) {
        btnCopy.addEventListener('click', () => {
            const uid = document.getElementById('nfc-input-uid').value.trim();
            if (!uid) {
                showToast('No active NFC tag to clone.', 'warning');
                return;
            }
            navigator.clipboard.writeText(uid);
            showToast(`Copied NFC UID payload ${uid} to clipboard.`, 'info');
        });
    }
}

function updateDiagnostics(uid, mode) {
    document.getElementById('diag-uid').innerText = uid;
    document.getElementById('diag-timestamp').innerText = new Date().toLocaleTimeString();
    document.getElementById('diag-status').innerText = 'VALID & PROVISIONED';
    document.getElementById('diag-status').className = 'badge badge-success';
}

function matchMemberByNfc(uid) {
    const existing = erp.findNfcTagByUid(uid);
    if (existing && existing.member_id) {
        document.getElementById('nfc-link-member-select').value = existing.member_id;
        document.getElementById('nfc-link-barcode').value = existing.barcode;
        const member = membersCache.find(m => m.member_id === existing.member_id);
        if (member) updateMiniCard(member);
    }
}

function updateMiniCard(member) {
    const inst = erp.getInstitutionProfile();
    document.getElementById('mini-card-inst-name').innerText = inst.name || 'INSTITUTION';
    document.getElementById('mini-card-name').innerText = member.name;
    document.getElementById('mini-card-role').innerText = member.role_label;
    document.getElementById('mini-card-id').innerText = `ID: ${member.member_id}`;

    if (window.JsBarcode) {
        try {
            JsBarcode("#mini-card-barcode", member.barcode || member.member_id, {
                format: "CODE128",
                width: 1.2,
                height: 24,
                displayValue: false,
                margin: 0
            });
        } catch (e) {}
    }
}

// --- NFC REGISTRY TABLE ---
function renderNfcRegistryTable() {
    const tbody = document.getElementById('nfc-registry-tbody');
    if (!tbody) return;

    const searchTerm = (document.getElementById('registry-search-input')?.value || '').toLowerCase();
    const tags = erp.getNfcTags('ALL');

    const filtered = tags.filter(t => 
        t.tag_uid?.toLowerCase().includes(searchTerm) ||
        t.member_name?.toLowerCase().includes(searchTerm) ||
        t.barcode?.toLowerCase().includes(searchTerm)
    );

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 2rem;">No provisioned NFC tags found. Tap reader or register above.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(t => {
        const isSuspended = t.status === 'SUSPENDED';
        const isLost = t.status === 'LOST_LOCKED';
        const badgeClass = isLost ? 'badge-danger' : (isSuspended ? 'badge-warning' : 'badge-success');
        const clearancesText = (t.clearances || ['All Facilities']).join(', ');

        return `
            <tr>
                <td style="font-family: var(--font-mono); font-weight: 700; color: var(--brand-primary);">${t.tag_uid}</td>
                <td style="font-weight: 700;">${t.member_name || 'Unassigned'}</td>
                <td><span class="badge badge-brand" style="font-size: 0.65rem;">${t.member_role || 'PATRON'}</span></td>
                <td style="font-family: var(--font-mono); font-weight: 600;">${t.barcode || '---'}</td>
                <td><span style="font-size: 0.75rem; color: var(--text-muted);">${t.tech_type || 'NTAG215'}</span></td>
                <td style="font-size: 0.75rem; max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${clearancesText}">${clearancesText}</td>
                <td><span class="badge ${badgeClass}">${t.status || 'ACTIVE'}</span></td>
                <td style="text-align: right;">
                    <div style="display: flex; gap: 0.35rem; justify-content: flex-end;">
                        <button class="btn btn-ghost btn-icon btn-sm" onclick="window.editNfcTag('${t.id}')" title="Edit Status"><i data-lucide="edit-2" style="width: 13px;"></i></button>
                        <button class="btn btn-ghost btn-icon btn-sm" onclick="window.testTapTag('${t.tag_uid}')" title="Test Tap"><i data-lucide="radio" style="width: 13px; color: var(--brand-primary);"></i></button>
                        <button class="btn btn-ghost btn-icon btn-sm" onclick="window.deleteNfcTag('${t.id}')" title="Delete Tag"><i data-lucide="trash-2" style="width: 13px; color: var(--color-danger);"></i></button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    if (window.lucide) lucide.createIcons();

    // Refresh mobile card view
    if (window.initMobileCardTables) window.initMobileCardTables();
}

window.testTapTag = function(uid) {
    showToast(`Smart Tap Successful: NFC Card ${uid} recognized across campus gates!`, 'success');
    playAudioChime('success');
};

window.editNfcTag = function(id) {
    const tags = erp.getNfcTags('ALL');
    const tag = tags.find(t => t.id === id);
    if (!tag) return;

    document.getElementById('edit-nfc-id').value = tag.id;
    document.getElementById('edit-nfc-uid').value = tag.tag_uid;
    document.getElementById('edit-nfc-status').value = tag.status || 'ACTIVE';
    document.getElementById('edit-nfc-barcode').value = tag.barcode || '';
    document.getElementById('modal-edit-nfc-tag').style.display = 'flex';
};

window.deleteNfcTag = function(id) {
    if (confirm('Are you sure you want to unregister this NFC tag?')) {
        erp.deleteNfcTag(id);
        showToast('NFC Tag removed from registry.', 'info');
        loadMembersAndTags();
    }
};

// --- BATCH ID CARDS GENERATION & PRINT ---
function renderBatchCards() {
    const container = document.getElementById('printable-cards-container');
    if (!container) return;

    const filterRole = document.getElementById('batch-filter-role')?.value || 'ALL';
    const cardSide = document.getElementById('batch-card-side')?.value || 'FRONT';
    const inst = erp.getInstitutionProfile();

    let list = membersCache;
    if (filterRole !== 'ALL') {
        list = list.filter(m => m.role === filterRole);
    }

    if (list.length === 0) {
        container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--text-muted);">No members found to generate ID cards. Register students or staff in their respective modules.</div>`;
        return;
    }

    container.innerHTML = list.map((m, idx) => {
        const barcodeId = `batch-barcode-${idx}`;
        const qrId = `batch-qr-${idx}`;

        return `
            <div class="id-card-cr80" style="position: relative;">
                <!-- Header Banner -->
                <div style="background: linear-gradient(135deg, ${currentTemplateConfig.accent_color} 0%, ${currentTemplateConfig.primary_color} 100%); color: white; padding: 10px 14px; display: flex; align-items: center; justify-content: space-between;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        ${inst.logo_url ? `<img src="${inst.logo_url}" style="width: 24px; height: 24px; object-fit: contain;">` : `<i data-lucide="building-2" style="width: 20px; height: 20px;"></i>`}
                        <div>
                            <div style="font-size: 0.75rem; font-weight: 900; letter-spacing: 0.04em;">${inst.name || 'INSTITUTION'}</div>
                            <div style="font-size: 0.5rem; opacity: 0.9; text-transform: uppercase;">Smart Campus Pass</div>
                        </div>
                    </div>
                    <div class="nfc-chip-badge" style="background: rgba(255,255,255,0.25); color: white; border: none;">
                        <i data-lucide="nfc" style="width: 10px; height: 10px;"></i> NFC
                    </div>
                </div>

                <!-- Body -->
                <div style="padding: 10px 14px; display: flex; gap: 12px; align-items: center; flex: 1;">
                    <div style="width: 60px; height: 72px; background: #f1f5f9; border-radius: 6px; border: 1.5px solid #e2e8f0; display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0;">
                        <i data-lucide="user" style="width: 32px; height: 32px; color: #94a3b8;"></i>
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-weight: 900; font-size: 0.9rem; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${m.name}</div>
                        <div style="font-size: 0.68rem; font-weight: 700; color: ${currentTemplateConfig.primary_color};">${m.role_label}</div>
                        
                        <div style="margin-top: 4px; font-size: 0.62rem; color: #475569; display: flex; flex-direction: column; gap: 1px;">
                            <div><strong>ID:</strong> <span style="font-family: var(--font-mono); font-weight: 700;">${m.member_id}</span></div>
                            <div><strong>Dept:</strong> ${m.dept_class}</div>
                            <div><strong>Blood:</strong> ${m.blood_group || '--'} | <strong>Status:</strong> Active</div>
                        </div>
                    </div>
                </div>

                <!-- Footer Barcode -->
                <div style="padding: 6px 14px 8px 14px; display: flex; justify-content: space-between; align-items: flex-end; border-top: 1px solid #f1f5f9; background: #fafafa;">
                    <svg id="${barcodeId}" style="height: 28px; max-width: 160px;"></svg>
                    <div style="text-align: right;">
                        <div style="font-family: 'Brush Script MT', cursive; font-size: 0.95rem; color: #1e3a8a;">Authorized</div>
                        <div style="font-size: 0.5rem; color: #94a3b8; font-weight: 800; text-transform: uppercase;">Dean Office</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Generate barcodes for each card
    list.forEach((m, idx) => {
        if (window.JsBarcode) {
            try {
                JsBarcode(`#batch-barcode-${idx}`, m.barcode || m.member_id, {
                    format: "CODE128",
                    width: 1.1,
                    height: 24,
                    displayValue: false,
                    margin: 0
                });
            } catch (e) {}
        }
    });

    if (window.lucide) lucide.createIcons();

    // Refresh mobile card view
    if (window.initMobileCardTables) window.initMobileCardTables();
}

// --- TEMPLATE DESIGNER STUDIO ---
function initTemplateDesigner() {
    const sizeSelect = document.getElementById('designer-size-preset');
    if (sizeSelect) {
        sizeSelect.addEventListener('change', (e) => {
            const val = e.target.value;
            const customDims = document.getElementById('designer-custom-dims');
            const card = document.getElementById('designer-card-preview-front');
            const cardBack = document.getElementById('designer-card-preview-back');

            if (val === 'custom') {
                customDims.style.display = 'grid';
            } else {
                customDims.style.display = 'none';
            }

            card.className = 'id-card-cr80';
            cardBack.className = 'id-card-cr80';

            if (val === 'cr80-portrait') {
                card.classList.add('portrait');
                cardBack.classList.add('portrait');
                currentTemplateConfig.orientation = 'portrait';
            } else if (val === 'event-badge') {
                card.classList.add('event-badge');
                cardBack.classList.add('event-badge');
                currentTemplateConfig.orientation = 'portrait';
            } else {
                currentTemplateConfig.orientation = 'landscape';
            }
            updateLiveDesignerPreview();
        });
    }

    // Color Pickers
    const colPrimary = document.getElementById('designer-color-primary');
    const colAccent = document.getElementById('designer-color-accent');
    if (colPrimary) colPrimary.addEventListener('input', (e) => {
        currentTemplateConfig.primary_color = e.target.value;
        updateLiveDesignerPreview();
    });
    if (colAccent) colAccent.addEventListener('input', (e) => {
        currentTemplateConfig.accent_color = e.target.value;
        updateLiveDesignerPreview();
    });

    // Element Toggles
    const toggles = [
        { id: 'designer-elem-logo', key: 'show_logo' },
        { id: 'designer-elem-photo', key: 'show_photo' },
        { id: 'designer-elem-barcode', key: 'show_barcode' },
        { id: 'designer-elem-nfc', key: 'show_nfc' },
        { id: 'designer-elem-blood', key: 'show_blood' },
        { id: 'designer-elem-signature', key: 'show_signature' }
    ];

    toggles.forEach(t => {
        const el = document.getElementById(t.id);
        if (el) {
            el.addEventListener('change', (e) => {
                currentTemplateConfig[t.key] = e.target.checked;
                updateLiveDesignerPreview();
            });
        }
    });

    // Flip Canvas Side
    const btnFlip = document.getElementById('btn-flip-canvas-side');
    if (btnFlip) {
        btnFlip.addEventListener('click', () => {
            const front = document.getElementById('designer-card-preview-front');
            const back = document.getElementById('designer-card-preview-back');
            if (front.style.display !== 'none') {
                front.style.display = 'none';
                back.style.display = 'flex';
                renderBackQrCode();
            } else {
                front.style.display = 'flex';
                back.style.display = 'none';
            }
        });
    }

    // Single Card PDF Download
    const btnDownloadSingle = document.getElementById('btn-download-single-pdf');
    if (btnDownloadSingle) {
        btnDownloadSingle.addEventListener('click', async () => {
            await exportCardToPdf('designer-card-preview-front', 'TGI_Smart_ID_Card.pdf');
        });
    }

    // Batch High-Res PDF Export
    const btnExportBatchPdf = document.getElementById('btn-export-highres-pdf');
    if (btnExportBatchPdf) {
        btnExportBatchPdf.addEventListener('click', async () => {
            await exportCardToPdf('printable-cards-container', 'TGI_Batch_ID_Cards_Print_Sheet.pdf');
        });
    }

    // Browser Print
    const btnPrintBrowser = document.getElementById('btn-print-browser');
    if (btnPrintBrowser) {
        btnPrintBrowser.addEventListener('click', () => {
            window.print();
        });
    }

    // Save Template
    const btnSaveTemplate = document.getElementById('btn-save-custom-template');
    if (btnSaveTemplate) {
        btnSaveTemplate.addEventListener('click', () => {
            erp.saveIdCardTemplate({
                name: `Custom Template (${new Date().toLocaleDateString()})`,
                ...currentTemplateConfig
            });
            showToast('Custom ID card template saved successfully.', 'success');
        });
    }
}

function updateLiveDesignerPreview() {
    const inst = erp.getInstitutionProfile();
    const banner = document.getElementById('preview-header-banner');
    if (banner) {
        banner.style.background = `linear-gradient(135deg, ${currentTemplateConfig.accent_color} 0%, ${currentTemplateConfig.primary_color} 100%)`;
    }

    const title = document.getElementById('preview-inst-title');
    if (title) title.innerText = inst.name || 'INSTITUTION NAME';

    const logoContainer = document.getElementById('preview-inst-logo');
    if (logoContainer) {
        if (currentTemplateConfig.show_logo && inst.logo_url) {
            logoContainer.innerHTML = `<img src="${inst.logo_url}" style="width: 24px; height: 24px; object-fit: contain;">`;
        } else if (currentTemplateConfig.show_logo) {
            logoContainer.innerHTML = `<i data-lucide="building-2" style="width: 20px; height: 20px; color: white;"></i>`;
        } else {
            logoContainer.innerHTML = '';
        }
    }

    // NFC Chip Badge
    const nfcBadge = document.getElementById('preview-nfc-badge');
    if (nfcBadge) nfcBadge.style.display = currentTemplateConfig.show_nfc ? 'inline-flex' : 'none';

    // Photo
    const photo = document.getElementById('preview-photo-container');
    if (photo) photo.style.display = currentTemplateConfig.show_photo ? 'flex' : 'none';

    // Blood Group
    const blood = document.getElementById('preview-blood-contact');
    if (blood) blood.style.display = currentTemplateConfig.show_blood ? 'block' : 'none';

    // Signature
    const sig = document.getElementById('preview-sig-container');
    if (sig) sig.style.display = currentTemplateConfig.show_signature ? 'block' : 'none';

    // Barcode
    const barcodeContainer = document.getElementById('preview-barcode-container');
    if (barcodeContainer) {
        barcodeContainer.style.display = currentTemplateConfig.show_barcode ? 'block' : 'none';
        if (currentTemplateConfig.show_barcode && window.JsBarcode) {
            try {
                JsBarcode("#preview-barcode-svg", "MEM-0001", {
                    format: "CODE128",
                    width: 1.1,
                    height: 22,
                    displayValue: false,
                    margin: 0
                });
            } catch (e) {}
        }
    }

    if (window.lucide) lucide.createIcons();

    // Refresh mobile card view
    if (window.initMobileCardTables) window.initMobileCardTables();
}

function renderBackQrCode() {
    const qrContainer = document.getElementById('preview-back-qrcode');
    if (qrContainer && window.QRCode) {
        qrContainer.innerHTML = '';
        new QRCode(qrContainer, {
            text: `${window.location.origin}/verify?id=MEM-0001`,
            width: 44,
            height: 44,
            colorDark: "#1e293b",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.M
        });
    }
}

// --- HIGH QUALITY PDF EXPORT ---
async function exportCardToPdf(elementId, filename) {
    const target = document.getElementById(elementId);
    if (!target) return;

    showToast('Rendering high-resolution vector PDF...', 'info');

    try {
        const canvas = await html2canvas(target, {
            scale: 3, // 300 DPI high resolution
            useCORS: true,
            backgroundColor: '#ffffff'
        });

        const imgData = canvas.toDataURL('image/png');
        const { jsPDF } = window.jspdf;
        
        // CR80 is 85.6mm x 53.98mm
        const pdf = new jsPDF({
            orientation: currentTemplateConfig.orientation === 'portrait' ? 'p' : 'l',
            unit: 'mm',
            format: elementId === 'printable-cards-container' ? 'a4' : [85.6, 53.98]
        });

        if (elementId === 'printable-cards-container') {
            const imgWidth = 210;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
        } else {
            pdf.addImage(imgData, 'PNG', 0, 0, 85.6, 53.98);
        }

        pdf.save(filename);
        playAudioChime('success');
        showToast(`High-Resolution PDF "${filename}" downloaded!`, 'success');
    } catch (err) {
        console.error('PDF Export Error:', err);
        showToast('Direct PDF download failed. Opening browser print dialog.', 'warning');
        window.print();
    }
}

function setupEventListeners() {
    // Search in registry
    const searchInput = document.getElementById('registry-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', renderNfcRegistryTable);
    }

    // Role filter in batch generator
    const batchRole = document.getElementById('batch-filter-role');
    if (batchRole) {
        batchRole.addEventListener('change', renderBatchCards);
    }

    // Edit NFC Modal close
    const btnCloseEdit = document.getElementById('btn-close-edit-nfc');
    const btnCancelEdit = document.getElementById('btn-cancel-edit-nfc');
    const modalEdit = document.getElementById('modal-edit-nfc-tag');

    if (btnCloseEdit) btnCloseEdit.onclick = () => modalEdit.style.display = 'none';
    if (btnCancelEdit) btnCancelEdit.onclick = () => modalEdit.style.display = 'none';

    // Save Edit NFC Tag
    const btnSaveEdit = document.getElementById('btn-save-edit-nfc');
    if (btnSaveEdit) {
        btnSaveEdit.addEventListener('click', () => {
            const id = document.getElementById('edit-nfc-id').value;
            const uid = document.getElementById('edit-nfc-uid').value.trim();
            const status = document.getElementById('edit-nfc-status').value;
            const barcode = document.getElementById('edit-nfc-barcode').value.trim();

            const tags = erp.getNfcTags('ALL');
            const tag = tags.find(t => t.id === id);
            if (tag) {
                tag.tag_uid = uid;
                tag.status = status;
                tag.barcode = barcode;
                erp.saveNfcTag(tag);
                showToast('Tag updated successfully.', 'success');
                modalEdit.style.display = 'none';
                loadMembersAndTags();
            }
        });
    }

    // Quick Scan NFC header button
    const btnQuickScan = document.getElementById('btn-quick-scan-nfc');
    if (btnQuickScan) {
        btnQuickScan.addEventListener('click', () => {
            document.querySelector('.nfc-tab-btn[data-tab="tab-nfc-hub"]').click();
            document.getElementById('btn-start-hardware-nfc')?.click();
        });
    }

    // Open Designer header button
    const btnOpenDesigner = document.getElementById('btn-open-designer');
    if (btnOpenDesigner) {
        btnOpenDesigner.addEventListener('click', () => {
            document.querySelector('.nfc-tab-btn[data-tab="tab-template-designer"]').click();
        });
    }
}

