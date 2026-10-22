import { erp } from './erp_service.js';
import { hardware } from './hardware.js';
import { supabase } from './supabaseClient.js';

let activePeriodId = null;
let currentClassStudents = [];
let qrScanner = null;

// UI Elements
const sessionsContainer = document.getElementById('period-sessions-container');
const activeBadge = document.getElementById('active-periods-badge');
const periodTitle = document.getElementById('current-period-title');
const periodSubtitle = document.getElementById('current-period-subtitle');
const rosterActions = document.getElementById('roster-actions-bar');
const terminalRow = document.getElementById('terminal-input-row');
const rosterList = document.getElementById('attendance-roster-list');
const campusText = document.getElementById('attendance-campus-text');

// Modal Elements
const modalPeriod = document.getElementById('modal-period');
const btnStartPeriod = document.getElementById('btn-start-period');
const formPeriod = document.getElementById('form-period');

function getActiveCampusName() {
    const campusId = erp.getActiveCampusId();
    if (campusId === 'ALL') return 'Global Institutional View';
    const c = erp.getCampuses().find(item => item.id === campusId);
    return c ? c.name : 'Main Campus';
}

// 1. Render Periods List
function renderPeriodSessions() {
    const campusId = erp.getActiveCampusId();
    const periods = erp.getPeriodSessions(campusId);

    if (campusText) campusText.innerText = getActiveCampusName();
    if (activeBadge) activeBadge.innerText = `${periods.length} Sessions`;

    if (periods.length === 0) {
        sessionsContainer.innerHTML = `<div class="card card-glass" style="padding: 2.5rem 1rem; text-align: center; color: var(--text-muted);">No active period sessions scheduled for today. Click "Schedule / Start Period" to begin.</div>`;
        return;
    }

    sessionsContainer.innerHTML = periods.map(p => {
        const isSelected = p.id === activePeriodId;
        const isLibrary = p.facility_type === 'LIBRARY';
        const percent = p.total_students > 0 ? Math.round((p.present_count / p.total_students) * 100) : 0;

        return `
            <div class="card card-glass card-interactive" style="cursor: pointer; padding: 1.25rem; border-left: 4px solid ${isLibrary ? 'var(--brand-primary)' : 'var(--accent-violet)'}; ${isSelected ? 'background: rgba(59,130,246,0.08); border-color: var(--brand-primary);' : ''}" onclick="window.selectPeriodSession('${p.id}')">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
                    <div>
                        <div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 2px;">
                            <span class="badge ${isLibrary ? 'badge-brand' : 'badge-info'}" style="font-size: 0.65rem;">${p.facility_type.replace('_', ' ')}</span>
                            <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">${p.class_name}</span>
                        </div>
                        <h3 style="font-size: 1.05rem; font-weight: 700; color: var(--text-primary); margin: 0;">${p.period_name}</h3>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.35rem;">
                        <span class="badge ${p.status === 'ACTIVE' ? 'badge-success' : 'badge-brand'}" style="font-size: 0.65rem;">${p.status}</span>
                        <button class="btn btn-ghost btn-icon btn-sm" style="padding: 2px 4px; color: var(--text-muted);" title="Edit Period" onclick="event.stopPropagation(); window.editPeriod('${p.id}')">
                            <i data-lucide="edit-3" style="width: 13px;"></i>
                        </button>
                        <button class="btn btn-ghost btn-icon btn-sm" style="padding: 2px 4px; color: var(--danger);" title="Delete Period" onclick="event.stopPropagation(); window.deletePeriod('${p.id}', '${p.period_name.replace(/'/g, "\\'")}')">
                            <i data-lucide="trash-2" style="width: 13px;"></i>
                        </button>
                    </div>
                </div>

                <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.75rem;">
                    Teacher: <strong>${p.teacher_name}</strong> • ${p.topic || 'Class Session'}
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; border-top: 1px solid var(--border-color); padding-top: 0.5rem;">
                    <span style="color: var(--text-muted);">Attendance: <strong style="color: var(--text-primary);">${p.present_count || 0} / ${p.total_students || 0}</strong></span>
                    <span style="font-weight: 700; color: ${percent >= 75 ? 'var(--success)' : 'var(--danger)'};">${percent}% Present</span>
                </div>
            </div>
        `;
    }).join('');

    if (window.lucide) lucide.createIcons();

    // Refresh mobile card view
    if (window.initMobileCardTables) window.initMobileCardTables();
}

