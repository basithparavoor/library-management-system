// reports.js - Institutional Dynamic Report & Analytics Engine
import { erp } from './erp_service.js';
import { supabase } from './supabaseClient.js';
import { showToast, playAudioChime } from './ui.js';

let activeReportData = [];
let activeColumns = [];

document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    generateReport(); // Generate default report on load
});

function setupEventListeners() {
    const timeframeSelect = document.getElementById('report-timeframe');
    const startGroup = document.getElementById('group-start-date');
    const endGroup = document.getElementById('group-end-date');

    timeframeSelect?.addEventListener('change', (e) => {
        if (e.target.value === 'custom') {
            startGroup.style.display = 'block';
            endGroup.style.display = 'block';
        } else {
            startGroup.style.display = 'none';
            endGroup.style.display = 'none';
        }
    });

    document.getElementById('btn-generate')?.addEventListener('click', generateReport);
    document.getElementById('report-type')?.addEventListener('change', generateReport);
    document.getElementById('btn-export-csv')?.addEventListener('click', exportToCsv);

    window.addEventListener('campusChanged', generateReport);
}

async function generateReport() {
    const category = document.getElementById('report-type')?.value || 'computers';
    const timeframe = document.getElementById('report-timeframe')?.value || 'all';
    const startDate = document.getElementById('report-start-date')?.value;
    const endDate = document.getElementById('report-end-date')?.value;
    const campusId = erp.getActiveCampusId();

    const thead = document.getElementById('report-thead');
    const tbody = document.getElementById('report-tbody');
    const kpiRow = document.getElementById('report-kpi-row');
    const recordCount = document.getElementById('report-record-count');
    const titleEl = document.getElementById('report-table-title');
    const subtitleEl = document.getElementById('report-table-subtitle');

    tbody.innerHTML = `
        <tr>
            <td style="padding: 3rem 1rem; text-align: center; color: var(--text-muted);">
                <div class="loading-spinner" style="margin: 0 auto 0.5rem;"></div>
                <div>Aggregating multi-campus records...</div>
            </td>
        </tr>
    `;

    playAudioChime('TAP');

    try {
        if (category === 'computers') {
            await renderComputerUsageReport(timeframe, campusId, startDate, endDate);
        } else if (category === 'attendance') {
            await renderAttendanceReport(campusId);
        } else if (category === 'events') {
            await renderEventsReport(campusId);
        } else if (category === 'overdue') {
            await renderOverdueReport();
        } else if (category === 'active_loans') {
            await renderActiveLoansReport();
        } else if (category === 'campus_summary') {
            await renderCampusSummaryReport();
        }

        if (window.lucide) lucide.createIcons();

    // Refresh mobile card view
    if (window.initMobileCardTables) window.initMobileCardTables();
    } catch (err) {
        console.error('Report Generation Error:', err);
        tbody.innerHTML = `
            <tr>
                <td style="padding: 2.5rem; text-align: center; color: var(--color-danger);">
                    Failed to compile report: ${err.message}
                </td>
            </tr>
        `;
        showToast('Error generating report', 'error');
    }
}

