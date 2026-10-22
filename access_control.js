
let selectedAdminIds = new Set();
const bulkBar = window.initUniversalBulkBar ? window.initUniversalBulkBar() : null;

function updateAdminBulkBar() {
    if (!bulkBar) return;
    const count = selectedAdminIds.size;
    bulkBar.update(count, {
        onDuplicate: async () => {
            const ids = Array.from(selectedAdminIds);
            window.app.confirm(`Duplicate ${ids.length} selected admin account(s)?`, "Bulk Duplicate Admins", async () => {
                for (const id of ids) await duplicateAdminInternal(id, false);
                selectedAdminIds.clear();
                bulkBar.hide();
                window.app.toast(`Duplicated ${ids.length} admin accounts!`, 'success');
                renderAdminAccounts();
            });
        },
        onDelete: async () => {
            const ids = Array.from(selectedAdminIds);
            window.app.confirm(`Delete ${ids.length} selected admin accounts?`, "Bulk Delete Admins", async () => {
                for (const id of ids) {
                    try { await erp.deleteAdminAccount(id); } catch(e) {}
                }
                selectedAdminIds.clear();
                bulkBar.hide();
                window.app.toast(`Deleted ${ids.length} admin accounts.`, 'info');
                renderAdminAccounts();
            });
        },
        onClear: () => {
            selectedAdminIds.clear();
            const selectAll = document.getElementById('select-all-admins');
            if (selectAll) selectAll.checked = false;
            renderAdminAccounts();
            bulkBar.hide();
        }
    });
}

async function duplicateAdminInternal(id, notify = true) {
    const admin = erp.getAdminAccounts().find(a => a.id === id);
    if (!admin) return;
    const rnd = Math.floor(100 + Math.random() * 900);
    const cloned = {
        ...admin,
        id: `admin-${Date.now()}-${rnd}`,
        name: `${admin.name} (Copy)`,
        email: `copy.${rnd}.${admin.email}`,
        role: admin.role === 'SUPER_ADMIN' ? 'SYSTEM_ADMIN' : admin.role
    };
    await erp.createAdminAccount(cloned);
    if (notify) {
        window.app.toast(`Admin account "${cloned.name}" duplicated!`, 'success', 'Admin Duplicated');
        renderAdminAccounts();
    }
}
window.duplicateAdminAccount = function(id) {
    const a = adminAccounts.find(item => item.id === id);
    const name = a ? a.name : 'this admin account';
    const msg = `Duplicate administrator account "${name}"? A cloned administrator account will be created.`;
    if (window.app?.confirm) window.app.confirm(msg, "Duplicate Admin Account", () => duplicateAdminInternal(id, true));
    else if (confirm(msg)) duplicateAdminInternal(id, true);
};

// access_control.js - Role-Based Access Control (RBAC) Governance Matrix & Admin Delegations
import { erp } from './erp_service.js';
import { playSynthSound } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
    renderAdminAccounts();
    renderRbacMatrix();
    setupEventListeners();
    setupAdminModalListeners();
    setupEditAdminModalListeners();

    // Background sync from Supabase
    if (typeof erp?.syncAdminAccountsFromSupabase === 'function') {
        erp.syncAdminAccountsFromSupabase().then(() => renderAdminAccounts()).catch(() => {});
    }
});

const ROLE_LABELS = {
    'SUPER_ADMIN': { title: 'Super Administrator', badge: 'ROOT', color: 'var(--brand-primary)' },
    'SYSTEM_ADMIN': { title: 'System Administrator (Full Access)', badge: 'ADMIN', color: '#3b82f6' },
    'INSTITUTION_HEAD': { title: 'Institution Chancellor / Head', badge: 'EXECUTIVE', color: 'var(--brand-accent)' },
    'CAMPUS_HEAD': { title: 'Campus Head / Dean', badge: 'DEAN', color: 'var(--color-warning)' },
    'TEACHER': { title: 'Professor / Teacher', badge: 'FACULTY', color: 'var(--color-success)' },
    'LIBRARIAN': { title: 'Librarian & Officers', badge: 'OFFICER', color: 'var(--brand-primary)' },
    'LAB_ADMIN': { title: 'Computer Lab Administrator', badge: 'ADMIN', color: 'var(--brand-accent)' },
    'EVENT_CONDUCTOR': { title: 'Event Hall Conductor', badge: 'CONDUCTOR', color: 'var(--color-warning)' },
    'STUDENT': { title: 'Student Member', badge: 'PATRON', color: 'var(--text-muted)' }
};