// 2. Select a Period and Load Class Roster
window.selectPeriodSession = async function(sessionId) {
    activePeriodId = sessionId;
    renderPeriodSessions();

    const period = erp.getPeriodSessions('ALL').find(p => p.id === sessionId);
    if (!period) return;

    periodTitle.innerText = `${period.class_name} - ${period.period_name}`;
    periodSubtitle.innerText = `Facility: ${period.facility_type.replace('_', ' ')} • In-Charge: ${period.teacher_name}`;
    rosterActions.style.display = 'flex';
    terminalRow.style.display = 'block';

    rosterList.innerHTML = `<div style="padding: 2rem; text-align: center; color: var(--text-muted);"><i data-lucide="loader-2" class="animate-spin"></i> Loading class roster...</div>`;
    if (window.lucide) lucide.createIcons();

    // Refresh mobile card view
    if (window.initMobileCardTables) window.initMobileCardTables();

    // Fetch students from Supabase or ERP directory
    try {
        const { data: students } = await supabase
            .from('students')
            .select('id, name, student_id, place')
            .limit(50);

        currentClassStudents = (students && students.length > 0) ? students : [];
        renderRosterList();
    } catch (e) {
        currentClassStudents = [];
        renderRosterList();
    }
};

function renderRosterList() {
    if (!activePeriodId) return;
    const existingAttendance = erp.getPeriodAttendance(activePeriodId);
    const attendanceMap = new Map();
    existingAttendance.forEach(a => attendanceMap.set(a.student_id, a));

    if (!currentClassStudents || currentClassStudents.length === 0) {
        rosterList.innerHTML = `<div style="padding: 2.5rem; text-align: center; color: var(--text-muted); font-size: 0.88rem;">
            <i data-lucide="users" style="width: 32px; height: 32px; margin-bottom: 0.5rem; opacity: 0.4;"></i>
            <div>No enrolled students found in database.</div>
            <div style="font-size: 0.75rem; margin-top: 0.25rem;">Add students via the Students directory to take roll call.</div>
        </div>`;
        if (window.lucide) lucide.createIcons();

    // Refresh mobile card view
    if (window.initMobileCardTables) window.initMobileCardTables();
        return;
    }

    rosterList.innerHTML = currentClassStudents.map(st => {
        const record = attendanceMap.get(st.student_id);
        const currentStatus = record ? record.status : 'ABSENT';
        const checkinMethod = record ? record.checkin_method : '';

        return `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-sm); gap: 0.75rem;">
                <div>
                    <div style="font-weight: 700; font-size: 0.9rem; color: var(--text-primary);">${st.name}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted); font-family: var(--font-mono);">${st.student_id} ${checkinMethod ? '• ' + checkinMethod : ''}</div>
                </div>

                <div style="display: flex; gap: 0.35rem;">
                    <button class="btn btn-sm ${currentStatus === 'PRESENT' ? 'btn-success' : 'btn-outline'}" onclick="window.setStudentStatus('${st.student_id}', '${st.name.replace(/'/g, "\\'")}', 'PRESENT')">
                        <i data-lucide="check" style="width: 12px;"></i> Present
                    </button>
                    <button class="btn btn-sm ${currentStatus === 'LATE' ? 'btn-warning' : 'btn-outline'}" onclick="window.setStudentStatus('${st.student_id}', '${st.name.replace(/'/g, "\\'")}', 'LATE')">
                        Late
                    </button>
                    <button class="btn btn-sm ${currentStatus === 'ABSENT' ? 'btn-danger' : 'btn-outline'}" onclick="window.setStudentStatus('${st.student_id}', '${st.name.replace(/'/g, "\\'")}', 'ABSENT')">
                        Absent
                    </button>
                </div>
            </div>
        `;
    }).join('');

    if (window.lucide) lucide.createIcons();

    // Refresh mobile card view
    if (window.initMobileCardTables) window.initMobileCardTables();
}

window.setStudentStatus = function(studentId, studentName, status, method = 'MANUAL') {
    if (!activePeriodId) return;
    erp.recordStudentAttendance(activePeriodId, studentId, studentName, status, method);
    if (status === 'PRESENT' && window.app?.playBeep) window.app.playBeep('scan');
    renderRosterList();
    renderPeriodSessions();
};

