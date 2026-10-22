
window.duplicateEvent = function(id) {
    const ev = erp.getEvents('ALL').find(e => e.id === id);
    if (!ev) return;
    const rnd = Math.floor(100 + Math.random() * 900);
    const cloned = {
        ...ev,
        id: `ev-${Date.now()}-${rnd}`,
        title: `${ev.title} (Copy)`,
        registered_count: 0
    };
    erp.createEvent(cloned);
    window.app.toast(`Event "${cloned.title}" duplicated!`, 'success', 'Event Cloned');
    renderEvents();
};

window.duplicateHall = function(id) {
    const hall = erp.getEventHalls('ALL').find(h => h.id === id);
    if (!hall) return;
    const rnd = Math.floor(100 + Math.random() * 900);
    const cloned = {
        ...hall,
        id: `hall-${Date.now()}-${rnd}`,
        hall_code: `${hall.hall_code}-C${rnd}`,
        name: `${hall.name} (Copy)`
    };
    erp.saveEventHall(cloned);
    window.app.toast(`Event Hall "${cloned.name}" duplicated!`, 'success', 'Hall Cloned');
    renderHalls();
};

// events.js - Event Halls, Auditorium Reservations & Conductor Desk Scanner
import { erp } from './erp_service.js';
import { hardwareService } from './hardware.js';
import { showToast, playAudioChime } from './ui.js';

let activeTab = 'events';
let selectedConductorEventId = null;
let html5QrCode = null;

document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initCampusDropdowns();
    renderAll();
    setupEventListeners();

    // Listen for global campus switcher changes
    window.addEventListener('campusChanged', () => {
        initCampusDropdowns();
        renderAll();
    });
});

function initTabs() {
    const tabEvents = document.getElementById('tab-events-btn');
    const tabHalls = document.getElementById('tab-halls-btn');
    const tabConductor = document.getElementById('tab-conductor-btn');

    const secEvents = document.getElementById('section-events');
    const secHalls = document.getElementById('section-halls');
    const secConductor = document.getElementById('section-conductor');

    function switchTab(tab) {
        activeTab = tab;
        tabEvents.className = tab === 'events' ? 'btn btn-primary' : 'btn btn-outline';
        tabHalls.className = tab === 'halls' ? 'btn btn-primary' : 'btn btn-outline';
        tabConductor.className = tab === 'conductor' ? 'btn btn-primary' : 'btn btn-outline';

        secEvents.style.display = tab === 'events' ? 'block' : 'none';
        secHalls.style.display = tab === 'halls' ? 'block' : 'none';
        secConductor.style.display = tab === 'conductor' ? 'block' : 'none';

        if (tab === 'conductor') {
            loadConductorDesk();
        }
        if (window.lucide) lucide.createIcons();

    // Refresh mobile card view
    if (window.initMobileCardTables) window.initMobileCardTables();
    }

    tabEvents.addEventListener('click', () => switchTab('events'));
    tabHalls.addEventListener('click', () => switchTab('halls'));
    tabConductor.addEventListener('click', () => switchTab('conductor'));

    document.getElementById('btn-open-conductor-desk')?.addEventListener('click', () => switchTab('conductor'));
}

function initCampusDropdowns() {
    const campuses = erp.getCampuses();
    const evCampusSelect = document.getElementById('ev-campus');
    const hallCampusSelect = document.getElementById('hall-campus');

    if (evCampusSelect) {
        evCampusSelect.innerHTML = campuses.map(c => `<option value="${c.id}">${c.name} (${c.code})</option>`).join('');
        evCampusSelect.value = erp.getActiveCampusId() !== 'ALL' ? erp.getActiveCampusId() : (campuses[0]?.id || '');
        updateHallOptions(evCampusSelect.value);

        evCampusSelect.addEventListener('change', (e) => {
            updateHallOptions(e.target.value);
        });
    }

    if (hallCampusSelect) {
        hallCampusSelect.innerHTML = campuses.map(c => `<option value="${c.id}">${c.name} (${c.code})</option>`).join('');
        hallCampusSelect.value = erp.getActiveCampusId() !== 'ALL' ? erp.getActiveCampusId() : (campuses[0]?.id || '');
    }
}

