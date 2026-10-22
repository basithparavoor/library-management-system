import { supabase } from './supabaseClient.js';

// UI Elements
const tbody = document.getElementById('students-table-body');
const searchInput = document.getElementById('search-students');
const filterDept = document.getElementById('filter-dept');
const filterStatus = document.getElementById('filter-status');
const selectAllCb = document.getElementById('select-all');
const selectionCountBadge = document.getElementById('selection-count');
const btnBatchDelete = document.getElementById('btn-batch-delete');
const rowsPerPageSelect = document.getElementById('rows-per-page');
const btnPrev = document.getElementById('btn-prev-page');
const btnNext = document.getElementById('btn-next-page');
const paginationInfo = document.getElementById('pagination-info');
const pageDisplay = document.getElementById('current-page-display');
const totalCounter = document.getElementById('total-members-counter');

// Modal Elements
const modalAddStudent = document.getElementById('modal-add-student');
const btnAddStudent = document.getElementById('btn-add-student');
const btnCloseModal = document.getElementById('btn-close-student-modal');
const btnCancelStudent = document.getElementById('btn-cancel-student');
const formAddStudent = document.getElementById('form-add-student');
const modalTitle = document.getElementById('modal-student-title');
const addDeptSelect = document.getElementById('add-student-dept');
const addClassSelect = document.getElementById('add-student-class');
const photoInput = document.getElementById('add-student-photo');
const photoPreview = document.getElementById('photo-preview');

let currentEditStudentId = null;

// Data State
let state = {
    allData: [],
    filteredData: [],
    selectedIds: new Set(),
    page: 1,
    limit: 25
};

// --- 1. MASTER DATA: DEPARTMENTS & CLASSES ---
const classesCache = new Map();

async function loadClassesCache() {
    try {
        const { data, error } = await supabase.from('classes').select('id, name');
        if (!error && data) {
            data.forEach(c => classesCache.set(c.id, c.name));
        }
    } catch (e) {
        console.warn("Could not load classes cache", e);
    }
}

async function loadDepartments() {
    if (!addDeptSelect) return;
    addDeptSelect.innerHTML = '<option value="">Select Department...</option>';
    
    try {
        const { data, error } = await supabase.from('departments').select('id, name').order('name');
        if (!error && data) {
            const options = data.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
            addDeptSelect.innerHTML += options;
            if (filterDept) filterDept.innerHTML = '<option value="">All Departments</option>' + options;
        }
    } catch (err) {
        console.error("Failed to load departments", err);
    }
}

window.loadClassesForDept = async function(deptId) {
    if (!addClassSelect) return;
    addClassSelect.innerHTML = '<option value="">Select Class...</option>';
    if (!deptId) return;

    try {
        const { data, error } = await supabase.from('classes').select('id, name').eq('department_id', deptId).order('name');
        if (!error && data) {
            data.forEach(c => classesCache.set(c.id, c.name));
            addClassSelect.innerHTML += data.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        }
    } catch (err) {
        console.error("Failed to load classes", err);
    }
};

addDeptSelect?.addEventListener('change', (e) => window.loadClassesForDept(e.target.value));

// Auto-sync Student ID to Username & Initial Password
document.getElementById('add-student-id')?.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    const usernameField = document.getElementById('portal-username');
    const pwdField = document.getElementById('portal-password');
    if (usernameField) usernameField.value = val;
    if (pwdField && !pwdField.value) {
        pwdField.value = 'LIB-' + Math.random().toString(36).slice(-6).toUpperCase();
    }
});

// Photo Preview
photoInput?.addEventListener('change', function() {
    if (this.files && this.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
            if (photoPreview) {
                photoPreview.innerHTML = `<img src="${e.target.result}" style="width:100%; height:100%; object-fit:cover;">`;
            }
        };
        reader.readAsDataURL(this.files[0]);
    }
});