// Mark Single via Input
document.getElementById('btn-mark-single-present')?.addEventListener('click', () => {
    const input = document.getElementById('attendance-student-input');
    const studentId = input.value.trim();
    if (!studentId || !activePeriodId) return;

    const student = currentClassStudents.find(s => s.student_id.toLowerCase() === studentId.toLowerCase() || s.name.toLowerCase().includes(studentId.toLowerCase()));
    const name = student ? student.name : studentId;

    window.setStudentStatus(studentId, name, 'PRESENT', 'TERMINAL');
    window.app.toast(`Marked ${name} as PRESENT.`, "success", "Attendance Logged");
    input.value = '';
});

document.getElementById('attendance-student-input')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') document.getElementById('btn-mark-single-present').click();
});

// Mark All Present
document.getElementById('btn-mark-all-present')?.addEventListener('click', () => {
    if (!activePeriodId) return;
    currentClassStudents.forEach(st => {
        erp.recordStudentAttendance(activePeriodId, st.student_id, st.name, 'PRESENT', 'ROSTER_BULK');
    });
    window.app.toast("Marked all students as PRESENT for this period.", "success", "Roster Updated");
    renderRosterList();
    renderPeriodSessions();
});

// NFC Tap Attendance
document.getElementById('btn-nfc-attendance')?.addEventListener('click', async () => {
    if (!activePeriodId) return window.app.toast("Please select an active class period first.", "warning", "Select Period");
    window.app.toast("Hold student NFC smartcard near terminal...", "info", "NFC Attendance Ready", 3000);

    await hardware.startNfcScan(
        (payload) => {
            const student = currentClassStudents.find(s => s.student_id === payload || s.name.toLowerCase().includes(payload.toLowerCase()));
            const name = student ? student.name : payload;
            window.setStudentStatus(payload, name, 'PRESENT', 'NFC');
            window.app.toast(`NFC Verified: ${name} marked PRESENT.`, "success", "Smartcard Attendance");
        },
        (err) => {
            window.app.toast(err.message, "warning", "NFC Notice");
        }
    );
});

// Camera Scanner Attendance
document.getElementById('btn-camera-attendance')?.addEventListener('click', () => {
    if (!activePeriodId) return window.app.toast("Please select an active class period first.", "warning", "Select Period");
    const modal = document.getElementById('att-scanner-modal');
    modal.classList.add('active');

    if (!qrScanner) {
        qrScanner = new Html5QrcodeScanner("att-reader", { fps: 10, qrbox: { width: 240, height: 120 } }, false);
    }
    qrScanner.render((text) => {
        const student = currentClassStudents.find(s => s.student_id === text || s.name.toLowerCase().includes(text.toLowerCase()));
        const name = student ? student.name : text;
        window.setStudentStatus(text, name, 'PRESENT', 'QR');
        window.app.toast(`QR Verified: ${name} marked PRESENT.`, "success", "QR Attendance");
        modal.classList.remove('active');
        qrScanner.clear().catch(e => {});
    });
});

// Period Modal & Actions
btnStartPeriod?.addEventListener('click', () => {
    document.getElementById('modal-period-title').innerText = 'Start Class Facility Period';
    document.getElementById('period-id').value = '';
    formPeriod.reset();
    document.getElementById('period-status').value = 'ACTIVE';
    modalPeriod.classList.add('active');
});

modalPeriod?.querySelectorAll('.close-period-modal').forEach(b => b.addEventListener('click', () => modalPeriod.classList.remove('active')));

window.editPeriod = function(id) {
    const period = erp.getPeriodSessions('ALL').find(p => p.id === id);
    if (!period) return;

    document.getElementById('modal-period-title').innerText = 'Edit Class Facility Period';
    document.getElementById('period-id').value = period.id;
    document.getElementById('period-facility').value = period.facility_type || 'LIBRARY';
    document.getElementById('period-slot-name').value = period.period_name || '';
    document.getElementById('period-dept').value = period.department_name || 'Computer Science';
    document.getElementById('period-class').value = period.class_name || '';
    document.getElementById('period-teacher').value = period.teacher_name || '';
    document.getElementById('period-topic').value = period.topic || '';
    document.getElementById('period-status').value = period.status || 'ACTIVE';

    modalPeriod.classList.add('active');
};

