// reading_logs.js - Academic School Reading Program, Classroom Sets & Inter-Campus Transfer
import { erp } from './erp_service.js';
import { showToast, playAudioChime } from './ui.js';

let activeTab = 'reading';

document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initCampusDropdowns();
    renderAll();
    setupEventListeners();

    window.addEventListener('campusChanged', () => {
        initCampusDropdowns();
        renderAll();
    });
});

function initTabs() {
    const tabReading = document.getElementById('tab-reading-btn');
    const tabSets = document.getElementById('tab-sets-btn');
    const tabTransfers = document.getElementById('tab-transfers-btn');
    const tabDamage = document.getElementById('tab-damage-btn');

    const secReading = document.getElementById('section-reading');
    const secSets = document.getElementById('section-sets');
    const secTransfers = document.getElementById('section-transfers');
    const secDamage = document.getElementById('section-damage');

    function switchTab(tab) {
        activeTab = tab;
        tabReading.className = tab === 'reading' ? 'btn btn-primary' : 'btn btn-outline';
        tabSets.className = tab === 'sets' ? 'btn btn-primary' : 'btn btn-outline';
        tabTransfers.className = tab === 'transfers' ? 'btn btn-primary' : 'btn btn-outline';
        tabDamage.className = tab === 'damage' ? 'btn btn-primary' : 'btn btn-outline';

        secReading.style.display = tab === 'reading' ? 'block' : 'none';
        secSets.style.display = tab === 'sets' ? 'block' : 'none';
        secTransfers.style.display = tab === 'transfers' ? 'block' : 'none';
        secDamage.style.display = tab === 'damage' ? 'block' : 'none';

        if (window.lucide) lucide.createIcons();

    // Refresh mobile card view
    if (window.initMobileCardTables) window.initMobileCardTables();
    }

    tabReading.addEventListener('click', () => switchTab('reading'));
    tabSets.addEventListener('click', () => switchTab('sets'));
    tabTransfers.addEventListener('click', () => switchTab('transfers'));
    tabDamage.addEventListener('click', () => switchTab('damage'));
}

function initCampusDropdowns() {
    const campuses = erp.getCampuses();
    const trFrom = document.getElementById('tr-from');
    const trTo = document.getElementById('tr-to');

    if (trFrom && trTo) {
        trFrom.innerHTML = campuses.map(c => `<option value="${c.id}">${c.name} (${c.code})</option>`).join('');
        trTo.innerHTML = campuses.map(c => `<option value="${c.id}">${c.name} (${c.code})</option>`).join('');
        if (campuses.length > 1) trTo.selectedIndex = 1;
    }
}

function renderAll() {
    const campusId = erp.getActiveCampusId();

    renderReadingLogs();
    renderClassroomSets(campusId);
    renderTransfers(campusId);
    renderDamageAudits(campusId);
}

function renderReadingLogs() {
    const logs = erp.getReadingLogs();
    const tbody = document.getElementById('reading-logs-tbody');

    if (!logs || logs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="padding: 2.5rem; text-align: center; color: var(--text-muted);">No student reading logs recorded yet.</td></tr>`;
        return;
    }

    tbody.innerHTML = logs.map(l => {
        let badge = `<span class="badge badge-brand"><span class="badge-dot"></span> Bronze Reader</span>`;
        if (l.pages_read > 30) badge = `<span class="badge badge-success"><span class="badge-dot"></span> Silver Scholar</span>`;
        if (l.pages_read > 60) badge = `<span class="badge" style="background: rgba(245,158,11,0.1); color: var(--color-warning);"><span class="badge-dot"></span> Gold Master</span>`;

        return `
            <tr>
                <td>
                    <div style="font-weight: 700; color: var(--text-primary);">${l.student_name}</div>
                    <div style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-muted);">${l.student_id}</div>
                </td>
                <td style="font-weight: 600;">${l.book_title}</td>
                <td style="font-weight: 700; font-family: var(--font-mono); color: var(--brand-primary);">${l.pages_read} pages</td>
                <td style="font-size: 0.85rem;">${l.minutes_spent} mins</td>
                <td style="font-size: 0.8rem; color: var(--text-muted);">${l.date}</td>
                <td>${badge}</td>
            </tr>
        `;
    }).join('');
}

function renderClassroomSets(campusId) {
    let sets = erp.getClassroomSets(campusId);
    const tbody = document.getElementById('classroom-sets-tbody');

    if (!sets || sets.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="padding: 2.5rem; text-align: center; color: var(--text-muted);">No bulk classroom book sets currently issued.</td></tr>`;
        return;
    }

    tbody.innerHTML = sets.map(s => {
        const isBorrowed = s.status === 'BORROWED_FOR_CLASS';
        return `
            <tr>
                <td style="font-weight: 700; color: var(--text-primary);">${s.set_title}</td>
                <td><strong>${s.teacher_name}</strong></td>
                <td><span class="badge badge-brand" style="font-size: 0.7rem;">${s.grade_class}</span></td>
                <td style="font-family: var(--font-mono); font-weight: 700; color: var(--color-success);">${s.copies_count} copies</td>
                <td style="font-size: 0.85rem;">${s.borrow_date}</td>
                <td style="font-size: 0.85rem; font-weight: 600;">${s.due_date}</td>
                <td><span class="badge ${isBorrowed ? 'badge-warning' : 'badge-success'}">${isBorrowed ? 'IN CLASSROOM' : 'RETURNED'}</span></td>
                <td style="text-align: right;">
                    ${isBorrowed ? `
                        <button class="btn btn-primary btn-sm btn-return-set" data-id="${s.id}" style="padding: 0.3rem 0.6rem; font-size: 0.75rem;">
                            <i data-lucide="corner-down-left" style="width: 14px;"></i> Return to Library
                        </button>
                    ` : '<span style="color: var(--text-muted); font-size: 0.75rem;">Completed</span>'}
                </td>
            </tr>
        `;
    }).join('');

    tbody.querySelectorAll('.btn-return-set').forEach(btn => {
        btn.addEventListener('click', () => {
            erp.returnClassroomSet(btn.dataset.id);
            playAudioChime('SUCCESS');
            showToast('Classroom book set returned to central library inventory!', 'success');
            renderClassroomSets(erp.getActiveCampusId());
        });
    });
}