// --- 2. FETCH & FILTER MEMBERS ---
async function fetchStudents() {
    if (!tbody) return;
    tbody.innerHTML = `
        <tr>
            <td colspan="6" style="padding: 3rem; text-align: center; color: var(--text-muted);">
                <i data-lucide="loader-2" class="animate-spin" style="width: 28px; height: 28px; margin-bottom: 0.5rem;"></i>
                <div>Loading member directory...</div>
            </td>
        </tr>
    `;
    if (window.lucide) lucide.createIcons();

    try {
        if (classesCache.size === 0) {
            await loadClassesCache();
        }

        const { data, error } = await supabase
            .from('students')
            .select(`*, departments(name)`)
            .order('created_at', { ascending: false })
            .limit(2000);

        if (error) throw error;

        state.allData = (data || []).map(student => ({
            ...student,
            classes: { name: classesCache.get(student.class_id) || student.class_id || 'Standard' }
        }));
        if (totalCounter) totalCounter.innerText = `${state.allData.length} Members`;

        // Check for search query param
        const urlParams = new URLSearchParams(window.location.search);
        const searchParam = urlParams.get('search');
        if (searchParam && searchInput) {
            searchInput.value = searchParam;
        }

        applyFilters();
    } catch (err) {
        console.error("Failed to load students:", err);
        tbody.innerHTML = `<tr><td colspan="6" style="padding: 3rem; text-align: center; color: var(--danger);">Failed to load students.</td></tr>`;
    }
}

function applyFilters() {
    const query = searchInput?.value?.toLowerCase().trim() || '';
    const deptId = filterDept?.value || '';
    const status = filterStatus?.value || '';

    state.filteredData = state.allData.filter(student => {
        const matchesSearch = !query || 
            (student.name && student.name.toLowerCase().includes(query)) || 
            (student.student_id && student.student_id.toLowerCase().includes(query)) ||
            (student.place && student.place.toLowerCase().includes(query));

        const matchesDept = !deptId || student.department_id === deptId;
        const matchesStatus = !status || student.status === status;

        return matchesSearch && matchesDept && matchesStatus;
    });

    state.page = 1;
    updateTable();
}

