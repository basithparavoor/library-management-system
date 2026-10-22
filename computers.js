
window.duplicateWorkstation = function(id) {
    const computers = erp.getComputers('ALL');
    const comp = computers.find(c => c.id === id);
    if (!comp) return;
    const rnd = Math.floor(100 + Math.random() * 900);
    const cloned = {
        ...comp,
        id: `pc-${Date.now()}-${rnd}`,
        machine_code: `${comp.machine_code}-C${rnd}`,
        status: 'AVAILABLE',
        current_user_id: null,
        current_user_name: null,
        session_start: null
    };
    erp.saveComputer(cloned);
    window.app.toast(`Workstation "${cloned.machine_code}" duplicated!`, 'success', 'Machine Cloned');
    renderWorkstations();
};

import { erp } from './erp_service.js';
import { hardware } from './hardware.js';

let activeFilterPeriod = 'all';
let qrScanner = null;

// UI Elements
const gridContainer = document.getElementById('workstations-grid');
const filterLab = document.getElementById('filter-lab-name');
const checkinSelect = document.getElementById('checkin-pc-select');
const checkoutSelect = document.getElementById('checkout-pc-select');
const sessionsTbody = document.getElementById('pc-sessions-tbody');
const campusBadgeText = document.getElementById('lab-active-campus-text');

// KPI elements
const statTotal = document.getElementById('stat-total-pcs');
const statOccupied = document.getElementById('stat-occupied-pcs');
const statAvailable = document.getElementById('stat-available-pcs');
const statHours = document.getElementById('stat-lab-hours');

// Modal Elements
const modalAdd = document.getElementById('modal-add-computer');
const btnOpenAdd = document.getElementById('btn-add-computer');
const formMachine = document.getElementById('form-save-machine');

function getActiveCampusName() {
    const campusId = erp.getActiveCampusId();
    if (campusId === 'ALL') return 'Global Campus Overview';
    const c = erp.getCampuses().find(item => item.id === campusId);
    return c ? c.name : 'Main Campus';
}

