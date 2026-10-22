// staff.js - Faculty & Staff Management, Smartcard Credentialing & Roles
import { erp } from './erp_service.js';
import { hardwareService } from './hardware.js';
import { showToast, playAudioChime, printIdCard } from './ui.js';

let selectedStaffIds = new Set();
const bulkBar = window.initUniversalBulkBar ? window.initUniversalBulkBar() : null;

function updateStaffBulkBar() {
    if (!bulkBar) return;
    const count = selectedStaffIds.size;
    bulkBar.update(count, {
        onDuplicate: async () => {
            const ids = Array.from(selectedStaffIds);
            window.app.confirm(`Duplicate ${ids.length} selected staff member(s)? New employee IDs will be assigned.`, "Bulk Duplicate Staff", async () => {
                for (const id of ids) {
                    await duplicateStaffInternal(id, false);
                }
                selectedStaffIds.clear();
                bulkBar.hide();
                window.app.toast(`Duplicated ${ids.length} staff records successfully!`, 'success', 'Bulk Duplicated');
                renderStaff();
            });
        },
        onDelete: async () => {
            const ids = Array.from(selectedStaffIds);
            window.app.confirm(`Delete ${ids.length} selected faculty / staff records?`, "Bulk Delete Staff", async () => {
                for (const id of ids) {
                    await erp.deleteStaff(id);
                }
                selectedStaffIds.clear();
                bulkBar.hide();
                window.app.toast(`Deleted ${ids.length} staff records.`, 'info', 'Records Removed');
                renderStaff();
            });
        },
        onClear: () => {
            selectedStaffIds.clear();
            const selectAll = document.getElementById('select-all-staff');
            if (selectAll) selectAll.checked = false;
            renderStaff();
            bulkBar.hide();
        }
    });
}

async function duplicateStaffInternal(id, notify = true) {
    const member = erp.getStaff('ALL').find(s => s.id === id);
    if (!member) return;
    const rnd = Math.floor(100 + Math.random() * 900);
    const newEmpId = `EMP-${rnd}`;
    const cloned = {
        ...member,
        id: `staff-${Date.now()}-${rnd}`,
        employee_id: newEmpId,
        name: `${member.name} (Copy)`,
        email: member.email ? `copy.${rnd}.${member.email}` : `staff.${rnd}@tgi.edu`,
        nfc_tag_id: '',
        qr_code: `QR-${newEmpId}`
    };
    await erp.saveStaff(cloned);
    if (notify) {
        window.app.toast(`Faculty member "${cloned.name}" duplicated!`, 'success', 'Staff Duplicated');
        renderStaff();
    }
}

window.duplicateStaff = function(id) {
    const s = staff.find(item => item.id === id);
    const name = s ? s.name : 'this staff member';
    const msg = `Duplicate staff record "${name}"? A cloned record will be created.`;
    if (window.app?.confirm) {
        window.app.confirm(msg, "Duplicate Staff Member", () => duplicateStaffInternal(id, true));
    } else if (confirm(msg)) {
        duplicateStaffInternal(id, true);
    }
};


document.addEventListener('DOMContentLoaded', () => {
    initCampusDropdowns();
    renderStaff();
    setupEventListeners();

    window.addEventListener('campusChanged', () => {
        initCampusDropdowns();
        renderStaff();
    });
});

function initCampusDropdowns() {
    const campuses = erp.getCampuses();
    const stCampusSelect = document.getElementById('st-campus');
    if (stCampusSelect) {
        stCampusSelect.innerHTML = campuses.map(c => `<option value="${c.id}">${c.name} (${c.code})</option>`).join('');
        stCampusSelect.value = erp.getActiveCampusId() !== 'ALL' ? erp.getActiveCampusId() : (campuses[0]?.id || '');
    }
}