function updateTable() {
    if (!tbody) return;

    const start = (state.page - 1) * state.limit;
    const end = start + state.limit;
    const paginatedItems = state.filteredData.slice(start, end);

    if (paginatedItems.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="padding: 3.5rem 1rem; text-align: center; color: var(--text-muted);">
                    <i data-lucide="user-x" style="width: 36px; height: 36px; margin-bottom: 0.5rem; opacity: 0.5;"></i>
                    <div style="font-weight: 600; font-size: 1rem; color: var(--text-primary);">No members found</div>
                    <p style="font-size: 0.85rem; margin-top: 0.25rem;">Try refining your search or department filter.</p>
                </td>
            </tr>
        `;
    } else {
        tbody.innerHTML = paginatedItems.map(student => {
            const isSelected = state.selectedIds.has(student.id);
            const deptName = student.departments?.name || 'General';
            const className = student.classes?.name || 'Standard';
            const isActive = student.status === 'ACTIVE';

            return `
                <tr style="${isSelected ? 'background: rgba(59,130,246,0.06);' : ''}">
                    <td class="checkbox-cell" data-label="Select">
                        <input type="checkbox" class="custom-checkbox row-checkbox" data-id="${student.id}" ${isSelected ? 'checked' : ''}>
                    </td>
                    <td data-label="Member Profile">
                        <div style="display: flex; align-items: center; gap: 0.75rem;">
                            <div style="width: 38px; height: 38px; border-radius: 50%; background: var(--brand-gradient); color: white; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.9rem; flex-shrink: 0; box-shadow: 0 2px 6px var(--brand-glow);">
                                ${escapeHtml(student.name).charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <div style="font-weight: 700; color: var(--text-primary); font-size: 0.95rem;">${escapeHtml(student.name)}</div>
                                <div style="font-size: 0.8rem; color: var(--text-secondary);">${escapeHtml(student.place || 'Location not specified')}</div>
                            </div>
                        </div>
                    </td>
                    <td data-label="Register No (ID)">
                        <span style="font-family: var(--font-mono); font-weight: 600; color: var(--text-primary);">${escapeHtml(student.student_id)}</span>
                    </td>
                    <td data-label="Department & Class">
                        <div style="font-weight: 600; font-size: 0.9rem;">${escapeHtml(className)}</div>
                        <div style="font-size: 0.75rem; color: var(--text-secondary);">${escapeHtml(deptName)}</div>
                    </td>
                    <td data-label="Account Status">
                        <span class="badge ${isActive ? 'badge-success' : 'badge-danger'}" style="font-size: 0.7rem;">
                            <span class="badge-dot"></span> ${student.status || 'ACTIVE'}
                        </span>
                    </td>
                    <td data-label="Actions" style="text-align: right;">
                        <div style="display: flex; gap: 0.4rem; justify-content: flex-end;">
                            <button class="btn btn-sm btn-primary" onclick="window.printLibraryCard('${escapeHtml(student.name).replace(/'/g, "\\'")}', '${escapeHtml(student.student_id)}', '${escapeHtml(className).replace(/'/g, "\\'")}')" title="Print ID Card" style="padding: 0.35rem 0.65rem;">
                                <i data-lucide="printer" style="width: 14px;"></i> ID
                            </button>
                            <button class="btn btn-sm btn-outline" onclick="window.duplicateStudent('${student.id}')" title="Duplicate Member">
                                <i data-lucide="copy" style="width: 14px;"></i>
                            </button>
                            <button class="btn btn-sm btn-outline" onclick="window.editStudent('${student.id}')" title="Edit Member">
                                <i data-lucide="edit-3" style="width: 14px;"></i>
                            </button>
                            <button class="btn btn-sm btn-ghost" style="color: var(--danger);" onclick="window.deleteStudent('${student.id}', '${escapeHtml(student.name).replace(/'/g, "\\'")}')" title="Delete Member">
                                <i data-lucide="trash-2" style="width: 14px;"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    if (window.lucide) lucide.createIcons();
    updatePaginationUI();
    attachCheckboxListeners();
    
    // Refresh mobile card view
    if (window.initMobileCardTables) window.initMobileCardTables();
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function updatePaginationUI() {
    const total = state.filteredData.length;
    const start = total === 0 ? 0 : ((state.page - 1) * state.limit) + 1;
    const end = Math.min(state.page * state.limit, total);

    if (paginationInfo) paginationInfo.innerText = `Showing ${start}-${end} of ${total}`;
    if (pageDisplay) pageDisplay.innerText = `Page ${state.page}`;

    if (btnPrev) btnPrev.disabled = state.page === 1;
    if (btnNext) btnNext.disabled = end >= total;

    if (selectAllCb) {
        const currentViewIds = state.filteredData.slice((state.page - 1) * state.limit, state.page * state.limit).map(s => s.id);
        selectAllCb.checked = currentViewIds.length > 0 && currentViewIds.every(id => state.selectedIds.has(id));
    }
}

// --- 3. SELECTION & BATCH ACTIONS ---
function attachCheckboxListeners() {
    document.querySelectorAll('.row-checkbox').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const id = e.target.getAttribute('data-id');
            if (e.target.checked) state.selectedIds.add(id);
            else state.selectedIds.delete(id);
            updateSelectionBadge();

            if (selectAllCb) {
                const currentViewIds = state.filteredData.slice((state.page - 1) * state.limit, state.page * state.limit).map(s => s.id);
                selectAllCb.checked = currentViewIds.every(cid => state.selectedIds.has(cid));
            }
        });
    });
}

selectAllCb?.addEventListener('change', (e) => {
    const currentViewIds = state.filteredData.slice((state.page - 1) * state.limit, state.page * state.limit).map(s => s.id);
    if (e.target.checked) currentViewIds.forEach(id => state.selectedIds.add(id));
    else currentViewIds.forEach(id => state.selectedIds.delete(id));
    updateTable();
    updateSelectionBadge();
});

const bulkBar = window.initUniversalBulkBar ? window.initUniversalBulkBar() : null;