// 1. Render Workstations Board
function renderWorkstations() {
    const campusId = erp.getActiveCampusId();
    const computers = erp.getComputers(campusId);
    const selectedLab = filterLab.value;

    const filtered = selectedLab ? computers.filter(c => c.lab_name === selectedLab) : computers;

    // Update KPI stats
    const total = computers.length;
    const occupied = computers.filter(c => c.status === 'IN_USE').length;
    const available = computers.filter(c => c.status === 'AVAILABLE').length;

    // Calculate total hours today
    const todayStr = new Date().toISOString().split('T')[0];
    const sessions = erp.getComputerSessions({ campus_id: campusId });
    const todaySessions = sessions.filter(s => s.start_time.startsWith(todayStr));
    const totalMinutes = todaySessions.reduce((acc, s) => acc + (s.duration_minutes || 0), 0);
    const totalHoursStr = `${(totalMinutes / 60).toFixed(1)}h`;

    if (statTotal) statTotal.innerText = total;
    if (statOccupied) statOccupied.innerText = occupied;
    if (statAvailable) statAvailable.innerText = available;
    if (statHours) statHours.innerText = totalHoursStr;
    if (campusBadgeText) campusBadgeText.innerText = getActiveCampusName();

    // Populate Lab Filter
    const uniqueLabs = [...new Set(computers.map(c => c.lab_name))];
    const currentLabVal = filterLab.value;
    filterLab.innerHTML = '<option value="">All Labs & Rooms</option>' + uniqueLabs.map(l => `<option value="${l}">${l}</option>`).join('');
    filterLab.value = currentLabVal;

    // Populate Checkin & Checkout Selects
    checkinSelect.innerHTML = '<option value="">Select Available PC...</option>' + computers.filter(c => c.status === 'AVAILABLE').map(c => `<option value="${c.id}">${c.machine_code} - ${c.lab_name}</option>`).join('');
    checkoutSelect.innerHTML = '<option value="">Select Active PC...</option>' + computers.filter(c => c.status === 'IN_USE').map(c => `<option value="${c.id}">${c.machine_code} (${c.current_user_name || 'In Use'})</option>`).join('');

    if (filtered.length === 0) {
        gridContainer.innerHTML = `<div style="grid-column: 1 / -1; padding: 3rem; text-align: center; color: var(--text-muted);">No workstation machines found for this selection.</div>`;
        return;
    }

    gridContainer.innerHTML = filtered.map(comp => {
        const isOccupied = comp.status === 'IN_USE';
        const isMaint = comp.status === 'MAINTENANCE';

        let timerText = '';
        if (isOccupied && comp.session_start) {
            const diffMin = Math.max(1, Math.floor((Date.now() - new Date(comp.session_start)) / 60000));
            timerText = `${diffMin} mins active`;
        }

        return `
            <div class="workstation-card status-${comp.status.toLowerCase()}">
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
                        <span style="font-family: var(--font-mono); font-weight: 800; font-size: 1.1rem; color: var(--text-primary);">${comp.machine_code}</span>
                        <div style="display: flex; align-items: center; gap: 0.35rem;">
                            <span class="badge ${isOccupied ? 'badge-brand' : isMaint ? 'badge-warning' : 'badge-success'}" style="font-size: 0.65rem;">
                                <span class="badge-dot"></span> ${comp.status.replace('_', ' ')}
                            </span>
                            <button class="btn btn-ghost btn-icon btn-sm" style="padding: 2px 4px; color: var(--brand-primary);" title="Duplicate Machine" onclick="window.duplicateWorkstation('${comp.id}')"><i data-lucide="copy" style="width: 13px;"></i></button>
                            <button class="btn btn-ghost btn-icon btn-sm" style="padding: 2px 4px; color: var(--text-muted);" title="Edit Machine" onclick="window.editWorkstation('${comp.id}')">
                                <i data-lucide="edit-3" style="width: 13px;"></i>
                            </button>
                            <button class="btn btn-ghost btn-icon btn-sm" style="padding: 2px 4px; color: var(--danger);" title="Delete Machine" onclick="window.deleteWorkstation('${comp.id}', '${comp.machine_code}')">
                                <i data-lucide="trash-2" style="width: 13px;"></i>
                            </button>
                        </div>
                    </div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">${comp.lab_name}</div>
                    <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 4px;">Specs: ${comp.specs || 'Standard PC'}</div>
                </div>

                <div style="margin-top: 1rem; border-top: 1px solid var(--border-color); padding-top: 0.75rem;">
                    ${isOccupied ? `
                        <div style="font-size: 0.8rem; font-weight: 700; color: var(--text-primary);">${comp.current_user_name || 'Student'}</div>
                        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.7rem; color: var(--brand-primary); font-weight: 600; margin-top: 2px;">
                            <span>ID: ${comp.current_user_id || '—'}</span>
                            <span>${timerText}</span>
                        </div>
                        <button class="btn btn-sm btn-outline" style="width: 100%; margin-top: 0.5rem; color: var(--danger); border-color: var(--danger);" onclick="window.quickCheckoutPc('${comp.id}')">
                            <i data-lucide="log-out" style="width: 12px;"></i> End Session
                        </button>
                    ` : isMaint ? `
                        <div style="font-size: 0.75rem; color: var(--warning); font-weight: 600; text-align: center; padding: 0.35rem 0;">Hardware Maintenance</div>
                    ` : `
                        <button class="btn btn-sm btn-primary" style="width: 100%;" onclick="window.quickCheckinPc('${comp.id}')">
                            <i data-lucide="play" style="width: 12px;"></i> Assign Student
                        </button>
                    `}
                </div>
            </div>
        `;
    }).join('');

    if (window.lucide) lucide.createIcons();
}