function renderTransfers(campusId) {
    let transfers = erp.getCampusTransfers(campusId);
    const tbody = document.getElementById('transfers-tbody');
    const campuses = erp.getCampuses();

    if (!transfers || transfers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="padding: 2.5rem; text-align: center; color: var(--text-muted);">No inter-campus book transfers active.</td></tr>`;
        return;
    }

    tbody.innerHTML = transfers.map(t => {
        const fromName = campuses.find(c => c.id === t.from_campus)?.code || 'Main';
        const toName = campuses.find(c => c.id === t.to_campus)?.code || 'Branch';
        const inTransit = t.status === 'IN_TRANSIT_COURIER';

        return `
            <tr>
                <td style="font-family: var(--font-mono); font-weight: 700; color: var(--brand-primary);">${t.id}</td>
                <td style="font-weight: 700;">${t.book_title}</td>
                <td style="font-family: var(--font-mono); font-weight: 700;">${t.quantity} copies</td>
                <td><span class="badge badge-brand">${fromName}</span></td>
                <td><span class="badge badge-success">${toName}</span></td>
                <td><span class="badge ${inTransit ? 'badge-warning' : 'badge-success'}">${inTransit ? 'VAN COURIER' : 'DELIVERED'}</span></td>
                <td style="text-align: right;">
                    ${inTransit ? `
                        <button class="btn btn-primary btn-sm btn-receive-transfer" data-id="${t.id}" style="padding: 0.3rem 0.6rem; font-size: 0.75rem;">
                            <i data-lucide="check" style="width: 14px;"></i> Mark Received
                        </button>
                    ` : '<span style="color: var(--color-success); font-weight: 700; font-size: 0.75rem;">✓ On Shelf</span>'}
                </td>
            </tr>
        `;
    }).join('');

    tbody.querySelectorAll('.btn-receive-transfer').forEach(btn => {
        btn.addEventListener('click', () => {
            erp.updateTransferStatus(btn.dataset.id, 'DELIVERED');
            playAudioChime('SUCCESS');
            showToast('Inter-campus book delivery acknowledged and added to branch catalog!', 'success');
            renderTransfers(erp.getActiveCampusId());
        });
    });
}

function renderDamageAudits(campusId) {
    let damageRecords = erp.getDamageIncidents(campusId);
    const tbody = document.getElementById('damage-tbody');

    if (!damageRecords || damageRecords.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="padding: 2.5rem; text-align: center; color: var(--text-muted);">No damaged book incident reports recorded.</td></tr>`;
        return;
    }

    tbody.innerHTML = damageRecords.map(d => `
        <tr>
            <td>
                <div style="font-weight: 700; color: var(--text-primary);">${d.book_title}</div>
                <div style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--brand-primary);">${d.barcode}</div>
            </td>
            <td>
                <div style="font-weight: 600;">${d.student_name || 'Unassigned'}</div>
                <div style="font-size: 0.75rem; color: var(--text-muted); font-family: var(--font-mono);">${d.student_id || ''}</div>
            </td>
            <td><span class="badge badge-danger" style="font-size: 0.7rem;">${d.damage_type}</span></td>
            <td style="font-size: 0.82rem; color: var(--text-secondary); max-width: 250px;">${d.notes || 'Under review'}</td>
            <td style="font-size: 0.8rem; color: var(--text-muted);">${d.reported_at?.split('T')[0] || 'Today'}</td>
            <td><span class="badge badge-success">${d.resolution}</span></td>
        </tr>
    `).join('');
}