window.deletePeriod = function(id, periodName) {
    window.app.confirm(`Are you sure you want to delete period session "${periodName}"? Attendance logs for this period will also be removed.`, "Delete Period", () => {
        erp.deletePeriodSession(id);
        window.app.toast(`Period "${periodName}" deleted.`, "info", "Period Removed");
        if (activePeriodId === id) activePeriodId = null;
        renderPeriodSessions();
        const remaining = erp.getPeriodSessions(erp.getActiveCampusId());
        if (remaining.length > 0) {
            window.selectPeriodSession(remaining[0].id);
        } else {
            periodTitle.innerText = 'Select a Period Session';
            periodSubtitle.innerText = 'Click on any scheduled period on the left to take attendance';
            rosterActions.style.display = 'none';
            terminalRow.style.display = 'none';
            rosterList.innerHTML = `<div style="padding: 3rem; text-align: center; color: var(--text-muted);"><i data-lucide="users" style="width: 36px; height: 36px; opacity: 0.4; margin-bottom: 0.5rem;"></i><div>No active period session. Click "Schedule / Start Period" to begin.</div></div>`;
            if (window.lucide) lucide.createIcons();

    // Refresh mobile card view
    if (window.initMobileCardTables) window.initMobileCardTables();
        }
    });
};

formPeriod?.addEventListener('submit', (e) => {
    e.preventDefault();
    const periodId = document.getElementById('period-id').value;
    const periodData = {
        id: periodId || undefined,
        facility_type: document.getElementById('period-facility').value,
        period_name: document.getElementById('period-slot-name').value.trim(),
        department_name: document.getElementById('period-dept').value,
        class_name: document.getElementById('period-class').value.trim(),
        teacher_name: document.getElementById('period-teacher').value.trim(),
        topic: document.getElementById('period-topic').value.trim() || 'Class Study',
        status: document.getElementById('period-status').value || 'ACTIVE',
        total_students: 45
    };

    if (periodId) {
        erp.updatePeriodSession(periodData);
        window.app.toast(`Period "${periodData.period_name}" updated.`, "success", "Period Saved");
    } else {
        const saved = erp.createPeriodSession(periodData);
        window.app.toast(`Started period: ${saved.period_name} for ${saved.class_name}.`, "success", "Period Launched");
        activePeriodId = saved.id;
    }

    modalPeriod.classList.remove('active');
    formPeriod.reset();
    renderPeriodSessions();
    if (activePeriodId) window.selectPeriodSession(activePeriodId);
});

// =============================================================================
// ADMIN ATTENDANCE REPORT GENERATOR (PDF & CSV)
// =============================================================================
const modalReport = document.getElementById('modal-attendance-report');
modalReport?.querySelectorAll('.close-report-modal').forEach(b => b.addEventListener('click', () => modalReport.classList.remove('active')));