// 2. Render Workstation Usage Logs
function renderUsageLogs() {
    const campusId = erp.getActiveCampusId();
    const query = document.getElementById('search-logs-student')?.value?.toLowerCase().trim() || '';
    
    let sessions = erp.getComputerSessions({ campus_id: campusId });

    const now = new Date();
    if (activeFilterPeriod === 'today') {
        const today = now.toISOString().split('T')[0];
        sessions = sessions.filter(s => s.start_time.startsWith(today));
    } else if (activeFilterPeriod === 'week') {
        const weekAgo = new Date(now.getTime() - 7*86400*1000);
        sessions = sessions.filter(s => new Date(s.start_time) >= weekAgo);
    } else if (activeFilterPeriod === 'month') {
        const monthAgo = new Date(now.getTime() - 30*86400*1000);
        sessions = sessions.filter(s => new Date(s.start_time) >= monthAgo);
    }

    if (query) {
        sessions = sessions.filter(s => (s.student_name && s.student_name.toLowerCase().includes(query)) || (s.student_id && s.student_id.toLowerCase().includes(query)) || (s.machine_code && s.machine_code.toLowerCase().includes(query)));
    }

    if (sessions.length === 0) {
        sessionsTbody.innerHTML = `<tr><td colspan="7" style="padding: 2.5rem; text-align: center; color: var(--text-muted);">No usage records match the current filter.</td></tr>`;
        return;
    }

    sessionsTbody.innerHTML = sessions.map(s => {
        const isLive = s.status === 'ACTIVE';
        const startStr = new Date(s.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' (' + new Date(s.start_time).toLocaleDateString() + ')';
        const durationStr = isLive ? 'In Session' : `${s.duration_minutes || 1} mins`;

        return `
            <tr>
                <td data-label="Machine Code" style="font-family: var(--font-mono); font-weight: 700;">${s.machine_code}</td>
                <td data-label="Student Member">
                    <div style="font-weight: 700; color: var(--text-primary); font-size: 0.9rem;">${s.student_name || 'Member'}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted); font-family: var(--font-mono);">${s.student_id || '—'}</div>
                </td>
                <td data-label="Campus & Lab">
                    <span style="font-size: 0.8rem; color: var(--text-secondary);">${s.campus_id}</span>
                </td>
                <td data-label="Session Time" style="font-size: 0.8rem;">${startStr}</td>
                <td data-label="Duration">
                    <span class="badge ${isLive ? 'badge-brand' : 'badge-success'}" style="font-size: 0.75rem;">
                        ${durationStr}
                    </span>
                </td>
                <td data-label="Purpose" style="font-size: 0.8rem; color: var(--text-secondary);">${s.purpose || 'Academic'}</td>
                <td data-label="Status">
                    <span class="badge ${isLive ? 'badge-warning' : 'badge-success'}" style="font-size: 0.65rem;">${s.status}</span>
                </td>
            </tr>
        `;
    }).join('');

    if (window.lucide) lucide.createIcons();
}

// 3. Fast Actions & Form Handlers
document.getElementById('form-checkin-pc')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const pcId = checkinSelect.value;
    const studentId = document.getElementById('checkin-student-id').value.trim();
    const purpose = document.getElementById('checkin-purpose').value.trim();

    try {
        const result = erp.checkInComputer(pcId, studentId, studentId, purpose);
        window.app.toast(`Assigned ${result.comp.machine_code} to ${studentId}.`, "success", "Workstation Occupied");
        e.target.reset();
        renderWorkstations();
        renderUsageLogs();
    } catch (err) {
        window.app.toast(err.message, "error", "Check-In Failed");
    }
});

document.getElementById('form-checkout-pc')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const pcId = checkoutSelect.value;

    try {
        const result = erp.checkOutComputer(pcId);
        window.app.toast(`${result.comp.machine_code} released. Session time: ${result.durationMinutes} minutes.`, "success", "Workstation Released");
        e.target.reset();
        renderWorkstations();
        renderUsageLogs();
    } catch (err) {
        window.app.toast(err.message, "error", "Check-Out Failed");
    }
});

window.quickCheckinPc = function(pcId) {
    checkinSelect.value = pcId;
    document.getElementById('checkin-student-id').focus();
};

window.quickCheckoutPc = function(pcId) {
    window.app.confirm(`End active session on this workstation?`, "Release PC", () => {
        try {
            const result = erp.checkOutComputer(pcId);
            window.app.toast(`${result.comp.machine_code} released. Total session: ${result.durationMinutes} mins.`, "success", "Session Completed");
            renderWorkstations();
            renderUsageLogs();
        } catch (e) {
            window.app.toast(e.message, "error", "Error");
        }
    });
};

// NFC Tap Check-In
document.getElementById('btn-nfc-checkin')?.addEventListener('click', async () => {
    window.app.toast("Hold student NFC card near reader...", "info", "NFC Terminal Ready", 3000);
    await hardware.startNfcScan(
        (payload) => {
            document.getElementById('checkin-student-id').value = payload;
            window.app.toast(`NFC Badge Identified: ${payload}`, "success", "NFC Verified");
        },
        (err) => {
            window.app.toast(err.message, "warning", "NFC Notice");
        }
    );
});