function updateHallOptions(campusId) {
    const halls = erp.getEventHalls(campusId);
    const hallSelect = document.getElementById('ev-hall');
    if (hallSelect) {
        if (halls.length === 0) {
            hallSelect.innerHTML = '<option value="">No halls registered for this campus</option>';
        } else {
            hallSelect.innerHTML = halls.map(h => `<option value="${h.id}">${h.name} (${h.hall_code} - Cap: ${h.capacity})</option>`).join('');
        }
    }
}

function renderAll() {
    const activeCampus = erp.getActiveCampusId();
    const events = erp.getEvents(activeCampus);
    const halls = erp.getEventHalls(activeCampus);
    const allAttendees = erp.getEventAttendees();

    // Update KPIs
    document.getElementById('kpi-total-halls').innerText = halls.length;
    document.getElementById('kpi-scheduled-events').innerText = events.length;
    const totalRegistrations = events.reduce((sum, e) => sum + (e.registered_count || 0), 0);
    document.getElementById('kpi-total-attendees').innerText = totalRegistrations;

    renderEventsGrid(events);
    renderHallsGrid(halls);
    populateConductorEventDropdown(events);
}

function renderEventsGrid(events) {
    const container = document.getElementById('events-card-grid');
    const search = document.getElementById('event-search')?.value.toLowerCase() || '';
    const statusFilter = document.getElementById('event-status-filter')?.value || 'ALL';

    const filtered = events.filter(e => {
        const matchesSearch = !search || 
            e.title.toLowerCase().includes(search) || 
            e.organizer_name.toLowerCase().includes(search) || 
            e.conductor_name.toLowerCase().includes(search) ||
            e.hall_name.toLowerCase().includes(search);
        const matchesStatus = statusFilter === 'ALL' || e.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    if (filtered.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; background: var(--bg-card); border-radius: var(--radius-lg); border: 1px dashed var(--border-color); color: var(--text-muted);">
                <i data-lucide="calendar-x" style="width: 36px; height: 36px; opacity: 0.4; margin-bottom: 0.5rem;"></i>
                <div style="font-weight: 600; color: var(--text-primary);">No events found</div>
                <p style="font-size: 0.85rem; margin-top: 0.25rem;">Schedule a new event using the "Schedule Event" button above.</p>
            </div>
        `;
        if (window.lucide) lucide.createIcons();

    // Refresh mobile card view
    if (window.initMobileCardTables) window.initMobileCardTables();
        return;
    }

    container.innerHTML = filtered.map(e => {
        const startDate = new Date(e.start_datetime).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
        const cap = e.expected_attendees || 300;
        const reg = e.registered_count || 0;
        const percent = Math.min(100, Math.round((reg / cap) * 100));

        let statusBadge = `<span class="badge badge-success">Approved</span>`;
        if (e.status === 'PENDING_APPROVAL') statusBadge = `<span class="badge badge-warning">Pending Approval</span>`;
        if (e.status === 'COMPLETED') statusBadge = `<span class="badge" style="background: rgba(148, 163, 184, 0.1); color: var(--text-muted);">Completed</span>`;

        return `
            <div class="card card-glass" style="display: flex; flex-direction: column; justify-content: space-between; border-top: 3px solid var(--brand-primary);">
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem; gap: 0.5rem;">
                        <span class="badge badge-brand" style="font-size: 0.65rem;">${e.hall_name || 'Auditorium'}</span>
                        ${statusBadge}
                    </div>

                    <h3 style="font-size: 1.15rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.4rem; line-height: 1.3;">
                        ${e.title}
                    </h3>
                    <p style="font-size: 0.82rem; color: var(--text-muted); line-height: 1.4; margin-bottom: 0.75rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                        ${e.description || 'Institutional conference and intellectual discourse event.'}
                    </p>

                    <div style="display: flex; flex-direction: column; gap: 0.35rem; font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 1rem;">
                        <div style="display: flex; align-items: center; gap: 0.4rem;">
                            <i data-lucide="clock" style="width: 14px; color: var(--brand-primary);"></i>
                            <span>${startDate}</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 0.4rem;">
                            <i data-lucide="user-check" style="width: 14px; color: var(--color-success);"></i>
                            <span>Host: <strong>${e.conductor_name}</strong></span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 0.4rem;">
                            <i data-lucide="building" style="width: 14px; color: var(--brand-accent);"></i>
                            <span>Dept: ${e.organizer_name}</span>
                        </div>
                    </div>

                    <!-- Attendance Progress Bar -->
                    <div style="margin-bottom: 1.25rem;">
                        <div style="display: flex; justify-content: space-between; font-size: 0.75rem; margin-bottom: 0.25rem;">
                            <span style="color: var(--text-muted);">Registrations</span>
                            <span style="font-weight: 700; color: var(--text-primary);">${reg} / ${cap} (${percent}%)</span>
                        </div>
                        <div style="width: 100%; height: 6px; background: var(--border-color); border-radius: 3px; overflow: hidden;">
                            <div style="width: ${percent}%; height: 100%; background: var(--brand-gradient); border-radius: 3px; transition: width 0.3s ease;"></div>
                        </div>
                    </div>
                </div>

                <div style="display: flex; gap: 0.4rem; border-top: 1px solid var(--border-color); padding-top: 0.85rem;">
                    <button class="btn btn-outline btn-open-conductor" data-id="${e.id}" style="flex: 1; font-size: 0.8rem; padding: 0.45rem;">
                        <i data-lucide="scan-line" style="width: 14px;"></i> Check-in Desk
                    </button>
                    <button class="btn btn-outline btn-duplicate-event" data-id="${e.id}" style="padding: 0.45rem 0.6rem; color: var(--brand-accent);" title="Duplicate Event">
                        <i data-lucide="copy" style="width: 14px;"></i>
                    </button>
                    <button class="btn btn-outline btn-edit-event" data-id="${e.id}" style="padding: 0.45rem 0.6rem; color: var(--brand-primary);" title="Edit Event">
                        <i data-lucide="edit-3" style="width: 14px;"></i>
                    </button>
                    <button class="btn btn-outline btn-delete-event" data-id="${e.id}" style="color: var(--color-danger); padding: 0.45rem 0.6rem;" title="Cancel Event">
                        <i data-lucide="trash-2" style="width: 14px;"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');

    // Attach button actions
    container.querySelectorAll('.btn-duplicate-event').forEach(btn => {
        btn.addEventListener('click', () => {
            window.duplicateEvent(btn.dataset.id);
        });
    });

    container.querySelectorAll('.btn-open-conductor').forEach(btn => {
        btn.addEventListener('click', () => {
            const eventId = btn.dataset.id;
            selectedConductorEventId = eventId;
            document.getElementById('conductor-event-select').value = eventId;
            document.getElementById('tab-conductor-btn').click();
        });
    });

    container.querySelectorAll('.btn-edit-event').forEach(btn => {
        btn.addEventListener('click', () => {
            const eventId = btn.dataset.id;
            const ev = erp.getEvents('ALL').find(item => item.id === eventId);
            if (!ev) return;

            document.getElementById('modal-event-title').innerText = 'Edit Institutional Event';
            document.getElementById('ev-id').value = ev.id;
            document.getElementById('ev-title').value = ev.title;
            document.getElementById('ev-campus').value = ev.campus_id;
            updateHallOptions(ev.campus_id);
            document.getElementById('ev-hall').value = ev.hall_id;
            document.getElementById('ev-start').value = ev.start_datetime ? new Date(ev.start_datetime).toISOString().slice(0, 16) : '';
            document.getElementById('ev-end').value = ev.end_datetime ? new Date(ev.end_datetime).toISOString().slice(0, 16) : '';
            document.getElementById('ev-organizer').value = ev.organizer_name || '';
            document.getElementById('ev-conductor').value = ev.conductor_name || '';
            document.getElementById('ev-capacity').value = ev.expected_attendees || 300;
            document.getElementById('ev-status').value = ev.status || 'APPROVED';
            document.getElementById('ev-desc').value = ev.description || '';

            document.getElementById('modal-event').style.display = 'flex';
        });
    });

    container.querySelectorAll('.btn-delete-event').forEach(btn => {
        btn.addEventListener('click', () => {
            if (confirm('Are you sure you want to cancel and remove this event?')) {
                erp.deleteEvent(btn.dataset.id);
                showToast('Event removed successfully', 'info');
                renderAll();
            }
        });
    });

    if (window.lucide) lucide.createIcons();

    // Refresh mobile card view
    if (window.initMobileCardTables) window.initMobileCardTables();
}

function renderHallsGrid(halls) {
    const container = document.getElementById('halls-card-grid');
    if (halls.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 3rem; background: var(--bg-card); border-radius: var(--radius-lg); border: 1px dashed var(--border-color);">
                <i data-lucide="door-closed" style="width: 36px; height: 36px; opacity: 0.4; margin-bottom: 0.5rem;"></i>
                <div style="font-weight: 600; color: var(--text-primary);">No auditoriums registered for this campus</div>
                <p style="font-size: 0.85rem; margin-top: 0.25rem;">Click "Register Venue / Hall" above to add an event hall.</p>
            </div>
        `;
        if (window.lucide) lucide.createIcons();

    // Refresh mobile card view
    if (window.initMobileCardTables) window.initMobileCardTables();
        return;
    }

    container.innerHTML = halls.map(h => `
        <div class="card card-glass" style="display: flex; flex-direction: column; justify-content: space-between;">
            <div>
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem;">
                    <span class="badge badge-brand">${h.hall_code}</span>
                    <span class="badge ${h.status === 'AVAILABLE' ? 'badge-success' : 'badge-warning'}"><span class="badge-dot"></span> ${h.status}</span>
                </div>
                <h3 style="font-size: 1.15rem; font-weight: 700; margin-bottom: 0.25rem;">${h.name}</h3>
                <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.75rem;">${h.location || 'Campus Facility'}</p>

                <div style="display: flex; gap: 0.5rem; margin-bottom: 0.75rem;">
                    <div style="background: rgba(59, 130, 246, 0.08); padding: 0.4rem 0.6rem; border-radius: var(--radius-sm); font-size: 0.75rem; font-weight: 600; color: var(--brand-primary); display: flex; align-items: center; gap: 0.3rem;">
                        <i data-lucide="users" style="width: 14px;"></i> Capacity: ${h.capacity} seats
                    </div>
                </div>

                <div style="font-size: 0.78rem; color: var(--text-secondary); background: var(--bg-hover); padding: 0.5rem 0.75rem; border-radius: var(--radius-sm); margin-bottom: 1rem;">
                    <strong>Amenities:</strong> ${h.amenities || 'Standard AV & Stage setup'}
                </div>
            </div>

            <div style="display: flex; gap: 0.5rem; border-top: 1px solid var(--border-color); padding-top: 0.75rem;">
                <button class="btn btn-outline btn-sm" onclick="window.duplicateHall('${h.id}')" title="Duplicate Hall"><i data-lucide="copy" style="width: 14px;"></i></button>
                        <button class="btn btn-outline btn-sm btn-edit-hall" data-id="${h.id}" style="flex: 1; font-size: 0.8rem;">
                    <i data-lucide="edit-3" style="width: 14px;"></i> Edit Venue
                </button>
                <button class="btn btn-outline btn-sm btn-delete-hall" data-id="${h.id}" style="color: var(--color-danger); padding: 0.4rem 0.6rem;" title="Delete Venue">
                    <i data-lucide="trash-2" style="width: 14px;"></i>
                </button>
            </div>
        </div>
    `).join('');

    // Attach Hall Actions
    container.querySelectorAll('.btn-edit-hall').forEach(btn => {
        btn.addEventListener('click', () => {
            const hallId = btn.dataset.id;
            const hall = erp.getEventHalls('ALL').find(item => item.id === hallId);
            if (!hall) return;

            document.getElementById('modal-hall-title').innerText = 'Edit Venue / Hall';
            document.getElementById('hall-id').value = hall.id;
            document.getElementById('hall-name').value = hall.name;
            document.getElementById('hall-code').value = hall.hall_code;
            document.getElementById('hall-capacity').value = hall.capacity;
            document.getElementById('hall-campus').value = hall.campus_id || erp.getActiveCampusId();
            document.getElementById('hall-status').value = hall.status || 'AVAILABLE';
            document.getElementById('hall-location').value = hall.location || '';
            document.getElementById('hall-amenities').value = hall.amenities || '';

            document.getElementById('modal-hall').style.display = 'flex';
        });
    });

    container.querySelectorAll('.btn-delete-hall').forEach(btn => {
        btn.addEventListener('click', () => {
            if (confirm('Are you sure you want to delete this venue / hall?')) {
                erp.deleteEventHall(btn.dataset.id);
                showToast('Venue deleted successfully', 'info');
                renderAll();
            }
        });
    });

    if (window.lucide) lucide.createIcons();

    // Refresh mobile card view
    if (window.initMobileCardTables) window.initMobileCardTables();
}

function populateConductorEventDropdown(events) {
    const select = document.getElementById('conductor-event-select');
    if (!select) return;

    if (events.length === 0) {
        select.innerHTML = '<option value="">No events available</option>';
        return;
    }

    select.innerHTML = events.map(e => `
        <option value="${e.id}">${e.title} (${e.hall_name || 'Hall'})</option>
    `).join('');

    if (!selectedConductorEventId && events.length > 0) {
        selectedConductorEventId = events[0].id;
    }
    if (selectedConductorEventId) {
        select.value = selectedConductorEventId;
    }

    select.addEventListener('change', (e) => {
        selectedConductorEventId = e.target.value;
        loadConductorDesk();
    });
}

function loadConductorDesk() {
    const eventId = selectedConductorEventId || document.getElementById('conductor-event-select')?.value;
    if (!eventId) return;

    const events = erp.getEvents('ALL');
    const ev = events.find(e => e.id === eventId);
    if (ev) {
        document.getElementById('conductor-event-badge').innerText = ev.title;
    }

    // Load attendees for this event
    const attendees = erp.getEventAttendees(eventId);
    const tbody = document.getElementById('conductor-attendees-tbody');
    
    if (attendees.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="padding: 2.5rem 1rem; text-align: center; color: var(--text-muted);">
                    No attendees checked in yet. Scan ticket QR or student smartcard.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = attendees.map(a => {
        const isCheckedIn = a.status === 'CHECKED_IN';
        const badge = isCheckedIn 
            ? `<span class="badge badge-success"><span class="badge-dot"></span> ADMITTED</span>`
            : `<span class="badge badge-warning">REGISTERED</span>`;
        const timeStr = a.checkin_time ? new Date(a.checkin_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-';

        return `
            <tr>
                <td style="font-family: var(--font-mono); font-weight: 700; color: var(--brand-primary);">${a.ticket_code}</td>
                <td style="font-weight: 600;">${a.member_name}</td>
                <td style="font-family: var(--font-mono); font-size: 0.85rem;">${a.member_id}</td>
                <td><span class="badge" style="background: rgba(59, 130, 246, 0.1); color: var(--brand-primary); font-size: 0.7rem;">${a.role}</span></td>
                <td>${badge}</td>
                <td style="font-size: 0.8rem; color: var(--text-muted);">${timeStr}</td>
            </tr>
        `;
    }).join('');
}

function handleTicketCheckIn(inputVal) {
    const val = (inputVal || '').trim();
    if (!val) {
        showToast('Please enter or scan a ticket code or student ID', 'warning');
        return;
    }

    const eventId = selectedConductorEventId || document.getElementById('conductor-event-select')?.value;
    if (!eventId) {
        showToast('Please select an active event first', 'warning');
        return;
    }

    try {
        const attendee = erp.checkInEventAttendee(eventId, val);
        playAudioChime('SUCCESS');
        
        // Update feedback element
        const fb = document.getElementById('conductor-feedback');
        const fbText = document.getElementById('conductor-feedback-text');
        fb.style.display = 'block';
        fb.style.background = 'rgba(16, 185, 129, 0.1)';
        fb.style.borderColor = 'rgba(16, 185, 129, 0.3)';
        fbText.innerHTML = `
            <div style="color: var(--color-success); font-size: 0.95rem; margin-bottom: 0.2rem;">✓ Admittance Granted</div>
            <div style="color: var(--text-primary); font-weight: 700;">${attendee.member_name} (${attendee.member_id})</div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.15rem;">Ticket: ${attendee.ticket_code} • ${attendee.role}</div>
        `;

        showToast(`Admitted: ${attendee.member_name}`, 'success');
        document.getElementById('conductor-ticket-input').value = '';
        document.getElementById('conductor-ticket-input').focus();
        loadConductorDesk();
    } catch (err) {
        playAudioChime('ERROR');
        const fb = document.getElementById('conductor-feedback');
        const fbText = document.getElementById('conductor-feedback-text');
        fb.style.display = 'block';
        fb.style.background = 'rgba(239, 68, 68, 0.1)';
        fb.style.borderColor = 'rgba(239, 68, 68, 0.3)';
        fbText.innerHTML = `<span style="color: var(--color-danger); font-weight: 700;">⚠ Verification Error: ${err.message}</span>`;
        showToast(err.message, 'error');
    }
}

function setupEventListeners() {
    // Search & Filter
    document.getElementById('event-search')?.addEventListener('input', () => {
        renderEventsGrid(erp.getEvents(erp.getActiveCampusId()));
    });
    document.getElementById('event-status-filter')?.addEventListener('change', () => {
        renderEventsGrid(erp.getEvents(erp.getActiveCampusId()));
    });

    // Check-in input
    const ticketInput = document.getElementById('conductor-ticket-input');
    const btnCheckin = document.getElementById('btn-conductor-checkin');
    btnCheckin?.addEventListener('click', () => handleTicketCheckIn(ticketInput.value));
    ticketInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleTicketCheckIn(ticketInput.value);
    });

    // Hardware NFC Reader on conductor desk
    document.getElementById('btn-conductor-nfc')?.addEventListener('click', async () => {
        showToast('Hold student NFC card near device reader...', 'info');
        const active = await hardwareService.initNFCReader((tagId) => {
            handleTicketCheckIn(tagId);
        });
        if (!active) {
            showToast('NFC scanning active via barcode fallback or USB reader.', 'info');
        }
    });

    // Camera QR Code Scanner toggle
    document.getElementById('btn-conductor-camera')?.addEventListener('click', () => {
        const qrContainer = document.getElementById('conductor-qr-reader');
        if (qrContainer.style.display === 'none' || !qrContainer.style.display) {
            qrContainer.style.display = 'block';
            if (window.Html5Qrcode) {
                html5QrCode = new Html5Qrcode("conductor-qr-reader");
                html5QrCode.start(
                    { facingMode: "environment" },
                    { fps: 10, qrbox: { width: 220, height: 220 } },
                    (decodedText) => {
                        handleTicketCheckIn(decodedText);
                    },
                    () => {}
                ).catch(err => {
                    console.error('Camera error', err);
                    showToast('Could not access camera', 'warning');
                });
            }
        } else {
            qrContainer.style.display = 'none';
            if (html5QrCode) {
                html5QrCode.stop().then(() => html5QrCode.clear()).catch(console.error);
            }
        }
    });

    // Schedule / Edit Event Modal
    const modalEvent = document.getElementById('modal-event');
    document.getElementById('btn-new-event')?.addEventListener('click', () => {
        document.getElementById('modal-event-title').innerText = 'Schedule Institutional Event';
        document.getElementById('ev-id').value = '';
        document.getElementById('form-event').reset();

        // Set default start datetime to tomorrow 10:00 AM
        const tomorrow = new Date(Date.now() + 86400 * 1000);
        tomorrow.setHours(10, 0, 0, 0);
        const endTom = new Date(tomorrow.getTime() + 3 * 3600 * 1000);

        document.getElementById('ev-start').value = tomorrow.toISOString().slice(0, 16);
        document.getElementById('ev-end').value = endTom.toISOString().slice(0, 16);
        modalEvent.style.display = 'flex';
    });

    document.getElementById('btn-close-event-modal')?.addEventListener('click', () => modalEvent.style.display = 'none');
    document.getElementById('btn-cancel-event')?.addEventListener('click', () => modalEvent.style.display = 'none');

    document.getElementById('form-event')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const evId = document.getElementById('ev-id').value;
        const campusId = document.getElementById('ev-campus').value;
        const hallSelect = document.getElementById('ev-hall');
        const hallId = hallSelect.value;
        const hallName = hallSelect.options[hallSelect.selectedIndex]?.text.split(' (')[0] || 'Auditorium';

        const eventData = {
            id: evId || undefined,
            campus_id: campusId,
            hall_id: hallId,
            hall_name: hallName,
            title: document.getElementById('ev-title').value.trim(),
            description: document.getElementById('ev-desc').value.trim(),
            organizer_name: document.getElementById('ev-organizer').value.trim(),
            conductor_name: document.getElementById('ev-conductor').value.trim(),
            start_datetime: new Date(document.getElementById('ev-start').value).toISOString(),
            end_datetime: new Date(document.getElementById('ev-end').value).toISOString(),
            expected_attendees: parseInt(document.getElementById('ev-capacity').value) || 300,
            status: document.getElementById('ev-status').value || 'APPROVED'
        };

        if (evId) {
            erp.updateEvent(eventData);
            showToast('Event updated successfully!', 'success');
        } else {
            erp.createEvent(eventData);
            showToast('Event scheduled successfully!', 'success');
        }
        modalEvent.style.display = 'none';
        renderAll();
    });

    // Venue / Hall Add & Edit Modal
    const modalHall = document.getElementById('modal-hall');
    document.getElementById('btn-new-hall')?.addEventListener('click', () => {
        document.getElementById('modal-hall-title').innerText = 'Register Auditorium / Venue';
        document.getElementById('hall-id').value = '';
        document.getElementById('form-hall').reset();
        document.getElementById('hall-campus').value = erp.getActiveCampusId() !== 'ALL' ? erp.getActiveCampusId() : 'camp-main';
        document.getElementById('hall-capacity').value = '200';
        modalHall.style.display = 'flex';
    });

    document.getElementById('btn-close-hall-modal')?.addEventListener('click', () => modalHall.style.display = 'none');
    document.getElementById('btn-cancel-hall')?.addEventListener('click', () => modalHall.style.display = 'none');

    document.getElementById('form-hall')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const hallId = document.getElementById('hall-id').value;
        const hallData = {
            id: hallId || undefined,
            name: document.getElementById('hall-name').value.trim(),
            hall_code: document.getElementById('hall-code').value.trim().toUpperCase(),
            capacity: parseInt(document.getElementById('hall-capacity').value) || 100,
            campus_id: document.getElementById('hall-campus').value,
            status: document.getElementById('hall-status').value,
            location: document.getElementById('hall-location').value.trim(),
            amenities: document.getElementById('hall-amenities').value.trim()
        };

        erp.saveEventHall(hallData);
        showToast(hallId ? 'Venue updated successfully!' : 'Venue registered successfully!', 'success');
        modalHall.style.display = 'none';
        initCampusDropdowns();
        renderAll();
    });

    // Register Walkin Modal
    const modalWalkin = document.getElementById('modal-walkin');
    document.getElementById('btn-register-walkin')?.addEventListener('click', () => {
        modalWalkin.style.display = 'flex';
    });
    document.getElementById('btn-close-walkin-modal')?.addEventListener('click', () => modalWalkin.style.display = 'none');
    document.getElementById('btn-cancel-walkin')?.addEventListener('click', () => modalWalkin.style.display = 'none');

    document.getElementById('form-walkin')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const eventId = selectedConductorEventId || document.getElementById('conductor-event-select')?.value;
        if (!eventId) {
            showToast('No event selected', 'warning');
            return;
        }

        const memberId = document.getElementById('walkin-id').value.trim();
        const name = document.getElementById('walkin-name').value.trim();
        const email = document.getElementById('walkin-email').value.trim();
        const role = document.getElementById('walkin-role').value;

        const attendee = erp.registerEventAttendee(eventId, memberId, name, email, role);
        attendee.status = 'CHECKED_IN';
        attendee.checkin_time = new Date().toISOString();
        erp.checkInEventAttendee(eventId, attendee.ticket_code);

        showToast(`Admitted walk-in: ${name}`, 'success');
        modalWalkin.style.display = 'none';
        document.getElementById('form-walkin').reset();
        loadConductorDesk();
    });
}

