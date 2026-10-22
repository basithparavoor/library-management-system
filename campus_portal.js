// campus_portal.js - Executive Campus Head & Dean Management Portal
import { erp } from './erp_service.js';
import { showToast, playAudioChime } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
    initCampusDropdown();
    renderPortal();
    setupEventListeners();

    window.addEventListener('campusChanged', () => {
        renderPortal();
    });
});

function initCampusDropdown() {
    const campuses = erp.getCampuses();
    const reqCampusSelect = document.getElementById('req-campus');
    if (reqCampusSelect) {
        reqCampusSelect.innerHTML = campuses.map(c => `<option value="${c.id}">${c.name} (${c.code})</option>`).join('');
        reqCampusSelect.value = erp.getActiveCampusId() !== 'ALL' ? erp.getActiveCampusId() : (campuses[0]?.id || '');
    }
}

function renderPortal() {
    const activeCampusId = erp.getActiveCampusId();
    const campuses = erp.getCampuses();
    const currentCampus = campuses.find(c => c.id === activeCampusId) || campuses[0] || { name: 'Institutional Aggregate', code: 'ALL' };

    // Update Banner
    const deanCode = document.getElementById('dean-campus-code');
    const deanTitle = document.getElementById('dean-portal-title');
    if (activeCampusId === 'ALL') {
        deanCode.innerText = 'ALL CAMPUSES OVERVIEW';
        deanTitle.innerText = 'Institution Head & Deans Portal';
    } else {
        deanCode.innerText = `${currentCampus.code} • ${currentCampus.city?.toUpperCase() || 'CAMPUS'}`;
        deanTitle.innerText = `${currentCampus.name}`;
    }

    // Load Data
    const students = JSON.parse(localStorage.getItem('erp_students') || '[]');
    const filteredStudents = activeCampusId === 'ALL' ? students : students.filter(s => s.campus_id === activeCampusId || !s.campus_id);
    const staff = erp.getStaff(activeCampusId);
    const computers = erp.getComputers(activeCampusId);
    const requests = erp.getFacilityRequests(activeCampusId);

    const pendingRequests = requests.filter(r => r.status === 'PENDING');

    // Update KPIs
    document.getElementById('kpi-dean-students').innerText = filteredStudents.length;
    document.getElementById('kpi-dean-staff').innerText = staff.length;
    document.getElementById('kpi-dean-computers').innerText = computers.length;
    document.getElementById('kpi-dean-pending').innerText = pendingRequests.length;

    renderRequestsTable(requests);
    renderLeadershipRoster(campuses);
    renderInfrastructureSummary(computers, erp.getEventHalls(activeCampusId), erp.getPeriodSessions(activeCampusId));
}