function setupEventListeners() {
    // Classroom Set Modal
    const modalSet = document.getElementById('modal-set');
    document.getElementById('btn-open-set-modal')?.addEventListener('click', () => {
        const dueDate = new Date(Date.now() + 60*86400*1000).toISOString().split('T')[0];
        document.getElementById('set-due-date').value = dueDate;
        modalSet.style.display = 'flex';
    });
    document.getElementById('btn-close-set-modal')?.addEventListener('click', () => modalSet.style.display = 'none');
    document.getElementById('btn-cancel-set')?.addEventListener('click', () => modalSet.style.display = 'none');

    document.getElementById('form-set')?.addEventListener('submit', (e) => {
        e.preventDefault();
        erp.borrowClassroomSet(
            'FAC-' + Math.floor(100 + Math.random()*900),
            document.getElementById('set-teacher-name').value.trim(),
            document.getElementById('set-title').value.trim(),
            document.getElementById('set-copies').value,
            document.getElementById('set-grade').value.trim(),
            document.getElementById('set-due-date').value
        );
        playAudioChime('SUCCESS');
        showToast('Classroom set issued to teacher successfully!', 'success');
        modalSet.style.display = 'none';
        renderClassroomSets(erp.getActiveCampusId());
    });

    // Transfer Modal
    const modalTransfer = document.getElementById('modal-transfer');
    document.getElementById('btn-open-transfer-modal')?.addEventListener('click', () => modalTransfer.style.display = 'flex');
    document.getElementById('btn-close-transfer-modal')?.addEventListener('click', () => modalTransfer.style.display = 'none');
    document.getElementById('btn-cancel-transfer')?.addEventListener('click', () => modalTransfer.style.display = 'none');

    document.getElementById('form-transfer')?.addEventListener('submit', (e) => {
        e.preventDefault();
        erp.createCampusTransfer(
            document.getElementById('tr-from').value,
            document.getElementById('tr-to').value,
            document.getElementById('tr-book').value.trim(),
            document.getElementById('tr-qty').value,
            document.getElementById('tr-requester').value.trim()
        );
        playAudioChime('SUCCESS');
        showToast('Inter-campus courier transfer initiated!', 'success');
        modalTransfer.style.display = 'none';
        renderTransfers(erp.getActiveCampusId());
    });

    // Reading Log Modal
    const modalLog = document.getElementById('modal-log-reading');
    document.getElementById('btn-log-reading')?.addEventListener('click', () => modalLog.style.display = 'flex');
    document.getElementById('btn-close-log-modal')?.addEventListener('click', () => modalLog.style.display = 'none');
    document.getElementById('btn-cancel-log')?.addEventListener('click', () => modalLog.style.display = 'none');

    document.getElementById('form-reading-log')?.addEventListener('submit', (e) => {
        e.preventDefault();
        erp.logReadingSession(
            document.getElementById('rl-student-id').value.trim(),
            document.getElementById('rl-student-name').value.trim(),
            document.getElementById('rl-book-title').value.trim(),
            document.getElementById('rl-pages').value,
            document.getElementById('rl-minutes').value
        );
        playAudioChime('SUCCESS');
        showToast('Student reading log recorded and badge updated!', 'success');
        modalLog.style.display = 'none';
        renderReadingLogs();
    });

    // Damage Modal
    const modalDam = document.getElementById('modal-damage');
    document.getElementById('btn-report-damage')?.addEventListener('click', () => modalDam.style.display = 'flex');
    document.getElementById('btn-close-damage-modal')?.addEventListener('click', () => modalDam.style.display = 'none');
    document.getElementById('btn-cancel-damage')?.addEventListener('click', () => modalDam.style.display = 'none');

    document.getElementById('form-damage')?.addEventListener('submit', (e) => {
        e.preventDefault();
        erp.reportDamageIncident(
            document.getElementById('dam-barcode').value.trim(),
            document.getElementById('dam-title').value.trim(),
            document.getElementById('dam-student-id').value.trim(),
            'Student Member',
            document.getElementById('dam-type').value,
            document.getElementById('dam-notes').value.trim()
        );
        playAudioChime('ERROR');
        showToast('Condition incident logged for library records', 'warning');
        modalDam.style.display = 'none';
        renderDamageAudits(erp.getActiveCampusId());
    });
}