function updateSelectionBadge() {
    const count = state.selectedIds.size;
    if (selectionCountBadge) {
        if (count > 0) {
            selectionCountBadge.style.display = 'inline-block';
            selectionCountBadge.innerText = `${count} Selected`;
            if (btnBatchDelete) btnBatchDelete.style.display = 'inline-flex';
        } else {
            selectionCountBadge.style.display = 'none';
            if (btnBatchDelete) btnBatchDelete.style.display = 'none';
        }
    }

    if (bulkBar) {
        bulkBar.update(count, {
            onDuplicate: async () => {
                const ids = Array.from(state.selectedIds);
                if (ids.length === 0) return;
                window.app.confirm(`Duplicate ${ids.length} selected member account(s)? New unique Student IDs and profiles will be generated.`, "Bulk Duplicate Members", async () => {
                    for (const id of ids) {
                        await duplicateStudentInternal(id, false);
                    }
                    state.selectedIds.clear();
                    bulkBar.hide();
                    window.app.toast(`Duplicated ${ids.length} members successfully!`, 'success', 'Bulk Duplicated');
                    fetchStudents();
                });
            },
            onDelete: () => btnBatchDelete?.click(),
            onExport: () => window.exportStudents('csv'),
            onClear: () => {
                state.selectedIds.clear();
                if (selectAllCb) selectAllCb.checked = false;
                updateTable();
                bulkBar.hide();
            }
        });
    }
}