// Camera Scanner
document.getElementById('btn-camera-checkin')?.addEventListener('click', () => {
    const modal = document.getElementById('pc-scanner-modal');
    modal.classList.add('active');

    if (!qrScanner) {
        qrScanner = new Html5QrcodeScanner("pc-reader", { fps: 10, qrbox: { width: 240, height: 120 } }, false);
    }
    qrScanner.render((text) => {
        document.getElementById('checkin-student-id').value = text;
        window.app.toast(`Scanned: ${text}`, "success", "QR Verified");
        modal.classList.remove('active');
        qrScanner.clear().catch(e => {});
    });
});

// Preset Time Filter Buttons
document.querySelectorAll('.time-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.time-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeFilterPeriod = btn.getAttribute('data-period');
        renderUsageLogs();
    });
});

document.getElementById('search-logs-student')?.addEventListener('input', renderUsageLogs);
filterLab?.addEventListener('change', renderWorkstations);

// Add / Edit Machine Handlers
btnOpenAdd?.addEventListener('click', () => {
    document.getElementById('modal-pc-title').innerText = 'Add Workstation Machine';
    document.getElementById('add-pc-id').value = '';
    formMachine.reset();
    document.getElementById('add-pc-campus').value = erp.getActiveCampusId() !== 'ALL' ? erp.getActiveCampusId() : 'camp-main';
    document.getElementById('add-pc-status').value = 'AVAILABLE';
    modalAdd.classList.add('active');
});

modalAdd?.querySelectorAll('.close-pc-modal').forEach(b => b.addEventListener('click', () => modalAdd.classList.remove('active')));

window.editWorkstation = function(id) {
    const comp = erp.getComputers('ALL').find(c => c.id === id);
    if (!comp) return;

    document.getElementById('modal-pc-title').innerText = 'Edit Workstation Machine';
    document.getElementById('add-pc-id').value = comp.id;
    document.getElementById('add-pc-code').value = comp.machine_code;
    document.getElementById('add-pc-lab').value = comp.lab_name;
    document.getElementById('add-pc-ip').value = comp.ip_address || '';
    document.getElementById('add-pc-campus').value = comp.campus_id || 'camp-main';
    document.getElementById('add-pc-specs').value = comp.specs || '';
    document.getElementById('add-pc-status').value = comp.status || 'AVAILABLE';

    modalAdd.classList.add('active');
};

window.deleteWorkstation = function(id, machineCode) {
    window.app.confirm(`Are you sure you want to remove workstation "${machineCode}"?`, "Delete Workstation", () => {
        erp.deleteComputer(id);
        window.app.toast(`Workstation "${machineCode}" deleted.`, "info", "Workstation Removed");
        renderWorkstations();
    });
};

formMachine?.addEventListener('submit', (e) => {
    e.preventDefault();
    const pcId = document.getElementById('add-pc-id').value;
    const compData = {
        id: pcId || undefined,
        machine_code: document.getElementById('add-pc-code').value.trim().toUpperCase(),
        lab_name: document.getElementById('add-pc-lab').value.trim(),
        ip_address: document.getElementById('add-pc-ip').value.trim(),
        campus_id: document.getElementById('add-pc-campus').value,
        specs: document.getElementById('add-pc-specs').value.trim() || 'Standard Workstation',
        status: document.getElementById('add-pc-status').value
    };

    erp.saveComputer(compData);
    window.app.toast(`Workstation ${compData.machine_code} ${pcId ? 'updated' : 'registered'} successfully.`, "success", pcId ? "Machine Updated" : "Machine Registered");
    modalAdd.classList.remove('active');
    formMachine.reset();
    renderWorkstations();
});

// Export CSV of Usage Logs
document.getElementById('btn-export-pc-csv')?.addEventListener('click', () => {
    const sessions = erp.getComputerSessions({ campus_id: erp.getActiveCampusId() });
    if (!sessions.length) return window.app.toast("No sessions to export.", "warning", "Export");

    const headers = ["Machine_Code", "Student_Name", "Student_ID", "Campus", "Start_Time", "End_Time", "Duration_Minutes", "Purpose", "Status"];
    const rows = sessions.map(s => `"${s.machine_code}","${s.student_name || ''}","${s.student_id || ''}","${s.campus_id}","${s.start_time}","${s.end_time || ''}","${s.duration_minutes || 0}","${s.purpose || ''}","${s.status}"`);

    const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Workstation_Usage_Logs_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    window.app.toast("CSV downloaded successfully.", "success", "Export Ready");
});

window.addEventListener('campusChanged', () => {
    renderWorkstations();
    renderUsageLogs();
});

document.addEventListener('DOMContentLoaded', () => {
    renderWorkstations();
    renderUsageLogs();
});