function renderRequestsTable(requests) {
    const tbody = document.getElementById('requests-tbody');
    const filter = document.getElementById('request-status-filter')?.value || 'ALL';

    const filtered = requests.filter(r => {
        if (filter === 'ALL') return true;
        return r.status === filter;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="padding: 2.5rem 1rem; text-align: center; color: var(--text-muted);">
                    <i data-lucide="check-circle" style="width: 32px; height: 32px; opacity: 0.4; margin-bottom: 0.5rem;"></i>
                    <div style="font-weight: 600; color: var(--text-primary);">No facility requests pending in this queue</div>
                    <p style="font-size: 0.8rem; margin-top: 0.25rem;">All computer labs, library slots, and event halls are currently balanced.</p>
                </td>
            </tr>
        `;
        if (window.lucide) lucide.createIcons();

    // Refresh mobile card view
    if (window.initMobileCardTables) window.initMobileCardTables();
        return;
    }

    tbody.innerHTML = filtered.map(r => {
        let statusBadge = `<span class="badge badge-warning">PENDING REVIEW</span>`;
        if (r.status === 'APPROVED') statusBadge = `<span class="badge badge-success"><span class="badge-dot"></span> APPROVED</span>`;
        if (r.status === 'REJECTED') statusBadge = `<span class="badge badge-danger">REJECTED</span>`;

        let facLabel = 'Computer Lab';
        if (r.facility_type === 'EVENT_HALL') facLabel = 'Event Hall / Audit';
        if (r.facility_type === 'LIBRARY_PERIOD') facLabel = 'Library Reading Period';

        const isPending = r.status === 'PENDING';

        return `
            <tr>
                <td>
                    <div style="font-weight: 700; color: var(--text-primary);">${r.requester_name}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">${r.role || 'Faculty'}</div>
                </td>
                <td>
                    <span class="badge badge-brand" style="font-size: 0.7rem;">${facLabel}</span>
                </td>
                <td>
                    <div style="font-weight: 600; font-size: 0.85rem;">${r.target_date}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">${r.period_time}</div>
                </td>
                <td style="max-width: 250px;">
                    <div style="font-size: 0.82rem; color: var(--text-secondary); line-height: 1.3;">
                        ${r.reason}
                    </div>
                    ${r.approved_by ? `<div style="font-size: 0.72rem; color: var(--color-success); margin-top: 0.2rem;">Processed by: ${r.approved_by}</div>` : ''}
                </td>
                <td>${statusBadge}</td>
                <td style="text-align: right;">
                    ${isPending ? `
                        <div style="display: flex; gap: 0.4rem; justify-content: flex-end;">
                            <button class="btn btn-primary btn-approve-req" data-id="${r.id}" style="padding: 0.35rem 0.65rem; font-size: 0.75rem;">
                                <i data-lucide="check" style="width: 14px;"></i> Approve
                            </button>
                            <button class="btn btn-outline btn-reject-req" data-id="${r.id}" style="padding: 0.35rem 0.65rem; font-size: 0.75rem; color: var(--color-danger);">
                                <i data-lucide="x" style="width: 14px;"></i> Reject
                            </button>
                        </div>
                    ` : `
                        <button class="btn btn-outline btn-delete-req" data-id="${r.id}" style="padding: 0.3rem 0.5rem; font-size: 0.75rem; color: var(--text-muted);">
                            <i data-lucide="trash-2" style="width: 14px;"></i>
                        </button>
                    `}
                </td>
            </tr>
        `;
    }).join('');

    // Attach Approve / Reject listeners
    tbody.querySelectorAll('.btn-approve-req').forEach(btn => {
        btn.addEventListener('click', () => {
            const reqId = btn.dataset.id;
            erp.updateFacilityRequestStatus(reqId, 'APPROVED', 'Dean Office (Authorized)');
            playAudioChime('SUCCESS');
            showToast('Facility request approved and slot allocated!', 'success');
            renderPortal();
        });
    });

    tbody.querySelectorAll('.btn-reject-req').forEach(btn => {
        btn.addEventListener('click', () => {
            const remarks = prompt('Please enter rejection remarks / conflict reason:');
            if (remarks !== null) {
                const reqId = btn.dataset.id;
                erp.updateFacilityRequestStatus(reqId, 'REJECTED', 'Dean Office', remarks);
                playAudioChime('ERROR');
                showToast('Facility request rejected', 'info');
                renderPortal();
            }
        });
    });

    tbody.querySelectorAll('.btn-delete-req').forEach(btn => {
        btn.addEventListener('click', () => {
            if (confirm('Delete this request record?')) {
                erp.deleteFacilityRequest(btn.dataset.id);
                renderPortal();
            }
        });
    });

    if (window.lucide) lucide.createIcons();

    // Refresh mobile card view
    if (window.initMobileCardTables) window.initMobileCardTables();
}

function renderLeadershipRoster(campuses) {
    const container = document.getElementById('leadership-roster-list');
    container.innerHTML = campuses.map(c => `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem; border-radius: var(--radius-md); background: var(--bg-card); border: 1px solid var(--border-color);">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
                <div style="width: 38px; height: 38px; border-radius: 50%; background: var(--brand-gradient); color: white; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.85rem;">
                    ${c.code}
                </div>
                <div>
                    <div style="font-weight: 700; font-size: 0.9rem; color: var(--text-primary);">${c.head_name}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">${c.name} • ${c.email}</div>
                </div>
            </div>
            <span class="badge badge-brand" style="font-size: 0.65rem;">Dean</span>
        </div>
    `).join('');
}

function renderInfrastructureSummary(computers, halls, periods) {
    const container = document.getElementById('infrastructure-summary');
    const availableComps = computers.filter(c => c.status === 'AVAILABLE').length;
    const occupiedComps = computers.filter(c => c.status === 'IN_USE').length;

    container.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.65rem 0.85rem; border-radius: var(--radius-md); background: var(--bg-card); border: 1px solid var(--border-color);">
            <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; font-weight: 600;">
                <i data-lucide="monitor" style="width: 16px; color: var(--brand-primary);"></i>
                Workstation Availability
            </div>
            <div style="font-size: 0.8rem; font-weight: 700;">
                <span style="color: var(--color-success);">${availableComps} Free</span> / <span style="color: var(--color-warning);">${occupiedComps} In Use</span>
            </div>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.65rem 0.85rem; border-radius: var(--radius-md); background: var(--bg-card); border: 1px solid var(--border-color);">
            <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; font-weight: 600;">
                <i data-lucide="ticket" style="width: 16px; color: var(--brand-accent);"></i>
                Auditoriums & Event Halls
            </div>
            <div style="font-size: 0.8rem; font-weight: 700; color: var(--text-primary);">
                ${halls.length} Registered Venues
            </div>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.65rem 0.85rem; border-radius: var(--radius-md); background: var(--bg-card); border: 1px solid var(--border-color);">
            <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; font-weight: 600;">
                <i data-lucide="calendar" style="width: 16px; color: var(--color-success);"></i>
                Active Period Sessions Today
            </div>
            <div style="font-size: 0.8rem; font-weight: 700; color: var(--brand-primary);">
                ${periods.length} Scheduled Periods
            </div>
        </div>
    `;

    if (window.lucide) lucide.createIcons();

    // Refresh mobile card view
    if (window.initMobileCardTables) window.initMobileCardTables();
}

function setupEventListeners() {
    document.getElementById('request-status-filter')?.addEventListener('change', () => {
        renderRequestsTable(erp.getFacilityRequests(erp.getActiveCampusId()));
    });

    // Request Modal
    const modal = document.getElementById('modal-request');
    document.getElementById('btn-open-request-modal')?.addEventListener('click', () => {
        const tom = new Date(Date.now() + 86400 * 1000).toISOString().split('T')[0];
        document.getElementById('req-date').value = tom;
        modal.style.display = 'flex';
    });

    document.getElementById('btn-close-request-modal')?.addEventListener('click', () => modal.style.display = 'none');
    document.getElementById('btn-cancel-request')?.addEventListener('click', () => modal.style.display = 'none');

    document.getElementById('form-facility-request')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const campusId = document.getElementById('req-campus').value;
        const name = document.getElementById('req-name').value.trim();
        const role = document.getElementById('req-role').value;
        const facility = document.getElementById('req-facility-type').value;
        const targetDate = document.getElementById('req-date').value;
        const periodTime = document.getElementById('req-time').value.trim();
        const reason = document.getElementById('req-reason').value.trim();

        erp.submitFacilityRequest({
            campus_id: campusId,
            requester_name: name,
            role: role,
            facility_type: facility,
            target_date: targetDate,
            period_time: periodTime,
            reason: reason
        });

        playAudioChime('SUCCESS');
        showToast('Facility request submitted to Dean office queue!', 'success');
        modal.style.display = 'none';
        document.getElementById('form-facility-request').reset();
        renderPortal();
    });
}