document.getElementById('btn-generate-pdf-report')?.addEventListener('click', () => {
    if (!activePeriodId) return window.app.toast("Please select a period session to generate report.", "warning", "Select Period");
    const period = erp.getPeriodSessions('ALL').find(p => p.id === activePeriodId);
    if (!period) return;

    const existingAttendance = erp.getPeriodAttendance(activePeriodId);
    const attendanceMap = new Map();
    existingAttendance.forEach(a => attendanceMap.set(a.student_id, a));

    const totalStudents = currentClassStudents.length || period.total_students || 45;
    const presentRecords = currentClassStudents.filter(s => {
        const rec = attendanceMap.get(s.student_id);
        return rec && (rec.status === 'PRESENT' || rec.status === 'LATE');
    });
    const presentCount = presentRecords.length;
    const absentCount = Math.max(0, totalStudents - presentCount);
    const percentRate = totalStudents > 0 ? ((presentCount / totalStudents) * 100).toFixed(1) : '0.0';

    // Populate Report Header & Meta
    document.getElementById('rep-doc-campus').innerText = getActiveCampusName();
    document.getElementById('rep-doc-ref').innerText = `ATT-${period.id.replace('per-', '')}`;
    document.getElementById('rep-doc-generated').innerText = new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
    document.getElementById('rep-class-name').innerText = period.class_name;
    document.getElementById('rep-period-slot').innerText = period.period_name;
    document.getElementById('rep-facility-type').innerText = period.facility_type === 'LIBRARY' ? 'Central Library Reading Period' : 'Computer Practical Lab';
    document.getElementById('rep-teacher-name').innerText = period.teacher_name;
    document.getElementById('rep-topic-name').innerText = period.topic || 'Class Facility Study';
    document.getElementById('rep-session-date').innerText = period.date || new Date().toISOString().split('T')[0];
    document.getElementById('rep-sign-teacher').innerText = period.teacher_name;

    // Populate Stats
    document.getElementById('rep-stat-total').innerText = totalStudents;
    document.getElementById('rep-stat-present').innerText = presentCount;
    document.getElementById('rep-stat-absent').innerText = absentCount;
    document.getElementById('rep-stat-rate').innerText = `${percentRate}%`;

    // Populate Roll Table
    const tbody = document.getElementById('rep-student-tbody');
    tbody.innerHTML = currentClassStudents.map((st, idx) => {
        const record = attendanceMap.get(st.student_id);
        const status = record ? record.status : 'ABSENT';
        const method = record ? (record.checkin_method || 'MANUAL') : '—';
        const timeStr = record && record.checkin_time ? new Date(record.checkin_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';

        let statusColor = '#dc2626';
        let statusBg = '#fef2f2';
        if (status === 'PRESENT') { statusColor = '#16a34a'; statusBg = '#f0fdf4'; }
        if (status === 'LATE') { statusColor = '#d97706'; statusBg = '#fffbeb'; }

        return `
            <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 6px 8px; font-weight: 700; color: #64748b;">${idx + 1}</td>
                <td style="padding: 6px 8px; font-family: monospace; font-weight: 700; color: #3b82f6;">${st.student_id}</td>
                <td style="padding: 6px 8px; font-weight: 600; color: #0f172a;">${st.name}</td>
                <td style="padding: 6px 8px;">
                    <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.72rem; font-weight: 800; color: ${statusColor}; background: ${statusBg}; border: 1px solid ${statusColor}30;">
                        ${status}
                    </span>
                </td>
                <td style="padding: 6px 8px; font-size: 0.75rem; color: #64748b;">${method}</td>
                <td style="padding: 6px 8px; font-size: 0.75rem; color: #64748b;">${timeStr}</td>
            </tr>
        `;
    }).join('');

    modalReport.classList.add('active');
});

document.getElementById('btn-print-pdf-report')?.addEventListener('click', () => {
    window.print();
});

document.getElementById('btn-export-attendance-csv')?.addEventListener('click', () => {
    if (!activePeriodId) return window.app.toast("Please select a period session first.", "warning", "Select Period");
    const period = erp.getPeriodSessions('ALL').find(p => p.id === activePeriodId);
    if (!period) return;

    const existingAttendance = erp.getPeriodAttendance(activePeriodId);
    const attendanceMap = new Map();
    existingAttendance.forEach(a => attendanceMap.set(a.student_id, a));

    const headers = ["Roll_No", "Student_ID", "Student_Name", "Class", "Period_Slot", "Facility", "Teacher", "Date", "Status", "Checkin_Method", "Checkin_Time"];
    const rows = currentClassStudents.map((st, idx) => {
        const rec = attendanceMap.get(st.student_id);
        const status = rec ? rec.status : 'ABSENT';
        const method = rec ? (rec.checkin_method || 'MANUAL') : 'NONE';
        const timeStr = rec && rec.checkin_time ? rec.checkin_time : '';
        return `"${idx + 1}","${st.student_id}","${st.name}","${period.class_name}","${period.period_name}","${period.facility_type}","${period.teacher_name}","${period.date || ''}","${status}","${method}","${timeStr}"`;
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Attendance_Report_${period.class_name.replace(/\s+/g, '_')}_${period.period_name.replace(/[^a-zA-Z0-9]/g, '_')}.csv`;
    link.click();
    window.app.toast("Attendance CSV exported successfully.", "success", "CSV Ready");
});

window.addEventListener('campusChanged', () => {
    activePeriodId = null;
    renderPeriodSessions();
});

document.addEventListener('DOMContentLoaded', () => {
    renderPeriodSessions();
    const periods = erp.getPeriodSessions(erp.getActiveCampusId());
    if (periods.length > 0) {
        window.selectPeriodSession(periods[0].id);
    }
});