async function duplicateStudentInternal(id, notify = true) {
    const st = state.allData.find(s => s.id === id);
    if (!st) return;

    const rnd = Math.floor(1000 + Math.random() * 9000);
    const newStudentId = `STU-${rnd}`;
    const newId = `stu-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const cloned = {
        id: newId,
        student_id: newStudentId,
        name: `${st.name} (Copy)`,
        place: st.place || '',
        class_id: st.class_id || '',
        phone: st.phone || '',
        email: st.email ? `copy.${rnd}.${st.email}` : `student.${rnd}@tgi.edu`,
        status: 'ACTIVE',
        borrow_limit: parseInt(st.borrow_limit) || 3
    };

    try {
        await supabase.from('students').insert([cloned]);
    } catch(e) {
        console.warn("Supabase duplicate student notice:", e);
    }

    if (notify) {
        window.app.toast(`Student member "${cloned.name}" (${newStudentId}) duplicated!`, 'success', 'Member Duplicated');
        fetchStudents();
    }
}

window.duplicateStudent = function(id) {
    const student = state.students.find(s => s.id === id);
    const name = student ? student.full_name : 'this student';
    const msg = `Duplicate student member "${name}"? A cloned member record will be created.`;
    if (window.app?.confirm) {
        window.app.confirm(msg, "Duplicate Student Member", () => duplicateStudentInternal(id, true));
    } else if (confirm(msg)) {
        duplicateStudentInternal(id, true);
    }
};

btnBatchDelete?.addEventListener('click', () => {
    const count = state.selectedIds.size;
    if (count === 0) return;

    window.app.confirm(`Permanently delete ${count} selected member accounts?`, "Batch Delete Members", async () => {
        const ids = Array.from(state.selectedIds);
        await supabase.from('students').delete().in('id', ids);
        state.selectedIds.clear();
        updateSelectionBadge();
        window.app.toast(`Deleted ${count} members successfully.`, 'success', 'Batch Deleted');
        fetchStudents();
    });
});

// --- 4. EXPORT LOGIC ---
window.exportStudents = function(format) {
    const exportDataset = state.selectedIds.size > 0 
        ? state.allData.filter(s => state.selectedIds.has(s.id)) 
        : state.filteredData;
        
    if (exportDataset.length === 0) return window.app?.toast("No member records to export.", "warning", "Export");

    if (format === 'csv') {
        const headers = ["Register No", "Name", "Department", "Class", "Location", "Status"];
        const csvRows = exportDataset.map(s => {
            return `"${s.student_id}","${(s.name || '').replace(/"/g, '""')}","${s.departments?.name || ''}","${s.classes?.name || ''}","${s.place || ''}","${s.status || 'ACTIVE'}"`;
        });
        
        const blob = new Blob([[headers.join(','), ...csvRows].join('\n')], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `Members_Directory_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        window.app.toast("Members CSV export ready.", "success", "Export Ready");
    } else if (format === 'pdf') {
        window.print();
    }
};

// --- 5. EDIT & DELETE MEMBER ---
window.editStudent = async function(id) {
    currentEditStudentId = id;
    document.getElementById('btn-submit-student').innerHTML = '<i data-lucide="save" style="width: 16px;"></i> Update Member';
    if (modalTitle) modalTitle.innerText = 'Edit Member Profile';

    const { data: student, error } = await supabase.from('students').select('*').eq('id', id).single();
    if (error) return window.app?.toast("Could not fetch member details.", "error", "Error");

    document.getElementById('add-student-id').value = student.student_id;
    document.getElementById('add-student-name').value = student.name;
    document.getElementById('add-student-place').value = student.place || '';
    document.getElementById('portal-username').value = student.portal_username || student.student_id;
    document.getElementById('portal-password').value = '********';

    if (student.department_id) {
        document.getElementById('add-student-dept').value = student.department_id;
        await window.loadClassesForDept(student.department_id);
    }
    if (student.class_id) {
        document.getElementById('add-student-class').value = student.class_id;
    }

    if (modalAddStudent) {
        modalAddStudent.classList.add('active');
        if (window.lucide) lucide.createIcons();
    }
};

window.deleteStudent = function(id, name) {
    window.app.confirm(`Delete member profile "${name}"?`, "Delete Member", async () => {
        const { error } = await supabase.from('students').delete().eq('id', id);
        if (error) window.app.toast("Failed to delete member.", "error", "Error");
        else {
            window.app.toast(`"${name}" was deleted.`, "success", "Member Deleted");
            fetchStudents();
        }
    });
};

// --- 6. MODAL TOGGLE & SUBMIT ---
const toggleModal = (show) => {
    if (!modalAddStudent) return;
    if (show) {
        modalAddStudent.classList.add('active');
    } else {
        modalAddStudent.classList.remove('active');
        formAddStudent?.reset();
        currentEditStudentId = null;
        if (modalTitle) modalTitle.innerText = 'Register New Member';
        const submitBtn = document.getElementById('btn-submit-student');
        if (submitBtn) submitBtn.innerHTML = '<i data-lucide="user-plus" style="width: 16px;"></i> Register Member';
        if (photoPreview) photoPreview.innerHTML = '<i data-lucide="user" style="width: 32px; height: 32px; color: var(--text-muted);"></i>';
    }
    if (window.lucide) lucide.createIcons();
};

btnAddStudent?.addEventListener('click', () => toggleModal(true));
btnCloseModal?.addEventListener('click', () => toggleModal(false));
btnCancelStudent?.addEventListener('click', () => toggleModal(false));

formAddStudent?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btnSubmit = document.getElementById('btn-submit-student');
    const originalText = btnSubmit.innerHTML;
    btnSubmit.innerText = 'Processing...';
    btnSubmit.disabled = true;

    const studentPayload = {
        name: document.getElementById('add-student-name').value.trim(),
        student_id: document.getElementById('add-student-id').value.trim(),
        place: document.getElementById('add-student-place').value.trim() || null,
        department_id: document.getElementById('add-student-dept').value || null,
        class_id: document.getElementById('add-student-class').value || null,
        portal_username: document.getElementById('portal-username').value.trim() || document.getElementById('add-student-id').value.trim()
    };

    try {
        if (currentEditStudentId) {
            await supabase.from('students').update(studentPayload).eq('id', currentEditStudentId);
            window.app.toast(`Member "${studentPayload.name}" updated successfully.`, "success", "Profile Updated");
        } else {
            studentPayload.status = 'ACTIVE';
            studentPayload.borrow_limit = 3;
            await supabase.from('students').insert([studentPayload]);
            window.app.toast(`Registered "${studentPayload.name}" with ID: ${studentPayload.student_id}`, "success", "Member Registered");
        }

        toggleModal(false);
        fetchStudents();
    } catch (err) {
        window.app.toast(err.message || "Failed to save student record.", "error", "Registration Failed");
    } finally {
        btnSubmit.innerHTML = originalText;
        btnSubmit.disabled = false;
        currentEditStudentId = null;
    }
});

// --- 7. BULK IMPORT MODAL LOGIC ---
function initBulkImport() {
    const btnBulk = document.getElementById('btn-bulk-import');
    const modal = document.getElementById('modal-bulk-import');
    if (!btnBulk || !modal) return;

    modal.querySelectorAll('.close-bulk').forEach(b => {
        b.addEventListener('click', () => modal.classList.remove('active'));
    });

    btnBulk.addEventListener('click', () => {
        document.getElementById('file-upload-students').value = '';
        modal.classList.add('active');
    });

    document.getElementById('btn-download-template')?.addEventListener('click', () => {
        const csvContent = "Register_No,Name,Location,Department,Class\nSTU-001,John Doe,City,Computer Science,CS-A\nSTU-002,Jane Smith,City,Mechanical,ME-A\n";
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "Members_Bulk_Template.csv";
        link.click();
    });

    document.getElementById('btn-process-bulk')?.addEventListener('click', async (e) => {
        const fileInput = document.getElementById('file-upload-students');
        if (!fileInput.files.length) return window.app.toast("Please select a CSV file first.", "warning", "File Required");

        const btn = e.target;
        btn.innerText = "Importing...";
        btn.disabled = true;

        try {
            const [{ data: depts }, { data: classes }] = await Promise.all([
                supabase.from('departments').select('id, name'),
                supabase.from('classes').select('id, name')
            ]);

            const deptMap = {}; if (depts) depts.forEach(d => deptMap[d.name.toLowerCase()] = d.id);
            const classMap = {}; if (classes) classes.forEach(c => classMap[c.name.toLowerCase()] = c.id);

            const reader = new FileReader();
            reader.onload = async (event) => {
                const lines = event.target.result.split('\n').filter(l => l.trim() !== '');
                if (lines.length < 2) throw new Error("The file is empty.");

                const headers = lines[0].split(',').map(h => h.trim());
                const payloads = [];

                for (let i = 1; i < lines.length; i++) {
                    const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
                    const row = headers.reduce((obj, header, idx) => { obj[header] = values[idx]; return obj; }, {});

                    if (row.Register_No && row.Name) {
                        payloads.push({
                            student_id: row.Register_No,
                            name: row.Name,
                            place: row.Location || null,
                            department_id: row.Department ? (deptMap[row.Department.toLowerCase()] || null) : null,
                            class_id: row.Class ? (classMap[row.Class.toLowerCase()] || null) : null,
                            portal_username: row.Register_No,
                            status: 'ACTIVE',
                            borrow_limit: 3
                        });
                    }
                }

                if (!payloads.length) throw new Error("No valid records found in CSV.");

                const { error } = await supabase.from('students').insert(payloads);
                if (error) throw error;

                modal.classList.remove('active');
                window.app.toast(`Successfully imported ${payloads.length} members.`, "success", "Import Complete");
                fetchStudents();
            };
            reader.readAsText(fileInput.files[0]);
        } catch (err) {
            window.app.toast(err.message || "Failed to process bulk import.", "error", "Import Error");
        } finally {
            btn.innerHTML = '<i data-lucide="upload-cloud" style="width: 16px;"></i> Process Import';
            btn.disabled = false;
        }
    });
}

// --- 8. INIT ---
let searchTimeout = null;
searchInput?.addEventListener('input', () => { clearTimeout(searchTimeout); searchTimeout = setTimeout(applyFilters, 250); });
filterDept?.addEventListener('change', applyFilters);
filterStatus?.addEventListener('change', applyFilters);

btnPrev?.addEventListener('click', () => { if (state.page > 1) { state.page--; updateTable(); } });
btnNext?.addEventListener('click', () => { if (state.page * state.limit < state.filteredData.length) { state.page++; updateTable(); } });
rowsPerPageSelect?.addEventListener('change', (e) => { state.limit = parseInt(e.target.value); state.page = 1; updateTable(); });

document.addEventListener('DOMContentLoaded', async () => {
    await Promise.all([loadDepartments(), loadClassesCache()]);
    await fetchStudents();
    initBulkImport();

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('action') === 'add' || urlParams.get('student_id')) {
        const studentId = urlParams.get('student_id');
        toggleModal(true);
        if (studentId) {
            const idInput = document.getElementById('add-student-id');
            if (idInput) idInput.value = studentId;
            window.app?.toast(`Pre-filled student ID: ${studentId}. Complete details to register.`, "info", "Register Member", 4000);
        }
    }
});