const PERMISSION_COLUMNS = [
    { key: 'can_view_all_campuses', label: 'All Campuses' },
    { key: 'can_manage_catalog', label: 'Book Catalog' },
    { key: 'can_manage_circulation', label: 'Circulation' },
    { key: 'can_manage_labs', label: 'Lab Tracker' },
    { key: 'can_take_attendance', label: 'Periods & Attendance' },
    { key: 'can_manage_events', label: 'Event Halls' },
    { key: 'can_approve_requests', label: 'Approvals' },
    { key: 'can_access_reports', label: 'Reports' }
];

function renderAdminAccounts() {
    const tbody = document.getElementById('admin-accounts-tbody');
    if (!tbody) return;

    const admins = erp.getAdminAccounts();
    const campuses = erp.getCampuses();

    const badge = document.getElementById('admin-count-badge');
    if (badge) badge.innerText = `${admins.length} Active`;

    if (admins.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
                    <i data-lucide="shield-check" style="width: 36px; height: 36px; opacity: 0.35; margin-bottom: 0.5rem;"></i>
                    <div style="font-weight: 700; color: var(--text-primary);">No Delegated Administrators</div>
                    <p style="font-size: 0.8rem; margin: 0.25rem 0 0.75rem 0;">Only the root Super Administrator currently holds full credentials.</p>
                </td>
            </tr>
        `;
        if (window.lucide) lucide.createIcons();
        return;
    }

    tbody.innerHTML = admins.map(a => {
        const isSuperAdmin = a.role === 'SUPER_ADMIN';
        const roleLabel = isSuperAdmin ? 'Super Administrator' : (a.role === 'SYSTEM_ADMIN' ? 'System Administrator (Access All)' : a.role);
        const campusName = a.campus_id === 'ALL' ? '🌐 Universal (All Campuses)' : (campuses.find(c => c.id === a.campus_id)?.name || a.campus_id);
        const dateStr = a.created_at ? new Date(a.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'Permanent';

        return `
            <tr>
                <td class="checkbox-cell" style="text-align: center;">
                    ${isSuperAdmin ? "" : `<input type="checkbox" class="custom-checkbox row-admin-cb" data-id="${a.id}" ${selectedAdminIds.has(a.id) ? "checked" : ""}>`}
                </td>
                <td>
                    <div style="display: flex; align-items: center; gap: 0.65rem;">
                        <div style="width: 34px; height: 34px; border-radius: 8px; background: ${isSuperAdmin ? 'rgba(245,158,11,0.12)' : 'rgba(59,130,246,0.12)'}; color: ${isSuperAdmin ? '#d97706' : '#2563eb'}; display: flex; align-items: center; justify-content: center; font-weight: 800;">
                            <i data-lucide="${isSuperAdmin ? 'crown' : 'shield-check'}" style="width: 17px; height: 17px;"></i>
                        </div>
                        <div>
                            <div style="font-weight: 700; color: var(--text-primary); font-size: 0.92rem;">${a.name}</div>
                            <div style="font-size: 0.75rem; color: var(--text-muted);">${a.designation || 'Administrator'}</div>
                        </div>
                    </div>
                </td>
                <td>
                    <span style="font-family: var(--font-mono); font-size: 0.85rem; font-weight: 600; color: var(--text-primary);">${a.email}</span>
                </td>
                <td>
                    <span class="badge" style="background: ${isSuperAdmin ? 'rgba(245,158,11,0.15)' : 'rgba(59,130,246,0.15)'}; color: ${isSuperAdmin ? '#d97706' : '#2563eb'}; font-size: 0.72rem; font-weight: 800; padding: 0.2rem 0.6rem;">
                        ${roleLabel}
                    </span>
                </td>
                <td>
                    <span style="font-size: 0.82rem; color: var(--text-secondary); font-weight: 600;">${campusName}</span>
                </td>
                <td>
                    <span class="badge badge-success" style="font-size: 0.68rem; padding: 0.15rem 0.5rem;">ACTIVE</span>
                </td>
                <td>
                    <span style="font-size: 0.78rem; color: var(--text-muted);">${dateStr}</span>
                </td>
                <td style="text-align: right;">
                    ${isSuperAdmin ? `
                        <span style="font-size: 0.72rem; color: var(--text-muted); font-weight: 700; padding: 0.3rem 0.6rem;">Root Superadmin</span>
                    ` : `
                        <button class="btn btn-outline btn-sm btn-edit-admin" data-id="${a.id}" title="Edit Admin Credentials" style="font-size: 0.75rem; padding: 0.3rem 0.65rem; margin-right: 0.35rem; color: var(--brand-primary); border-color: rgba(59,130,246,0.3);"><i data-lucide="edit-3" style="width: 13px; height: 13px;"></i> Edit</button>
                        <button class="btn btn-outline btn-sm" onclick="window.duplicateAdminAccount('${a.id}')" title="Duplicate Admin" style="font-size: 0.75rem; padding: 0.3rem 0.65rem; margin-right: 0.35rem;"><i data-lucide="copy" style="width: 13px; height: 13px;"></i></button>
                        <button class="btn btn-outline btn-sm btn-delete-admin" data-id="${a.id}" data-name="${a.name}" style="color: #ef4444; border-color: rgba(239,68,68,0.3); font-size: 0.75rem; padding: 0.3rem 0.65rem;">
                            <i data-lucide="trash-2" style="width: 13px; height: 13px;"></i> Delete
                        </button>
                    `}
                </td>
            </tr>
        `;
    }).join('');

    const selectAllAdmins = document.getElementById('select-all-admins');
    if (selectAllAdmins) {
        const selectableAdmins = admins.filter(a => a.role !== 'SUPER_ADMIN');
        selectAllAdmins.checked = selectableAdmins.length > 0 && selectableAdmins.every(a => selectedAdminIds.has(a.id));
        selectAllAdmins.onchange = (e) => {
            if (e.target.checked) selectableAdmins.forEach(a => selectedAdminIds.add(a.id));
            else selectableAdmins.forEach(a => selectedAdminIds.delete(a.id));
            renderAdminAccounts();
            updateAdminBulkBar();
        };
    }

    tbody.querySelectorAll('.row-admin-cb').forEach(cb => {
        cb.addEventListener('change', () => {
            if (cb.checked) selectedAdminIds.add(cb.dataset.id);
            else selectedAdminIds.delete(cb.dataset.id);
            updateAdminBulkBar();
            if (selectAllAdmins) {
                const selectableAdmins = admins.filter(a => a.role !== 'SUPER_ADMIN');
                selectAllAdmins.checked = selectableAdmins.every(a => selectedAdminIds.has(a.id));
            }
        });
    });

    tbody.querySelectorAll('.btn-delete-admin').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            const name = btn.dataset.name;
            window.app.confirm(`Are you sure you want to revoke and delete admin privileges for "${name}"?`, "Revoke Admin Authority", async () => {
                try {
                    await erp.deleteAdminAccount(id);
                    window.app.toast(`Admin account "${name}" revoked and removed.`, "info", "Authority Revoked");
                    renderAdminAccounts();
                } catch (err) {
                    window.app.toast(err.message, "error");
                }
            });
        });
    });

    if (window.lucide) lucide.createIcons();

    // Refresh mobile card view
    if (window.initMobileCardTables) window.initMobileCardTables();
}

function renderRbacMatrix() {
    const permissions = erp.getPermissions();
    const tbody = document.getElementById('rbac-tbody');
    if (!tbody) return;

    document.getElementById('kpi-total-roles').innerText = permissions.length;

    tbody.innerHTML = permissions.map(p => {
        const meta = ROLE_LABELS[p.role] || { title: p.role, badge: 'ROLE', color: 'var(--text-muted)' };
        const isSuperAdmin = p.role === 'SUPER_ADMIN' || p.role === 'SYSTEM_ADMIN';

        const checkToggles = PERMISSION_COLUMNS.map(col => {
            const isChecked = isSuperAdmin ? true : !!p[col.key];
            const disabledAttr = p.role === 'SUPER_ADMIN' ? 'disabled' : '';

            return `
                <td style="text-align: center; vertical-align: middle;">
                    <label class="rbac-switch" title="${p.role === 'SUPER_ADMIN' ? 'Root Superadmin: Full Authority Granted' : 'Toggle ' + col.label + ' permission'}">
                        <input type="checkbox" class="rbac-toggle" data-role="${p.role}" data-key="${col.key}" ${isChecked ? 'checked' : ''} ${disabledAttr}>
                        <span class="rbac-slider"></span>
                    </label>
                </td>
            `;
        }).join('');

        return `
            <tr>
                <td>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <span class="badge" style="background: rgba(59, 130, 246, 0.1); color: ${meta.color}; font-size: 0.65rem; font-weight: 800;">${meta.badge}</span>
                        <div>
                            <div style="font-weight: 700; color: var(--text-primary); font-size: 0.9rem;">${meta.title}</div>
                            <div style="font-family: var(--font-mono); font-size: 0.72rem; color: var(--text-muted);">${p.role}</div>
                        </div>
                    </div>
                </td>
                ${checkToggles}
            </tr>
        `;
    }).join('');

    // Attach checkbox changes
    tbody.querySelectorAll('.rbac-toggle:not(:disabled)').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const role = e.target.dataset.role;
            const key = e.target.dataset.key;
            const value = e.target.checked;
            erp.updatePermission(role, key, value);
            playSynthSound('success');
            window.app.toast(`Updated permission "${key}" for ${role}`, 'info');
        });
    });

    if (window.lucide) lucide.createIcons();

    // Refresh mobile card view
    if (window.initMobileCardTables) window.initMobileCardTables();
}

function setupAdminModalListeners() {
    const modal = document.getElementById('modal-create-admin');
    const openBtn = document.getElementById('btn-open-create-admin-modal');
    const closeBtn = document.getElementById('btn-close-create-admin');
    const cancelBtn = document.getElementById('btn-cancel-create-admin');
    const form = document.getElementById('form-create-admin');
    const campusSelect = document.getElementById('new-admin-campus');

    const closeModal = () => {
        modal.classList.remove('active');
        modal.style.display = 'none';
    };

    openBtn?.addEventListener('click', () => {
        // Populate campus options
        if (campusSelect) {
            const campuses = erp.getCampuses();
            let opts = `<option value="ALL">🌐 Universal Multi-Campus Authority (All Branches)</option>`;
            campuses.forEach(c => {
                opts += `<option value="${c.id}">${c.name} (${c.code || 'CAMPUS'})</option>`;
            });
            campusSelect.innerHTML = opts;
        }
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('active'), 10);
    });

    closeBtn?.addEventListener('click', closeModal);
    cancelBtn?.addEventListener('click', closeModal);
    modal?.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('new-admin-name').value.trim();
        const email = document.getElementById('new-admin-email').value.trim();
        const password = document.getElementById('new-admin-password')?.value || '';
        const role = document.getElementById('new-admin-role').value;
        const designation = document.getElementById('new-admin-designation').value.trim();
        const campusId = document.getElementById('new-admin-campus').value;

        if (!name || !email) {
            window.app.toast("Please complete all required admin fields", "warning");
            return;
        }

        if (password && password.length < 6) {
            window.app.toast("Admin password must be at least 6 characters", "warning");
            return;
        }

        const submitBtn = document.getElementById('btn-save-new-admin');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerText = "Authorizing...";
        }

        try {
            await erp.createAdminAccount({
                name,
                email,
                password,
                role,
                designation,
                campus_id: campusId,
                status: 'ACTIVE'
            });

            playSynthSound('success');
            window.app.toast(`Admin account for "${name}" authorized successfully with full access!`, 'success', 'Admin Created');
            closeModal();
            form.reset();
            renderAdminAccounts();
        } catch (err) {
            window.app.toast(err.message || 'Failed to create admin', 'error');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<i data-lucide="shield-plus" style="width: 15px;"></i> Create & Authorize Admin`;
                if (window.lucide) lucide.createIcons();

    // Refresh mobile card view
    if (window.initMobileCardTables) window.initMobileCardTables();
            }
        }
    });
}