function renderStaff() {
    const activeCampusId = erp.getActiveCampusId();
    const staff = erp.getStaff(activeCampusId);

    // Update KPI counters
    document.getElementById('kpi-total-staff').innerText = staff.length;
    document.getElementById('kpi-teachers').innerText = staff.filter(s => s.role === 'TEACHER').length;
    document.getElementById('kpi-librarians').innerText = staff.filter(s => s.role === 'LIBRARIAN').length;
    document.getElementById('kpi-nfc-staff').innerText = staff.filter(s => s.nfc_tag_id).length;

    const tbody = document.getElementById('staff-tbody');
    const search = document.getElementById('staff-search')?.value.toLowerCase() || '';
    const roleFilter = document.getElementById('staff-role-filter')?.value || 'ALL';

    const filtered = staff.filter(s => {
        const matchesSearch = !search ||
            s.name.toLowerCase().includes(search) ||
            s.employee_id.toLowerCase().includes(search) ||
            (s.designation && s.designation.toLowerCase().includes(search)) ||
            (s.email && s.email.toLowerCase().includes(search));
        const matchesRole = roleFilter === 'ALL' || s.role === roleFilter;
        return matchesSearch && matchesRole;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="padding: 2.5rem 1rem; text-align: center; color: var(--text-muted);">
                    <i data-lucide="users" style="width: 32px; height: 32px; opacity: 0.4; margin-bottom: 0.5rem;"></i>
                    <div style="font-weight: 600; color: var(--text-primary);">No faculty or staff found</div>
                    <p style="font-size: 0.8rem; margin-top: 0.25rem;">Add faculty members using the "Add Faculty / Staff" button above.</p>
                </td>
            </tr>
        `;
        if (window.lucide) lucide.createIcons();

    // Refresh mobile card view
    if (window.initMobileCardTables) window.initMobileCardTables();
        return;
    }

    tbody.innerHTML = filtered.map(s => {
        let roleBadge = `<span class="badge badge-brand">${s.role}</span>`;
        if (s.role === 'CAMPUS_HEAD') roleBadge = `<span class="badge badge-warning">DEAN / HEAD</span>`;
        if (s.role === 'TEACHER') roleBadge = `<span class="badge badge-success">PROFESSOR</span>`;

        return `
            <tr>
                <td class="checkbox-cell" style="text-align: center;"><input type="checkbox" class="custom-checkbox row-staff-cb" data-id="${s.id}" ${selectedStaffIds.has(s.id) ? "checked" : ""}></td>
                <td>
                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                        <div style="width: 36px; height: 36px; border-radius: 8px; background: var(--brand-gradient); color: white; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.85rem;">
                            ${s.name.charAt(0)}
                        </div>
                        <div>
                            <div style="font-weight: 700; color: var(--text-primary);">${s.name}</div>
                            <div style="font-size: 0.75rem; color: var(--text-muted);">${s.email || 'No email registered'}</div>
                        </div>
                    </div>
                </td>
                <td style="font-family: var(--font-mono); font-weight: 600; color: var(--brand-primary);">${s.employee_id}</td>
                <td>
                    <div style="font-weight: 600; font-size: 0.85rem;">${s.designation || 'Faculty Member'}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">${s.department_id || 'Academic Dept'}</div>
                </td>
                <td>${roleBadge}</td>
                <td>
                    <div style="display: flex; align-items: center; gap: 0.35rem; font-family: var(--font-mono); font-size: 0.75rem;">
                        <i data-lucide="radio" style="width: 14px; color: ${s.nfc_tag_id ? 'var(--color-success)' : 'var(--text-muted)'};"></i>
                        <span>${s.nfc_tag_id || 'Not Paired'}</span>
                    </div>
                </td>
                <td>
                    <span class="badge badge-success"><span class="badge-dot"></span> ACTIVE</span>
                </td>
                <td style="text-align: right;">
                    <div style="display: flex; gap: 0.4rem; justify-content: flex-end;">
                        <button class="btn btn-outline btn-print-badge" data-id="${s.id}" title="Print Smart ID Badge" style="padding: 0.35rem 0.6rem; font-size: 0.75rem;">
                            <i data-lucide="printer" style="width: 14px;"></i>
                        </button>
                        <button class="btn btn-outline btn-duplicate-staff" data-id="${s.id}" title="Duplicate Staff Member" style="padding: 0.35rem 0.6rem; font-size: 0.75rem;"><i data-lucide="copy" style="width: 14px;"></i></button>
                        <button class="btn btn-outline btn-edit-staff" data-id="${s.id}" title="Edit Record" style="padding: 0.35rem 0.6rem; font-size: 0.75rem;">
                            <i data-lucide="edit" style="width: 14px;"></i>
                        </button>
                        <button class="btn btn-outline btn-delete-staff" data-id="${s.id}" title="Delete Record" style="padding: 0.35rem 0.6rem; font-size: 0.75rem; color: var(--color-danger);">
                            <i data-lucide="trash-2" style="width: 14px;"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    
    // Attach bulk checkboxes
    const selectAllStaff = document.getElementById('select-all-staff');
    if (selectAllStaff) {
        const visibleIds = filtered.map(s => s.id);
        selectAllStaff.checked = visibleIds.length > 0 && visibleIds.every(id => selectedStaffIds.has(id));
        selectAllStaff.onchange = (e) => {
            if (e.target.checked) visibleIds.forEach(id => selectedStaffIds.add(id));
            else visibleIds.forEach(id => selectedStaffIds.delete(id));
            renderStaff();
            updateStaffBulkBar();
        };
    }

    tbody.querySelectorAll('.row-staff-cb').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const id = cb.dataset.id;
            if (e.target.checked) selectedStaffIds.add(id);
            else selectedStaffIds.delete(id);
            updateStaffBulkBar();
            if (selectAllStaff) {
                const visibleIds = filtered.map(s => s.id);
                selectAllStaff.checked = visibleIds.every(cid => selectedStaffIds.has(cid));
            }
        });
    });

    tbody.querySelectorAll('.btn-duplicate-staff').forEach(btn => {
        btn.addEventListener('click', () => {
            window.duplicateStaff(btn.dataset.id);
        });
    });

    // Attach actions
    tbody.querySelectorAll('.btn-print-badge').forEach(btn => {
        btn.addEventListener('click', () => {
            const member = erp.getStaff('ALL').find(s => s.id === btn.dataset.id);
            if (member) {
                printIdCard({
                    name: member.name,
                    id: member.employee_id,
                    role: member.designation || member.role,
                    barcode: member.employee_id,
                    nfc: member.nfc_tag_id || `NFC-${member.employee_id}`
                });
            }
        });
    });

    tbody.querySelectorAll('.btn-edit-staff').forEach(btn => {
        btn.addEventListener('click', () => {
            const member = erp.getStaff('ALL').find(s => s.id === btn.dataset.id);
            if (member) {
                document.getElementById('staff-id').value = member.id;
                document.getElementById('st-campus').value = member.campus_id || erp.getActiveCampusId();
                document.getElementById('st-emp-id').value = member.employee_id;
                document.getElementById('st-name').value = member.name;
                document.getElementById('st-designation').value = member.designation || '';
                document.getElementById('st-role').value = member.role || 'TEACHER';
                document.getElementById('st-dept').value = member.department_id || '';
                document.getElementById('st-email').value = member.email || '';
                document.getElementById('st-phone').value = member.phone || '';
                document.getElementById('st-nfc').value = member.nfc_tag_id || '';
                document.getElementById('modal-staff-title').innerText = 'Edit Faculty / Staff Member';
                document.getElementById('modal-staff').style.display = 'flex';
            }
        });
    });

    tbody.querySelectorAll('.btn-delete-staff').forEach(btn => {
        btn.addEventListener('click', () => {
            if (confirm('Are you sure you want to remove this staff member?')) {
                erp.deleteStaff(btn.dataset.id);
                showToast('Staff record removed', 'info');
                renderStaff();
            }
        });
    });

    if (window.lucide) lucide.createIcons();

    // Refresh mobile card view
    if (window.initMobileCardTables) window.initMobileCardTables();
}