// 1. Computer Lab Usage & Duration Report
async function renderComputerUsageReport(timeframe, campusId, startDate, endDate) {
    let sessions = erp.getComputerSessions({ campus_id: campusId });
    const now = new Date();

    if (timeframe === 'day') {
        const todayStr = now.toISOString().split('T')[0];
        sessions = sessions.filter(s => s.start_time.startsWith(todayStr));
    } else if (timeframe === 'week') {
        const oneWeekAgo = new Date(now.getTime() - 7 * 86400 * 1000);
        sessions = sessions.filter(s => new Date(s.start_time) >= oneWeekAgo);
    } else if (timeframe === 'month') {
        const oneMonthAgo = new Date(now.getTime() - 30 * 86400 * 1000);
        sessions = sessions.filter(s => new Date(s.start_time) >= oneMonthAgo);
    } else if (timeframe === 'custom' && startDate && endDate) {
        sessions = sessions.filter(s => {
            const st = new Date(s.start_time);
            return st >= new Date(startDate) && st <= new Date(endDate + 'T23:59:59');
        });
    }

    const totalMinutes = sessions.reduce((acc, s) => acc + (s.duration_minutes || 0), 0);
    const totalHours = (totalMinutes / 60).toFixed(1);
    const activeSessions = sessions.filter(s => s.status === 'ACTIVE').length;

    // Set KPIs
    const kpiRow = document.getElementById('report-kpi-row');
    kpiRow.style.display = 'grid';
    kpiRow.innerHTML = `
        <div class="stat-card">
            <div class="stat-icon" style="background: rgba(59, 130, 246, 0.1); color: var(--brand-primary);"><i data-lucide="monitor"></i></div>
            <div><div class="stat-label">Total Lab Sessions</div><div class="stat-value">${sessions.length}</div></div>
        </div>
        <div class="stat-card">
            <div class="stat-icon" style="background: rgba(16, 185, 129, 0.1); color: var(--color-success);"><i data-lucide="clock"></i></div>
            <div><div class="stat-label">Total Usage Hours</div><div class="stat-value">${totalHours} hrs</div></div>
        </div>
        <div class="stat-card">
            <div class="stat-icon" style="background: rgba(245, 158, 11, 0.1); color: var(--color-warning);"><i data-lucide="activity"></i></div>
            <div><div class="stat-label">Active Workstations</div><div class="stat-value">${activeSessions}</div></div>
        </div>
        <div class="stat-card">
            <div class="stat-icon" style="background: rgba(139, 92, 246, 0.1); color: var(--brand-accent);"><i data-lucide="user"></i></div>
            <div><div class="stat-label">Avg Session Time</div><div class="stat-value">${sessions.length ? Math.round(totalMinutes/sessions.length) : 0} min</div></div>
        </div>
    `;

    document.getElementById('report-table-title').innerText = 'Computer Lab Workstation Usage Register';
    document.getElementById('report-table-subtitle').innerText = `Aggregated logs by student, machine code, and duration`;
    document.getElementById('report-record-count').innerText = `${sessions.length} Sessions Logged`;

    activeColumns = ['Machine Code', 'Student Name', 'Student ID', 'Start Time', 'End Time', 'Duration (Mins)', 'Academic Purpose', 'Status'];
    activeReportData = sessions.map(s => ({
        'Machine Code': s.machine_code,
        'Student Name': s.student_name,
        'Student ID': s.student_id,
        'Start Time': new Date(s.start_time).toLocaleString(),
        'End Time': s.end_time ? new Date(s.end_time).toLocaleString() : 'In Session',
        'Duration (Mins)': s.duration_minutes || 0,
        'Academic Purpose': s.purpose || 'Research',
        'Status': s.status
    }));

    document.getElementById('report-thead').innerHTML = `
        <tr>
            <th>Machine Code</th>
            <th>Student Member</th>
            <th>Student ID</th>
            <th>Start Time</th>
            <th>End Time</th>
            <th>Duration</th>
            <th>Academic Purpose</th>
            <th>Status</th>
        </tr>
    `;

    const tbody = document.getElementById('report-tbody');
    if (sessions.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="padding: 2.5rem; text-align: center; color: var(--text-muted);">No computer sessions found for selected filters.</td></tr>`;
        return;
    }

    tbody.innerHTML = sessions.map(s => `
        <tr>
            <td style="font-family: var(--font-mono); font-weight: 700; color: var(--brand-primary);">${s.machine_code}</td>
            <td style="font-weight: 600;">${s.student_name}</td>
            <td style="font-family: var(--font-mono); font-size: 0.85rem;">${s.student_id}</td>
            <td style="font-size: 0.8rem; color: var(--text-muted);">${new Date(s.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
            <td style="font-size: 0.8rem; color: var(--text-muted);">${s.end_time ? new Date(s.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '<span class="badge badge-warning">LIVE</span>'}</td>
            <td style="font-weight: 700; font-family: var(--font-mono); color: var(--color-success);">${s.duration_minutes || 0} mins</td>
            <td style="font-size: 0.82rem; color: var(--text-secondary); max-width: 200px;">${s.purpose || 'Research'}</td>
            <td><span class="badge ${s.status === 'ACTIVE' ? 'badge-warning' : 'badge-success'}">${s.status}</span></td>
        </tr>
    `).join('');
}

// 2. Class Period Attendance Register
async function renderAttendanceReport(campusId) {
    const periods = erp.getPeriodSessions(campusId);
    const totalPeriods = periods.length;
    const totalEnrolled = periods.reduce((sum, p) => sum + (p.total_students || 0), 0);
    const totalPresent = periods.reduce((sum, p) => sum + (p.present_count || 0), 0);
    const avgRate = totalEnrolled > 0 ? Math.round((totalPresent / totalEnrolled) * 100) : 0;

    const kpiRow = document.getElementById('report-kpi-row');
    kpiRow.style.display = 'grid';
    kpiRow.innerHTML = `
        <div class="stat-card">
            <div class="stat-icon" style="background: rgba(59, 130, 246, 0.1); color: var(--brand-primary);"><i data-lucide="calendar-check"></i></div>
            <div><div class="stat-label">Total Class Periods</div><div class="stat-value">${totalPeriods}</div></div>
        </div>
        <div class="stat-card">
            <div class="stat-icon" style="background: rgba(16, 185, 129, 0.1); color: var(--color-success);"><i data-lucide="user-check"></i></div>
            <div><div class="stat-label">Present Headcount</div><div class="stat-value">${totalPresent}</div></div>
        </div>
        <div class="stat-card">
            <div class="stat-icon" style="background: rgba(245, 158, 11, 0.1); color: var(--color-warning);"><i data-lucide="percent"></i></div>
            <div><div class="stat-label">Avg Attendance %</div><div class="stat-value">${avgRate}%</div></div>
        </div>
        <div class="stat-card">
            <div class="stat-icon" style="background: rgba(139, 92, 246, 0.1); color: var(--brand-accent);"><i data-lucide="radio"></i></div>
            <div><div class="stat-label">Check-in Mode</div><div class="stat-value" style="font-size: 1.1rem; color: var(--color-success);">NFC/QR/Roll</div></div>
        </div>
    `;

    document.getElementById('report-table-title').innerText = 'Class Period Attendance Register';
    document.getElementById('report-table-subtitle').innerText = 'Reading halls and computer lab batch attendance logs';
    document.getElementById('report-record-count').innerText = `${periods.length} Periods Recorded`;

    activeColumns = ['Date', 'Period Slot', 'Facility', 'Class / Batch', 'Department', 'Faculty / Teacher', 'Present / Total', 'Attendance Rate', 'Status'];
    activeReportData = periods.map(p => {
        const rate = p.total_students ? Math.round((p.present_count / p.total_students) * 100) : 0;
        return {
            'Date': p.date,
            'Period Slot': p.period_name,
            'Facility': p.facility_type,
            'Class / Batch': p.class_name,
            'Department': p.department_name,
            'Faculty / Teacher': p.teacher_name,
            'Present / Total': `${p.present_count} / ${p.total_students}`,
            'Attendance Rate': `${rate}%`,
            'Status': p.status
        };
    });

    document.getElementById('report-thead').innerHTML = `
        <tr>
            <th>Date & Slot</th>
            <th>Facility</th>
            <th>Class / Batch</th>
            <th>Department</th>
            <th>Faculty / Teacher</th>
            <th>Attendance</th>
            <th>Rate</th>
            <th>Status</th>
        </tr>
    `;

    const tbody = document.getElementById('report-tbody');
    tbody.innerHTML = periods.map(p => {
        const rate = p.total_students ? Math.round((p.present_count / p.total_students) * 100) : 0;
        return `
            <tr>
                <td>
                    <div style="font-weight: 700;">${p.date}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">${p.period_name}</div>
                </td>
                <td><span class="badge badge-brand" style="font-size: 0.7rem;">${p.facility_type}</span></td>
                <td style="font-weight: 600;">${p.class_name}</td>
                <td style="font-size: 0.85rem; color: var(--text-secondary);">${p.department_name}</td>
                <td style="font-size: 0.85rem;"><strong>${p.teacher_name}</strong></td>
                <td style="font-family: var(--font-mono); font-weight: 700;">${p.present_count} / ${p.total_students}</td>
                <td><span class="badge ${rate >= 75 ? 'badge-success' : 'badge-warning'}">${rate}%</span></td>
                <td><span class="badge ${p.status === 'ACTIVE' ? 'badge-warning' : 'badge-success'}">${p.status}</span></td>
            </tr>
        `;
    }).join('');
}

// 3. Event Halls & Auditoriums Report
async function renderEventsReport(campusId) {
    const events = erp.getEvents(campusId);
    const totalReg = events.reduce((sum, e) => sum + (e.registered_count || 0), 0);

    const kpiRow = document.getElementById('report-kpi-row');
    kpiRow.style.display = 'grid';
    kpiRow.innerHTML = `
        <div class="stat-card">
            <div class="stat-icon" style="background: rgba(59, 130, 246, 0.1); color: var(--brand-primary);"><i data-lucide="ticket"></i></div>
            <div><div class="stat-label">Scheduled Events</div><div class="stat-value">${events.length}</div></div>
        </div>
        <div class="stat-card">
            <div class="stat-icon" style="background: rgba(16, 185, 129, 0.1); color: var(--color-success);"><i data-lucide="users"></i></div>
            <div><div class="stat-label">Total Registrations</div><div class="stat-value">${totalReg}</div></div>
        </div>
        <div class="stat-card">
            <div class="stat-icon" style="background: rgba(245, 158, 11, 0.1); color: var(--color-warning);"><i data-lucide="door-open"></i></div>
            <div><div class="stat-label">Venues Booked</div><div class="stat-value">${new Set(events.map(e => e.hall_id)).size}</div></div>
        </div>
        <div class="stat-card">
            <div class="stat-icon" style="background: rgba(139, 92, 246, 0.1); color: var(--brand-accent);"><i data-lucide="check-circle"></i></div>
            <div><div class="stat-label">Approval Rate</div><div class="stat-value">100%</div></div>
        </div>
    `;

    document.getElementById('report-table-title').innerText = 'Auditorium & Event Hall Reservations';
    document.getElementById('report-table-subtitle').innerText = 'Conferences, symposiums, and workshop attendance rosters';
    document.getElementById('report-record-count').innerText = `${events.length} Events Listed`;

    activeColumns = ['Event Title', 'Auditorium / Hall', 'Organizer', 'Conductor / Host', 'Start Datetime', 'Capacity', 'Registered', 'Status'];
    activeReportData = events.map(e => ({
        'Event Title': e.title,
        'Auditorium / Hall': e.hall_name || 'Auditorium',
        'Organizer': e.organizer_name,
        'Conductor / Host': e.conductor_name,
        'Start Datetime': new Date(e.start_datetime).toLocaleString(),
        'Capacity': e.expected_attendees || 300,
        'Registered': e.registered_count || 0,
        'Status': e.status
    }));

    document.getElementById('report-thead').innerHTML = `
        <tr>
            <th>Event Title</th>
            <th>Hall Venue</th>
            <th>Organizer</th>
            <th>Conductor / Host</th>
            <th>Start Date & Time</th>
            <th>Attendance Roster</th>
            <th>Status</th>
        </tr>
    `;

    const tbody = document.getElementById('report-tbody');
    tbody.innerHTML = events.map(e => `
        <tr>
            <td style="font-weight: 700; color: var(--text-primary);">${e.title}</td>
            <td><span class="badge badge-brand">${e.hall_name || 'Auditorium'}</span></td>
            <td style="font-size: 0.85rem; color: var(--text-secondary);">${e.organizer_name}</td>
            <td style="font-size: 0.85rem;"><strong>${e.conductor_name}</strong></td>
            <td style="font-size: 0.8rem; color: var(--text-muted);">${new Date(e.start_datetime).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</td>
            <td style="font-family: var(--font-mono); font-weight: 700;">${e.registered_count || 0} / ${e.expected_attendees || 300}</td>
            <td><span class="badge badge-success">${e.status}</span></td>
        </tr>
    `).join('');
}

// 4. Overdue Books & Fines Notice
async function renderOverdueReport() {
    const { data: issues } = await supabase.from('issues').select('*, books(*), students(*)').eq('status', 'ISSUED');
    const now = new Date();
    const overdues = (issues || []).filter(i => new Date(i.due_date) < now);

    const totalFines = overdues.length * 15;

    const kpiRow = document.getElementById('report-kpi-row');
    kpiRow.style.display = 'grid';
    kpiRow.innerHTML = `
        <div class="stat-card">
            <div class="stat-icon" style="background: rgba(239, 68, 68, 0.1); color: var(--color-danger);"><i data-lucide="alert-triangle"></i></div>
            <div><div class="stat-label">Overdue Loans</div><div class="stat-value">${overdues.length}</div></div>
        </div>
        <div class="stat-card">
            <div class="stat-icon" style="background: rgba(245, 158, 11, 0.1); color: var(--color-warning);"><i data-lucide="dollar-sign"></i></div>
            <div><div class="stat-label">Accumulated Fines</div><div class="stat-value">$${totalFines}</div></div>
        </div>
        <div class="stat-card">
            <div class="stat-icon" style="background: rgba(59, 130, 246, 0.1); color: var(--brand-primary);"><i data-lucide="bell"></i></div>
            <div><div class="stat-label">Auto Notices</div><div class="stat-value" style="font-size: 1.1rem; color: var(--color-success);">READY</div></div>
        </div>
    `;

    document.getElementById('report-table-title').innerText = 'Overdue Book Notices & Penalty Ledger';
    document.getElementById('report-table-subtitle').innerText = 'Circulation loans past due date requiring recovery';
    document.getElementById('report-record-count').innerText = `${overdues.length} Overdue Items`;

    activeColumns = ['Member ID', 'Member Name', 'Book Title', 'Barcode', 'Issue Date', 'Due Date', 'Days Overdue', 'Est Fine'];
    activeReportData = overdues.map(i => {
        const days = Math.floor((now - new Date(i.due_date)) / (1000 * 60 * 60 * 24));
        return {
            'Member ID': i.students?.student_id || 'N/A',
            'Member Name': i.students?.name || 'N/A',
            'Book Title': i.books?.title || 'N/A',
            'Barcode': i.barcode || 'N/A',
            'Issue Date': i.issue_date,
            'Due Date': i.due_date,
            'Days Overdue': days,
            'Est Fine': `$${days * 1.5}`
        };
    });

    document.getElementById('report-thead').innerHTML = `
        <tr>
            <th>Member ID & Name</th>
            <th>Book Title</th>
            <th>Due Date</th>
            <th>Days Overdue</th>
            <th>Fine Accrued</th>
        </tr>
    `;

    const tbody = document.getElementById('report-tbody');
    if (overdues.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="padding: 2.5rem; text-align: center; color: var(--text-muted);">No overdue books currently. All loans are in good standing!</td></tr>`;
        return;
    }

    tbody.innerHTML = overdues.map(i => {
        const days = Math.floor((now - new Date(i.due_date)) / (1000 * 60 * 60 * 24));
        return `
            <tr>
                <td>
                    <div style="font-weight: 700;">${i.students?.name || 'Patron'}</div>
                    <div style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-muted);">${i.students?.student_id || ''}</div>
                </td>
                <td style="font-weight: 600;">${i.books?.title || 'Unknown Title'}</td>
                <td style="color: var(--color-danger); font-weight: 600;">${i.due_date}</td>
                <td style="font-weight: 700; color: var(--color-danger);">${days} days</td>
                <td style="font-weight: 700; color: var(--color-warning);">$${(days * 1.5).toFixed(2)}</td>
            </tr>
        `;
    }).join('');
}

// 5. Active Circulation & Loans
async function renderActiveLoansReport() {
    const { data: issues } = await supabase.from('issues').select('*, books(*), students(*)').eq('status', 'ISSUED');
    const loans = issues || [];

    const kpiRow = document.getElementById('report-kpi-row');
    kpiRow.style.display = 'grid';
    kpiRow.innerHTML = `
        <div class="stat-card">
            <div class="stat-icon" style="background: rgba(59, 130, 246, 0.1); color: var(--brand-primary);"><i data-lucide="repeat"></i></div>
            <div><div class="stat-label">Active Loans</div><div class="stat-value">${loans.length}</div></div>
        </div>
        <div class="stat-card">
            <div class="stat-icon" style="background: rgba(16, 185, 129, 0.1); color: var(--color-success);"><i data-lucide="book-open"></i></div>
            <div><div class="stat-label">Borrowed Titles</div><div class="stat-value">${new Set(loans.map(l => l.book_id)).size}</div></div>
        </div>
    `;

    document.getElementById('report-table-title').innerText = 'Active Circulation & Loan Ledger';
    document.getElementById('report-table-subtitle').innerText = 'All checked-out physical copies across branches';
    document.getElementById('report-record-count').innerText = `${loans.length} Active Loans`;

    activeColumns = ['Issue ID', 'Book Title', 'Barcode', 'Patron Name', 'Patron ID', 'Issue Date', 'Due Date'];
    activeReportData = loans.map(l => ({
        'Issue ID': l.id,
        'Book Title': l.books?.title || 'N/A',
        'Barcode': l.barcode || 'N/A',
        'Patron Name': l.students?.name || 'N/A',
        'Patron ID': l.students?.student_id || 'N/A',
        'Issue Date': l.issue_date,
        'Due Date': l.due_date
    }));

    document.getElementById('report-thead').innerHTML = `
        <tr>
            <th>Barcode</th>
            <th>Book Title</th>
            <th>Patron</th>
            <th>Issue Date</th>
            <th>Due Date</th>
            <th>Status</th>
        </tr>
    `;

    const tbody = document.getElementById('report-tbody');
    if (loans.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="padding: 2.5rem; text-align: center; color: var(--text-muted);">No active loans recorded.</td></tr>`;
        return;
    }

    tbody.innerHTML = loans.map(l => `
        <tr>
            <td style="font-family: var(--font-mono); font-weight: 700; color: var(--brand-primary);">${l.barcode || '-'}</td>
            <td style="font-weight: 600;">${l.books?.title || 'Unknown Title'}</td>
            <td>
                <div style="font-weight: 600;">${l.students?.name || 'Patron'}</div>
                <div style="font-size: 0.75rem; color: var(--text-muted);">${l.students?.student_id || ''}</div>
            </td>
            <td style="font-size: 0.85rem;">${l.issue_date}</td>
            <td style="font-size: 0.85rem; font-weight: 600;">${l.due_date}</td>
            <td><span class="badge badge-brand">CHECKED OUT</span></td>
        </tr>
    `).join('');
}

// 6. Multi-Campus Executive Summary
async function renderCampusSummaryReport() {
    const campuses = erp.getCampuses();
    const students = JSON.parse(localStorage.getItem('erp_students') || '[]');
    const staff = erp.getStaff('ALL');
    const computers = erp.getComputers('ALL');
    const halls = erp.getEventHalls('ALL');

    const kpiRow = document.getElementById('report-kpi-row');
    kpiRow.style.display = 'grid';
    kpiRow.innerHTML = `
        <div class="stat-card">
            <div class="stat-icon" style="background: rgba(59, 130, 246, 0.1); color: var(--brand-primary);"><i data-lucide="building-2"></i></div>
            <div><div class="stat-label">Total Campuses</div><div class="stat-value">${campuses.length}</div></div>
        </div>
        <div class="stat-card">
            <div class="stat-icon" style="background: rgba(16, 185, 129, 0.1); color: var(--color-success);"><i data-lucide="users"></i></div>
            <div><div class="stat-label">Total Students</div><div class="stat-value">${students.length}</div></div>
        </div>
        <div class="stat-card">
            <div class="stat-icon" style="background: rgba(139, 92, 246, 0.1); color: var(--brand-accent);"><i data-lucide="monitor"></i></div>
            <div><div class="stat-label">Total Workstations</div><div class="stat-value">${computers.length}</div></div>
        </div>
    `;

    document.getElementById('report-table-title').innerText = 'Multi-Campus Executive Infrastructure Audit';
    document.getElementById('report-table-subtitle').innerText = 'Campus-wise breakdown of faculty, students, computer labs, and auditoriums';
    document.getElementById('report-record-count').innerText = `${campuses.length} Campuses Reported`;

    activeColumns = ['Campus Code', 'Campus Name', 'City', 'Dean / Campus Head', 'Faculty Count', 'Lab Workstations', 'Event Halls'];
    activeReportData = campuses.map(c => {
        const cStaff = staff.filter(s => s.campus_id === c.id).length;
        const cComps = computers.filter(co => co.campus_id === c.id).length;
        const cHalls = halls.filter(h => h.campus_id === c.id).length;
        return {
            'Campus Code': c.code,
            'Campus Name': c.name,
            'City': c.city,
            'Dean / Campus Head': c.head_name,
            'Faculty Count': cStaff,
            'Lab Workstations': cComps,
            'Event Halls': cHalls
        };
    });

    document.getElementById('report-thead').innerHTML = `
        <tr>
            <th>Campus Code</th>
            <th>Campus Name</th>
            <th>City</th>
            <th>Dean / Campus Head</th>
            <th>Faculty Count</th>
            <th>Lab Workstations</th>
            <th>Event Halls</th>
        </tr>
    `;

    const tbody = document.getElementById('report-tbody');
    tbody.innerHTML = activeReportData.map(c => `
        <tr>
            <td><span class="badge badge-brand">${c['Campus Code']}</span></td>
            <td style="font-weight: 700; color: var(--text-primary);">${c['Campus Name']}</td>
            <td>${c['City']}</td>
            <td style="font-weight: 600;">${c['Dean / Campus Head']}</td>
            <td style="font-family: var(--font-mono); font-weight: 700;">${c['Faculty Count']}</td>
            <td style="font-family: var(--font-mono); font-weight: 700; color: var(--brand-primary);">${c['Lab Workstations']}</td>
            <td style="font-family: var(--font-mono); font-weight: 700; color: var(--brand-accent);">${c['Event Halls']}</td>
        </tr>
    `).join('');
}

// CSV Export Utility
function exportToCsv() {
    if (!activeReportData || activeReportData.length === 0) {
        showToast('No report data available to export', 'warning');
        return;
    }

    const headers = activeColumns;
    const csvRows = [headers.join(',')];

    activeReportData.forEach(row => {
        const values = headers.map(header => {
            const val = row[header] !== undefined ? String(row[header]) : '';
            return `"${val.replace(/"/g, '""')}"`;
        });
        csvRows.push(values.join(','));
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + csvRows.join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `TGI_ERP_Report_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    playAudioChime('SUCCESS');
    showToast('Report successfully exported as CSV!', 'success');
}