function setupEventListeners() {
    document.getElementById('btn-save-rbac')?.addEventListener('click', () => {
        playSynthSound('success');
        window.app.toast('RBAC Security Matrix successfully applied and enforced!', 'success');
    });

    document.getElementById('btn-reset-rbac')?.addEventListener('click', () => {
        window.app.confirm('Reset RBAC matrix back to default institutional policy?', 'Reset Security Policy', () => {
            localStorage.removeItem('erp_permissions');
            window.location.reload();
        });
    });
}



function setupEditAdminModalListeners() {
    const modal = document.getElementById('modal-edit-admin');
    const closeBtn = document.getElementById('btn-close-edit-admin');
    const cancelBtn = document.getElementById('btn-cancel-edit-admin');
    const form = document.getElementById('form-edit-admin');

    const closeModal = () => {
        if (!modal) return;
        modal.classList.remove('active');
        modal.style.display = 'none';
    };

    closeBtn?.addEventListener('click', closeModal);
    cancelBtn?.addEventListener('click', closeModal);
    modal?.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('edit-admin-id')?.value;
        const name = document.getElementById('edit-admin-name')?.value.trim();
        const email = document.getElementById('edit-admin-email')?.value.trim();
        const role = document.getElementById('edit-admin-role')?.value;
        const designation = document.getElementById('edit-admin-designation')?.value.trim();
        const campus_id = document.getElementById('edit-admin-campus')?.value;
        const status = document.getElementById('edit-admin-status')?.value;

        if (!id || !name || !email) {
            window.app.toast("Please fill in all required fields", "warning");
            return;
        }

        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;

        try {
            await erp.updateAdminAccount(id, {
                name,
                email,
                role,
                designation,
                campus_id,
                status
            });

            playSynthSound('success');
            window.app.toast(`Administrator "${name}" updated successfully!`, 'success', 'Admin Updated');
            closeModal();
            renderAdminAccounts();
        } catch (err) {
            console.error("Failed to update admin:", err);
            window.app.toast("Failed to update administrator: " + (err.message || 'Unknown error'), "error");
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    });
}