function setupEventListeners() {
    document.getElementById('staff-search')?.addEventListener('input', renderStaff);
    document.getElementById('staff-role-filter')?.addEventListener('change', renderStaff);

    const modal = document.getElementById('modal-staff');
    document.getElementById('btn-add-staff')?.addEventListener('click', () => {
        document.getElementById('form-staff').reset();
        document.getElementById('staff-id').value = '';
        document.getElementById('modal-staff-title').innerText = 'Register Faculty / Staff Member';
        modal.style.display = 'flex';
    });

    document.getElementById('btn-close-staff-modal')?.addEventListener('click', () => modal.style.display = 'none');
    document.getElementById('btn-cancel-staff')?.addEventListener('click', () => modal.style.display = 'none');

    // Hardware NFC tap listener for staff form
    document.getElementById('btn-scan-staff-nfc')?.addEventListener('click', async () => {
        showToast('Tap physical NFC tag or badge against reader...', 'info');
        await hardwareService.initNFCReader((tagId) => {
            document.getElementById('st-nfc').value = tagId;
            playAudioChime('SUCCESS');
            showToast(`NFC Smartcard linked: ${tagId}`, 'success');
        });
    });

    document.getElementById('form-staff')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const staffObj = {
            id: document.getElementById('staff-id').value || undefined,
            campus_id: document.getElementById('st-campus').value,
            employee_id: document.getElementById('st-emp-id').value.trim(),
            name: document.getElementById('st-name').value.trim(),
            designation: document.getElementById('st-designation').value.trim(),
            role: document.getElementById('st-role').value,
            department_id: document.getElementById('st-dept').value.trim(),
            email: document.getElementById('st-email').value.trim(),
            phone: document.getElementById('st-phone').value.trim(),
            nfc_tag_id: document.getElementById('st-nfc').value.trim() || `NFC-${document.getElementById('st-emp-id').value.trim()}`,
            qr_code: `QR-${document.getElementById('st-emp-id').value.trim()}`,
            status: 'ACTIVE'
        };

        erp.saveStaff(staffObj);
        playAudioChime('SUCCESS');
        showToast('Faculty member saved successfully!', 'success');
        modal.style.display = 'none';
        renderStaff();
    });
}

