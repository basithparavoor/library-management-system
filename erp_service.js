// erp_service.js - Central Institutional ERP & Facility Management Service
import { supabase } from './supabaseClient.js';

// Local storage keys for resilient ERP data persistence & offline fallback
const STORAGE_KEYS = {
    CAMPUSES: 'erp_campuses',
    DEPARTMENTS: 'erp_departments',
    CLASSES: 'erp_classes',
    STAFF: 'erp_staff',
    STUDENTS: 'erp_students',
    COMPUTERS: 'erp_computers',
    COMPUTER_SESSIONS: 'erp_computer_sessions',
    PERIOD_SESSIONS: 'erp_period_sessions',
    PERIOD_ATTENDANCE: 'erp_period_attendance',
    EVENT_HALLS: 'erp_event_halls',
    EVENTS: 'erp_events',
    FACILITY_REQUESTS: 'erp_facility_requests',
    PERMISSIONS: 'erp_permissions',
    NOTIFICATIONS: 'erp_notifications',
    CHAT_MESSAGES: 'erp_chat_messages',
    CHAT_CHANNELS: 'erp_chat_channels',
    READING_LOGS: 'erp_reading_logs',
    CLASSROOM_SETS: 'erp_classroom_sets',
    CAMPUS_TRANSFERS: 'erp_campus_transfers',
    DAMAGE_INCIDENTS: 'erp_damage_incidents',
    HALL_PASSES: 'erp_hall_passes',
    WORKSTATION_POLICIES: 'erp_workstation_policies',
    WORKSTATION_ASSIGNMENTS: 'erp_workstation_assignments',
    INSTITUTION_PROFILE: 'erp_institution_profile',
    NFC_TAGS: 'erp_nfc_tags',
    ID_CARD_TEMPLATES: 'erp_id_card_templates',
    ADMIN_ACCOUNTS: 'erp_admin_accounts',
    CURRENT_CAMPUS: 'erp_active_campus_id'
};

// Seed initial institutional data configuration if not present
function seedInitialErpData() {
    // One-time auto-purge for all legacy demo records
    if (!localStorage.getItem('erp_clean_v3_purged')) {
        localStorage.removeItem(STORAGE_KEYS.NOTIFICATIONS);
        localStorage.removeItem(STORAGE_KEYS.CHAT_MESSAGES);
        localStorage.removeItem(STORAGE_KEYS.EVENT_HALLS);
        localStorage.removeItem(STORAGE_KEYS.COMPUTERS);
        localStorage.removeItem(STORAGE_KEYS.STAFF);
        localStorage.removeItem(STORAGE_KEYS.STUDENTS);
        localStorage.removeItem(STORAGE_KEYS.COMPUTER_SESSIONS);
        localStorage.removeItem(STORAGE_KEYS.PERIOD_SESSIONS);
        localStorage.removeItem(STORAGE_KEYS.PERIOD_ATTENDANCE);
        localStorage.removeItem(STORAGE_KEYS.EVENTS);
        localStorage.removeItem(STORAGE_KEYS.FACILITY_REQUESTS);
        localStorage.removeItem(STORAGE_KEYS.READING_LOGS);
        localStorage.removeItem(STORAGE_KEYS.CLASSROOM_SETS);
        localStorage.removeItem(STORAGE_KEYS.CAMPUS_TRANSFERS);
        localStorage.removeItem(STORAGE_KEYS.DAMAGE_INCIDENTS);
        localStorage.removeItem(STORAGE_KEYS.HALL_PASSES);
        localStorage.removeItem(STORAGE_KEYS.WORKSTATION_ASSIGNMENTS);
        localStorage.removeItem('erp_kiosk_loans');
        localStorage.removeItem('erp_event_attendees');
        localStorage.removeItem('erp_acad_departments');
        localStorage.removeItem('erp_acad_programs');
        localStorage.removeItem('erp_acad_classes');
        localStorage.removeItem('erp_storage_wings');
        localStorage.removeItem('erp_storage_shelves');
        localStorage.removeItem('erp_storage_racks');
        localStorage.setItem('erp_clean_v3_purged', 'true');
    }

    if (!localStorage.getItem(STORAGE_KEYS.CAMPUSES)) {
        const initialCampuses = [
            { id: 'camp-main', name: 'Main Metropolitan Campus', code: 'MMC', city: 'Bangalore', head_name: 'Campus Dean', email: 'dean@tgi.edu', phone: '+91 80 2345 6701' }
        ];
        localStorage.setItem(STORAGE_KEYS.CAMPUSES, JSON.stringify(initialCampuses));
    }

    if (!localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS)) {
        localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify([]));
    }

    if (!localStorage.getItem(STORAGE_KEYS.CHAT_CHANNELS)) {
        const initialChannels = [
            { id: 'ch-admin', name: 'Executive Admin & Helpdesk', description: 'Direct desk with Super Admin & Campus Deans', role: 'ADMIN', avatar: 'shield', unread: 0, last_message: 'Desk ready.', last_time: new Date().toISOString() },
            { id: 'ch-library', name: 'Chief Librarian Desk', description: 'Book renewals, shelf reservations & catalog queries', role: 'LIBRARIAN', avatar: 'book-open', unread: 0, last_message: 'Catalog desk online.', last_time: new Date().toISOString() },
            { id: 'ch-lab', name: 'Lab Hardware Support', description: 'Workstation issues, software licenses & GPU access', role: 'LAB_ADMIN', avatar: 'monitor', unread: 0, last_message: 'Lab system online.', last_time: new Date().toISOString() }
        ];
        localStorage.setItem(STORAGE_KEYS.CHAT_CHANNELS, JSON.stringify(initialChannels));
    }

    if (!localStorage.getItem(STORAGE_KEYS.CHAT_MESSAGES)) {
        localStorage.setItem(STORAGE_KEYS.CHAT_MESSAGES, JSON.stringify([]));
    }

    if (!localStorage.getItem(STORAGE_KEYS.EVENT_HALLS)) {
        localStorage.setItem(STORAGE_KEYS.EVENT_HALLS, JSON.stringify([]));
    }

    if (!localStorage.getItem(STORAGE_KEYS.COMPUTERS)) {
        localStorage.setItem(STORAGE_KEYS.COMPUTERS, JSON.stringify([]));
    }

    if (!localStorage.getItem(STORAGE_KEYS.STAFF)) {
        localStorage.setItem(STORAGE_KEYS.STAFF, JSON.stringify([]));
    }

    if (!localStorage.getItem(STORAGE_KEYS.COMPUTER_SESSIONS)) {
        localStorage.setItem(STORAGE_KEYS.COMPUTER_SESSIONS, JSON.stringify([]));
    }

    if (!localStorage.getItem(STORAGE_KEYS.PERIOD_SESSIONS)) {
        localStorage.setItem(STORAGE_KEYS.PERIOD_SESSIONS, JSON.stringify([]));
    }

    if (!localStorage.getItem(STORAGE_KEYS.EVENTS)) {
        localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify([]));
    }

    if (!localStorage.getItem(STORAGE_KEYS.FACILITY_REQUESTS)) {
        localStorage.setItem(STORAGE_KEYS.FACILITY_REQUESTS, JSON.stringify([]));
    }

    if (!localStorage.getItem(STORAGE_KEYS.PERMISSIONS)) {
        const initialPermissions = [
            { role: 'SUPER_ADMIN', can_view_all_campuses: true, can_manage_catalog: true, can_manage_circulation: true, can_manage_members: true, can_manage_labs: true, can_manage_events: true, can_approve_requests: true, can_access_reports: true, can_configure_rbac: true },
            { role: 'INSTITUTION_HEAD', can_view_all_campuses: true, can_manage_catalog: false, can_manage_circulation: false, can_manage_members: true, can_manage_labs: true, can_manage_events: true, can_approve_requests: true, can_access_reports: true, can_configure_rbac: false },
            { role: 'CAMPUS_HEAD', can_view_all_campuses: false, can_manage_catalog: false, can_manage_circulation: true, can_manage_members: true, can_manage_labs: true, can_manage_events: true, can_approve_requests: true, can_access_reports: true, can_configure_rbac: false },
            { role: 'TEACHER', can_view_all_campuses: false, can_manage_catalog: false, can_manage_circulation: false, can_manage_members: false, can_manage_labs: false, can_manage_events: false, can_take_attendance: true, can_request_facilities: true, can_access_reports: false },
            { role: 'LIBRARIAN', can_view_all_campuses: false, can_manage_catalog: true, can_manage_circulation: true, can_manage_members: true, can_manage_labs: false, can_manage_events: false, can_approve_requests: false, can_access_reports: true },
            { role: 'LAB_ADMIN', can_view_all_campuses: false, can_manage_catalog: false, can_manage_circulation: false, can_manage_members: false, can_manage_labs: true, can_manage_events: false, can_approve_requests: false, can_access_reports: true },
            { role: 'EVENT_CONDUCTOR', can_view_all_campuses: false, can_manage_catalog: false, can_manage_circulation: false, can_manage_members: false, can_manage_labs: false, can_manage_events: true, can_scan_tickets: true, can_access_reports: false },
            { role: 'STUDENT', can_view_all_campuses: false, can_opac_search: true, can_view_loans: true, can_view_lab_availability: true, can_view_events: true }
        ];
        localStorage.setItem(STORAGE_KEYS.PERMISSIONS, JSON.stringify(initialPermissions));
    }
}

seedInitialErpData();

export class ErpDataService {
    constructor() {
        this.activeCampusId = localStorage.getItem(STORAGE_KEYS.CURRENT_CAMPUS) || 'camp-main';
    }

    // --- CAMPUS MANAGEMENT ---
    getActiveCampusId() {
        return this.activeCampusId;
    }

    setActiveCampusId(campusId) {
        this.activeCampusId = campusId;
        localStorage.setItem(STORAGE_KEYS.CURRENT_CAMPUS, campusId);
        window.dispatchEvent(new CustomEvent('campusChanged', { detail: { campusId } }));
    }

    getCampuses() {
        return JSON.parse(localStorage.getItem(STORAGE_KEYS.CAMPUSES) || '[]');
    }

    saveCampus(campus) {
        const list = this.getCampuses();
        if (campus.id) {
            const index = list.findIndex(c => c.id === campus.id);
            if (index !== -1) list[index] = { ...list[index], ...campus };
        } else {
            campus.id = `camp-${Date.now()}`;
            list.push(campus);
        }
        localStorage.setItem(STORAGE_KEYS.CAMPUSES, JSON.stringify(list));
        window.dispatchEvent(new CustomEvent('campusChanged', { detail: { campusId: campus.id } }));
        return campus;
    }

    deleteCampus(id) {
        let list = this.getCampuses();
        list = list.filter(c => c.id !== id);
        localStorage.setItem(STORAGE_KEYS.CAMPUSES, JSON.stringify(list));
        if (this.activeCampusId === id) {
            this.setActiveCampusId(list[0]?.id || 'camp-main');
        } else {
            window.dispatchEvent(new CustomEvent('campusChanged', { detail: { campusId: this.activeCampusId } }));
        }
    }

    // --- INSTITUTION PROFILE & BRANDING ---
    getInstitutionProfile() {
        const defaultProfile = {
            name: 'INSTITUTION NAME',
            tagline: 'ERP & Library Management Suite',
            reg_code: 'REG-2026-001',
            email: 'admin@institution.edu',
            phone: '+1 555-0100',
            website: '',
            address: 'Main Campus Headquarters',
            logo_url: '',
            favicon_url: '',
            established_year: '1998'
        };
        return JSON.parse(localStorage.getItem(STORAGE_KEYS.INSTITUTION_PROFILE) || JSON.stringify(defaultProfile));
    }

    async saveInstitutionProfile(profile) {
        const current = this.getInstitutionProfile();
        const updated = { ...current, ...profile };
        try {
            localStorage.setItem(STORAGE_KEYS.INSTITUTION_PROFILE, JSON.stringify(updated));
        } catch (e) {
            console.warn("LocalStorage save warning:", e);
        }
        window.dispatchEvent(new CustomEvent('institutionProfileUpdated', { detail: updated }));

        // Async sync to Supabase remote database
        try {
            const { error } = await supabase.from('institution_profile').upsert({
                id: 'primary_institution',
                name: updated.name || 'INSTITUTION NAME',
                tagline: updated.tagline || '',
                reg_code: updated.reg_code || '',
                email: updated.email || '',
                phone: updated.phone || '',
                website: updated.website || '',
                address: updated.address || '',
                logo_url: updated.logo_url || null,
                favicon_url: updated.favicon_url || null,
                established_year: updated.established_year || '1998',
                updated_at: new Date().toISOString()
            }, { onConflict: 'id' });

            if (error) {
                console.warn("Supabase institution profile sync error:", error);
            }
        } catch (e) {
            console.warn("Supabase profile sync err:", e);
        }

        return updated;
    }

    async syncInstitutionProfileFromSupabase() {
        try {
            const { data, error } = await supabase
                .from('institution_profile')
                .select('*')
                .eq('id', 'primary_institution')
                .maybeSingle();

            if (data && !error) {
                const current = this.getInstitutionProfile();
                // Merge, only overriding if data has truthy values
                const merged = { ...current };
                if (data.name) merged.name = data.name;
                if (data.tagline !== undefined) merged.tagline = data.tagline;
                if (data.reg_code !== undefined) merged.reg_code = data.reg_code;
                if (data.email !== undefined) merged.email = data.email;
                if (data.phone !== undefined) merged.phone = data.phone;
                if (data.website !== undefined) merged.website = data.website;
                if (data.address !== undefined) merged.address = data.address;
                if (data.logo_url) merged.logo_url = data.logo_url;
                if (data.favicon_url) merged.favicon_url = data.favicon_url;
                if (data.established_year) merged.established_year = data.established_year;

                try {
                    localStorage.setItem(STORAGE_KEYS.INSTITUTION_PROFILE, JSON.stringify(merged));
                } catch (e) {}
                window.dispatchEvent(new CustomEvent('institutionProfileUpdated', { detail: merged }));
                return merged;
            }
        } catch (e) {
            console.warn("Could not sync institution profile from Supabase:", e);
        }
        return this.getInstitutionProfile();
    }

    async resetInstitutionProfile() {
        localStorage.removeItem(STORAGE_KEYS.INSTITUTION_PROFILE);
        const def = this.getInstitutionProfile();
        window.dispatchEvent(new CustomEvent('institutionProfileUpdated', { detail: def }));
        try {
            await supabase.from('institution_profile').delete().eq('id', 'primary_institution');
        } catch (e) {}
        return def;
    }

    // --- COMPUTERS & WORKSTATION TRACKING ---
    getComputers(campusId = this.activeCampusId) {
        const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.COMPUTERS) || '[]');
        return campusId === 'ALL' ? all : all.filter(c => c.campus_id === campusId);
    }

    saveComputer(comp) {
        const list = JSON.parse(localStorage.getItem(STORAGE_KEYS.COMPUTERS) || '[]');
        if (comp.id) {
            const idx = list.findIndex(c => c.id === comp.id);
            if (idx !== -1) list[idx] = { ...list[idx], ...comp };
        } else {
            comp.id = `comp-${Date.now()}`;
            comp.campus_id = comp.campus_id || this.activeCampusId;
            comp.status = comp.status || 'AVAILABLE';
            list.push(comp);
        }
        localStorage.setItem(STORAGE_KEYS.COMPUTERS, JSON.stringify(list));
        return comp;
    }

    deleteComputer(id) {
        let list = JSON.parse(localStorage.getItem(STORAGE_KEYS.COMPUTERS) || '[]');
        list = list.filter(c => c.id !== id);
        localStorage.setItem(STORAGE_KEYS.COMPUTERS, JSON.stringify(list));
    }

    checkInComputer(computerId, studentOrStaffId, userName, purpose = 'Academic Research') {
        const computers = JSON.parse(localStorage.getItem(STORAGE_KEYS.COMPUTERS) || '[]');
        const comp = computers.find(c => c.id === computerId || c.machine_code === computerId);
        if (!comp) throw new Error(`Computer with code "${computerId}" not found.`);
        if (comp.status === 'IN_USE') throw new Error(`Computer "${comp.machine_code}" is currently occupied by ${comp.current_user_name}.`);

        comp.status = 'IN_USE';
        comp.current_user_id = studentOrStaffId;
        comp.current_user_name = userName;
        comp.session_start = new Date().toISOString();
        comp.purpose = purpose;

        localStorage.setItem(STORAGE_KEYS.COMPUTERS, JSON.stringify(computers));

        // Create new active session record
        const sessions = JSON.parse(localStorage.getItem(STORAGE_KEYS.COMPUTER_SESSIONS) || '[]');
        const newSession = {
            id: `cs-${Date.now()}`,
            computer_id: comp.id,
            machine_code: comp.machine_code,
            campus_id: comp.campus_id,
            student_id: studentOrStaffId,
            student_name: userName,
            start_time: comp.session_start,
            end_time: null,
            duration_minutes: 0,
            purpose: purpose,
            status: 'ACTIVE'
        };
        sessions.unshift(newSession);
        localStorage.setItem(STORAGE_KEYS.COMPUTER_SESSIONS, JSON.stringify(sessions));

        return { comp, session: newSession };
    }

    checkOutComputer(computerIdOrMachineCode) {
        const computers = JSON.parse(localStorage.getItem(STORAGE_KEYS.COMPUTERS) || '[]');
        const comp = computers.find(c => c.id === computerIdOrMachineCode || c.machine_code === computerIdOrMachineCode);
        if (!comp) throw new Error(`Computer "${computerIdOrMachineCode}" not found.`);
        if (comp.status !== 'IN_USE') throw new Error(`Computer "${comp.machine_code}" is not currently in use.`);

        const endTime = new Date();
        const startTime = new Date(comp.session_start || Date.now());
        const durationMinutes = Math.max(1, Math.round((endTime - startTime) / (1000 * 60)));

        const prevUser = comp.current_user_name;

        comp.status = 'AVAILABLE';
        comp.current_user_id = null;
        comp.current_user_name = null;
        comp.session_start = null;
        comp.purpose = null;

        localStorage.setItem(STORAGE_KEYS.COMPUTERS, JSON.stringify(computers));

        // Update session record
        const sessions = JSON.parse(localStorage.getItem(STORAGE_KEYS.COMPUTER_SESSIONS) || '[]');
        const activeSession = sessions.find(s => s.computer_id === comp.id && s.status === 'ACTIVE');
        if (activeSession) {
            activeSession.end_time = endTime.toISOString();
            activeSession.duration_minutes = durationMinutes;
            activeSession.status = 'COMPLETED';
            localStorage.setItem(STORAGE_KEYS.COMPUTER_SESSIONS, JSON.stringify(sessions));
        }

        return { comp, durationMinutes, userName: prevUser };
    }

    getComputerSessions(filters = {}) {
        let sessions = JSON.parse(localStorage.getItem(STORAGE_KEYS.COMPUTER_SESSIONS) || '[]');
        if (filters.campus_id && filters.campus_id !== 'ALL') {
            sessions = sessions.filter(s => s.campus_id === filters.campus_id);
        }
        if (filters.student_id) {
            sessions = sessions.filter(s => s.student_id.toLowerCase().includes(filters.student_id.toLowerCase()));
        }
        if (filters.machine_code) {
            sessions = sessions.filter(s => s.machine_code.toLowerCase().includes(filters.machine_code.toLowerCase()));
        }
        if (filters.startDate) {
            sessions = sessions.filter(s => new Date(s.start_time) >= new Date(filters.startDate));
        }
        if (filters.endDate) {
            sessions = sessions.filter(s => new Date(s.start_time) <= new Date(filters.endDate));
        }
        return sessions;
    }

    // --- PERIOD ATTENDANCE TRACKER ---
    getPeriodSessions(campusId = this.activeCampusId) {
        const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.PERIOD_SESSIONS) || '[]');
        return campusId === 'ALL' ? all : all.filter(p => p.campus_id === campusId);
    }

    createPeriodSession(session) {
        const list = JSON.parse(localStorage.getItem(STORAGE_KEYS.PERIOD_SESSIONS) || '[]');
        session.id = `per-${Date.now()}`;
        session.campus_id = session.campus_id || this.activeCampusId;
        session.date = session.date || new Date().toISOString().split('T')[0];
        session.status = session.status || 'ACTIVE';
        session.present_count = session.present_count || 0;
        list.unshift(session);
        localStorage.setItem(STORAGE_KEYS.PERIOD_SESSIONS, JSON.stringify(list));
        return session;
    }

    updatePeriodSession(session) {
        const list = JSON.parse(localStorage.getItem(STORAGE_KEYS.PERIOD_SESSIONS) || '[]');
        const idx = list.findIndex(p => p.id === session.id);
        if (idx !== -1) {
            list[idx] = { ...list[idx], ...session };
            localStorage.setItem(STORAGE_KEYS.PERIOD_SESSIONS, JSON.stringify(list));
            return list[idx];
        }
        return session;
    }

    deletePeriodSession(id) {
        let list = JSON.parse(localStorage.getItem(STORAGE_KEYS.PERIOD_SESSIONS) || '[]');
        list = list.filter(p => p.id !== id);
        localStorage.setItem(STORAGE_KEYS.PERIOD_SESSIONS, JSON.stringify(list));

        // Clean up attendance records
        let attList = JSON.parse(localStorage.getItem(STORAGE_KEYS.PERIOD_ATTENDANCE) || '[]');
        attList = attList.filter(a => a.session_id !== id);
        localStorage.setItem(STORAGE_KEYS.PERIOD_ATTENDANCE, JSON.stringify(attList));
    }

    getPeriodAttendance(sessionId) {
        const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.PERIOD_ATTENDANCE) || '[]');
        return all.filter(a => a.session_id === sessionId);
    }

    recordStudentAttendance(sessionId, studentId, studentName, status = 'PRESENT', method = 'NFC') {
        const list = JSON.parse(localStorage.getItem(STORAGE_KEYS.PERIOD_ATTENDANCE) || '[]');
        let record = list.find(r => r.session_id === sessionId && r.student_id === studentId);
        
        if (record) {
            record.status = status;
            record.checkin_method = method;
            record.checkin_time = new Date().toISOString();
        } else {
            record = {
                id: `att-${Date.now()}-${Math.floor(Math.random()*1000)}`,
                session_id: sessionId,
                student_id: studentId,
                student_name: studentName,
                status: status,
                checkin_method: method,
                checkin_time: new Date().toISOString()
            };
            list.push(record);
        }
        localStorage.setItem(STORAGE_KEYS.PERIOD_ATTENDANCE, JSON.stringify(list));

        // Update present count in period session
        const sessions = JSON.parse(localStorage.getItem(STORAGE_KEYS.PERIOD_SESSIONS) || '[]');
        const sess = sessions.find(s => s.id === sessionId);
        if (sess) {
            sess.present_count = list.filter(r => r.session_id === sessionId && r.status === 'PRESENT').length;
            localStorage.setItem(STORAGE_KEYS.PERIOD_SESSIONS, JSON.stringify(sessions));
        }

        return record;
    }

    // --- EVENT HALL & AUDITORIUM MANAGEMENT ---
    getEventHalls(campusId = this.activeCampusId) {
        const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.EVENT_HALLS) || '[]');
        return campusId === 'ALL' ? all : all.filter(h => h.campus_id === campusId);
    }

    saveEventHall(hall) {
        const list = JSON.parse(localStorage.getItem(STORAGE_KEYS.EVENT_HALLS) || '[]');
        if (hall.id) {
            const idx = list.findIndex(h => h.id === hall.id);
            if (idx !== -1) {
                list[idx] = { ...list[idx], ...hall };
            }
        } else {
            hall.id = `hall-${Date.now()}`;
            hall.campus_id = hall.campus_id || this.activeCampusId;
            hall.status = hall.status || 'AVAILABLE';
            list.push(hall);
        }
        localStorage.setItem(STORAGE_KEYS.EVENT_HALLS, JSON.stringify(list));
        return hall;
    }

    deleteEventHall(id) {
        let list = JSON.parse(localStorage.getItem(STORAGE_KEYS.EVENT_HALLS) || '[]');
        list = list.filter(h => h.id !== id);
        localStorage.setItem(STORAGE_KEYS.EVENT_HALLS, JSON.stringify(list));
    }

    getEvents(campusId = this.activeCampusId) {
        const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.EVENTS) || '[]');
        return campusId === 'ALL' ? all : all.filter(e => e.campus_id === campusId);
    }

    createEvent(event) {
        const list = JSON.parse(localStorage.getItem(STORAGE_KEYS.EVENTS) || '[]');
        event.id = `ev-${Date.now()}`;
        event.campus_id = event.campus_id || this.activeCampusId;
        event.status = event.status || 'PENDING_APPROVAL';
        event.registered_count = 0;
        list.unshift(event);
        localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(list));
        return event;
    }

    updateEvent(event) {
        const list = JSON.parse(localStorage.getItem(STORAGE_KEYS.EVENTS) || '[]');
        const idx = list.findIndex(e => e.id === event.id);
        if (idx !== -1) {
            list[idx] = { ...list[idx], ...event };
            localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(list));
            return list[idx];
        }
        return event;
    }

    updateEventStatus(eventId, status) {
        const list = JSON.parse(localStorage.getItem(STORAGE_KEYS.EVENTS) || '[]');
        const ev = list.find(e => e.id === eventId);
        if (ev) {
            ev.status = status;
            localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(list));
        }
        return ev;
    }

    // --- EVENT ATTENDEES & TICKET CHECK-IN ---
    getEventAttendees(eventId) {
        const all = JSON.parse(localStorage.getItem('erp_event_attendees') || '[]');
        return eventId ? all.filter(a => a.event_id === eventId) : all;
    }

    registerEventAttendee(eventId, memberId, memberName, email = '', role = 'STUDENT') {
        const list = JSON.parse(localStorage.getItem('erp_event_attendees') || '[]');
        const existing = list.find(a => a.event_id === eventId && a.member_id === memberId);
        if (existing) return existing;

        const ticketCode = `TKT-${eventId.slice(-4)}-${Math.floor(1000 + Math.random() * 9000)}`;
        const attendee = {
            id: `att-ev-${Date.now()}-${Math.floor(Math.random()*1000)}`,
            event_id: eventId,
            member_id: memberId,
            member_name: memberName,
            email: email,
            role: role,
            ticket_code: ticketCode,
            status: 'REGISTERED',
            checkin_time: null,
            registered_at: new Date().toISOString()
        };
        list.push(attendee);
        localStorage.setItem('erp_event_attendees', JSON.stringify(list));

        // Increment event registered count
        const events = this.getEvents('ALL');
        const ev = events.find(e => e.id === eventId);
        if (ev) {
            ev.registered_count = (ev.registered_count || 0) + 1;
            localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(events));
        }

        return attendee;
    }

    checkInEventAttendee(eventId, searchKey) {
        const list = JSON.parse(localStorage.getItem('erp_event_attendees') || '[]');
        const q = (searchKey || '').trim().toLowerCase();
        
        let attendee = list.find(a => 
            (eventId === 'ALL' || a.event_id === eventId) && 
            (a.ticket_code.toLowerCase() === q || 
             a.member_id.toLowerCase() === q || 
             a.member_name.toLowerCase().includes(q))
        );

        if (!attendee) {
            // Auto-register on spot if member exists in students or staff
            const students = JSON.parse(localStorage.getItem(STORAGE_KEYS.STUDENTS) || '[]');
            const staff = JSON.parse(localStorage.getItem(STORAGE_KEYS.STAFF) || '[]');
            const foundStudent = students.find(s => s.student_id?.toLowerCase() === q || s.nfc_tag_id?.toLowerCase() === q || s.barcode?.toLowerCase() === q);
            const foundStaff = staff.find(s => s.employee_id?.toLowerCase() === q || s.nfc_tag_id?.toLowerCase() === q || s.qr_code?.toLowerCase() === q);

            if (foundStudent || foundStaff) {
                const target = foundStudent || foundStaff;
                const targetId = foundStudent ? target.student_id : target.employee_id;
                const targetRole = foundStudent ? 'STUDENT' : 'FACULTY';
                attendee = this.registerEventAttendee(eventId, targetId, target.name, target.email || '', targetRole);
            } else {
                throw new Error(`Attendee or Ticket "${searchKey}" not registered for this event.`);
            }
        }

        attendee.status = 'CHECKED_IN';
        attendee.checkin_time = new Date().toISOString();
        localStorage.setItem('erp_event_attendees', JSON.stringify(list));
        return attendee;
    }

    deleteEvent(id) {
        let list = JSON.parse(localStorage.getItem(STORAGE_KEYS.EVENTS) || '[]');
        list = list.filter(e => e.id !== id);
        localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(list));
    }

    // --- FACILITY REQUESTS & APPROVALS WORKFLOW ---
    getFacilityRequests(campusId = this.activeCampusId) {
        const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.FACILITY_REQUESTS) || '[]');
        return campusId === 'ALL' ? all : all.filter(r => r.campus_id === campusId);
    }

    submitFacilityRequest(request) {
        const list = JSON.parse(localStorage.getItem(STORAGE_KEYS.FACILITY_REQUESTS) || '[]');
        request.id = `req-${Date.now()}`;
        request.campus_id = request.campus_id || this.activeCampusId;
        request.status = 'PENDING';
        request.created_at = new Date().toISOString();
        list.unshift(request);
        localStorage.setItem(STORAGE_KEYS.FACILITY_REQUESTS, JSON.stringify(list));

        // Trigger notification
        this.createNotification({
            title: `New Facility Request: ${request.facility_type || 'Facility'}`,
            message: `${request.requester_name || 'Staff'} submitted a request for ${request.facility_type || 'Facility'} on ${request.target_date || 'scheduled date'}.`,
            type: 'APPROVAL',
            campus_id: request.campus_id,
            target_role: 'ADMIN'
        }).catch?.(() => {});

        return request;
    }

    updateFacilityRequestStatus(requestId, status, approverName, remarks = '') {
        const list = JSON.parse(localStorage.getItem(STORAGE_KEYS.FACILITY_REQUESTS) || '[]');
        const req = list.find(r => r.id === requestId);
        if (req) {
            req.status = status;
            req.approved_by = approverName;
            req.remarks = remarks;
            req.resolved_at = new Date().toISOString();
            localStorage.setItem(STORAGE_KEYS.FACILITY_REQUESTS, JSON.stringify(list));

            // Trigger notification
            this.createNotification({
                title: `Facility Request ${status === 'APPROVED' ? 'Approved' : 'Status Updated'}`,
                message: `Request for ${req.facility_type || 'Facility'} by ${req.requester_name || 'requester'} was ${status.toLowerCase()} by ${approverName}.`,
                type: 'APPROVAL',
                campus_id: req.campus_id,
                target_role: 'ALL'
            }).catch?.(() => {});
        }
        return req;
    }

    deleteFacilityRequest(id) {
        let list = JSON.parse(localStorage.getItem(STORAGE_KEYS.FACILITY_REQUESTS) || '[]');
        list = list.filter(r => r.id !== id);
        localStorage.setItem(STORAGE_KEYS.FACILITY_REQUESTS, JSON.stringify(list));
    }

    // --- STAFF & FACULTY DIRECTORY ---
    getStaff(campusId = this.activeCampusId) {
        const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.STAFF) || '[]');
        return campusId === 'ALL' ? all : all.filter(s => s.campus_id === campusId);
    }

    saveStaff(member) {
        const list = JSON.parse(localStorage.getItem(STORAGE_KEYS.STAFF) || '[]');
        if (member.id) {
            const idx = list.findIndex(s => s.id === member.id);
            if (idx !== -1) list[idx] = member;
        } else {
            member.id = `staff-${Date.now()}`;
            member.campus_id = member.campus_id || this.activeCampusId;
            member.status = member.status || 'ACTIVE';
            list.push(member);
        }
        localStorage.setItem(STORAGE_KEYS.STAFF, JSON.stringify(list));
        return member;
    }

    deleteStaff(id) {
        let list = JSON.parse(localStorage.getItem(STORAGE_KEYS.STAFF) || '[]');
        list = list.filter(s => s.id !== id);
        localStorage.setItem(STORAGE_KEYS.STAFF, JSON.stringify(list));
    }

    // --- ACCESS CONTROL & RBAC PERMISSION MATRIX ---
    getPermissions() {
        return JSON.parse(localStorage.getItem(STORAGE_KEYS.PERMISSIONS) || '[]');
    }

    updatePermission(role, field, value) {
        const list = this.getPermissions();
        const roleObj = list.find(p => p.role === role);
        if (roleObj) {
            roleObj[field] = value;
            localStorage.setItem(STORAGE_KEYS.PERMISSIONS, JSON.stringify(list));
        }
        return roleObj;
    }

    saveRolePermissions(roleObj) {
        const list = this.getPermissions();
        const idx = list.findIndex(p => p.role === roleObj.role);
        if (idx !== -1) {
            list[idx] = roleObj;
        } else {
            list.push(roleObj);
        }
        localStorage.setItem(STORAGE_KEYS.PERMISSIONS, JSON.stringify(list));
        return roleObj;
    }

    // --- SYSTEM ADMIN & PRIVILEGED ACCOUNTS (UNDER SUPERADMIN) ---
    getAdminAccounts() {
        const defaultAdmins = [
            {
                id: 'admin-root',
                name: 'Super Administrator',
                email: 'admin@tgi.edu',
                role: 'SUPER_ADMIN',
                campus_id: 'ALL',
                designation: 'Chief System Director & Superadmin',
                status: 'ACTIVE',
                can_access_all: true,
                created_at: new Date('2026-01-01').toISOString()
            }
        ];
        const stored = localStorage.getItem(STORAGE_KEYS.ADMIN_ACCOUNTS);
        if (!stored) {
            localStorage.setItem(STORAGE_KEYS.ADMIN_ACCOUNTS, JSON.stringify(defaultAdmins));
            return defaultAdmins;
        }
        try {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        } catch (e) {}
        return defaultAdmins;
    }

    async createAdminAccount(admin) {
        const list = this.getAdminAccounts();
        admin.id = admin.id || `admin-${Date.now()}`;
        admin.status = admin.status || 'ACTIVE';
        admin.created_at = admin.created_at || new Date().toISOString();
        admin.can_access_all = true;
        admin.role = admin.role || 'SYSTEM_ADMIN';
        admin.campus_id = admin.campus_id || 'ALL';
        admin.password = admin.password || 'admin123';

        // Check if email already exists
        const existingIdx = list.findIndex(a => a.email.toLowerCase() === admin.email.toLowerCase());
        if (existingIdx !== -1) {
            list[existingIdx] = { ...list[existingIdx], ...admin };
        } else {
            list.push(admin);
        }

        localStorage.setItem(STORAGE_KEYS.ADMIN_ACCOUNTS, JSON.stringify(list));
        window.dispatchEvent(new CustomEvent('adminAccountsUpdated', { detail: list }));

        // Register in staff directory for unified institutional presence
        this.saveStaff({
            id: `staff-${admin.id}`,
            name: admin.name,
            email: admin.email,
            role: 'ADMIN',
            campus_id: admin.campus_id,
            designation: admin.designation || 'System Administrator',
            employee_id: `ADM-${Math.floor(100 + Math.random() * 900)}`,
            status: 'ACTIVE'
        });

        // 1. Try to register user in Supabase Auth if possible
        try {
            if (admin.password) {
                await supabase.auth.signUp({
                    email: admin.email,
                    password: admin.password,
                    options: {
                        data: {
                            name: admin.name,
                            role: admin.role,
                            campus_id: admin.campus_id
                        }
                    }
                });
            }
        } catch (authErr) {
            console.warn("Supabase auth signup attempt notice:", authErr?.message || authErr);
        }

        // 2. Remote Supabase persistence in admin_accounts table
        try {
            const { error: adminErr } = await supabase.from('admin_accounts').upsert([{
                id: admin.id,
                name: admin.name,
                email: admin.email,
                role: admin.role,
                campus_id: admin.campus_id,
                designation: admin.designation || 'System Administrator',
                status: admin.status,
                password_hash: admin.password,
                created_at: admin.created_at
            }], { onConflict: 'id' });

            if (adminErr) {
                console.warn("Supabase admin_accounts upsert info:", adminErr.message);
            }
        } catch (e) {
            console.warn("Supabase admin account sync warning:", e);
        }

        // 3. Remote Supabase persistence in profiles table (if present)
        try {
            await supabase.from('profiles').upsert([{
                id: admin.id,
                name: admin.name,
                email: admin.email,
                role: admin.role,
                campus_id: admin.campus_id,
                is_superadmin: admin.role === 'SUPER_ADMIN' || admin.role === 'SYSTEM_ADMIN'
            }], { onConflict: 'id' });
        } catch (profErr) {
            // Non-blocking
        }

        return admin;
    }

    async deleteAdminAccount(id) {
        let list = this.getAdminAccounts();
        const target = list.find(a => a.id === id);
        if (target && target.role === 'SUPER_ADMIN') {
            throw new Error("Cannot delete primary Super Administrator account.");
        }
        list = list.filter(a => a.id !== id);
        localStorage.setItem(STORAGE_KEYS.ADMIN_ACCOUNTS, JSON.stringify(list));
        window.dispatchEvent(new CustomEvent('adminAccountsUpdated', { detail: list }));

        try {
            await supabase.from('admin_accounts').delete().eq('id', id);
        } catch (e) {}

        try {
            await supabase.from('profiles').delete().eq('id', id);
        } catch (e) {}
    }

    async syncAdminAccountsFromSupabase() {
        try {
            const { data, error } = await supabase
                .from('admin_accounts')
                .select('*');
            if (data && !error && data.length > 0) {
                const list = this.getAdminAccounts();
                const map = new Map();
                list.forEach(a => map.set(a.id, a));
                data.forEach(remote => {
                    const existing = map.get(remote.id) || {};
                    map.set(remote.id, {
                        ...existing,
                        id: remote.id,
                        name: remote.name,
                        email: remote.email,
                        password: remote.password_hash || existing.password || 'admin123',
                        role: remote.role || 'SYSTEM_ADMIN',
                        campus_id: remote.campus_id || 'ALL',
                        designation: remote.designation || 'System Administrator',
                        status: remote.status || 'ACTIVE',
                        can_access_all: true,
                        created_at: remote.created_at || new Date().toISOString()
                    });
                });
                const merged = Array.from(map.values());
                localStorage.setItem(STORAGE_KEYS.ADMIN_ACCOUNTS, JSON.stringify(merged));
                window.dispatchEvent(new CustomEvent('adminAccountsUpdated', { detail: merged }));
                return merged;
            }
        } catch (e) {
            console.warn("Could not sync admin accounts from Supabase:", e);
        }
        return this.getAdminAccounts();
    }

    // --- AGGREGATED USAGE ANALYTICS ENGINE ---
    getComputerUsageAnalytics(timeframe = 'all', campusId = 'ALL') {
        const sessions = this.getComputerSessions({ campus_id: campusId });
        const now = new Date();
        
        let filtered = sessions;
        if (timeframe === 'day') {
            const todayStr = now.toISOString().split('T')[0];
            filtered = sessions.filter(s => s.start_time.startsWith(todayStr));
        } else if (timeframe === 'week') {
            const oneWeekAgo = new Date(now.getTime() - 7 * 86400 * 1000);
            filtered = sessions.filter(s => new Date(s.start_time) >= oneWeekAgo);
        } else if (timeframe === 'month') {
            const oneMonthAgo = new Date(now.getTime() - 30 * 86400 * 1000);
            filtered = sessions.filter(s => new Date(s.start_time) >= oneMonthAgo);
        }

        const totalMinutes = filtered.reduce((acc, s) => acc + (s.duration_minutes || 0), 0);
        const totalSessions = filtered.length;
        
        // Machine distribution
        const machineUsage = {};
        filtered.forEach(s => {
            machineUsage[s.machine_code] = (machineUsage[s.machine_code] || 0) + (s.duration_minutes || 0);
        });

        // Student usage aggregation
        const studentUsage = {};
        filtered.forEach(s => {
            if (!studentUsage[s.student_id]) {
                studentUsage[s.student_id] = {
                    student_id: s.student_id,
                    student_name: s.student_name,
                    total_minutes: 0,
                    sessions_count: 0
                };
            }
            studentUsage[s.student_id].total_minutes += (s.duration_minutes || 0);
            studentUsage[s.student_id].sessions_count += 1;
        });

        return {
            totalMinutes,
            totalHours: (totalMinutes / 60).toFixed(1),
            totalSessions,
            machineUsage,
            studentUsage: Object.values(studentUsage).sort((a,b) => b.total_minutes - a.total_minutes),
            sessions: filtered
        };
    }

    // --- NOTIFICATIONS SYSTEM ---
    getNotifications(campusId = this.activeCampusId) {
        const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS) || '[]');
        return campusId === 'ALL' ? all : all.filter(n => !n.campus_id || n.campus_id === campusId || n.campus_id === 'ALL');
    }

    getUnreadNotificationCount() {
        return this.getNotifications().filter(n => n.unread).length;
    }

    async syncNotificationsFromSupabase() {
        try {
            const { data, error } = await supabase
                .from('notifications')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(50);
            
            if (data && !error) {
                const local = JSON.parse(localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS) || '[]');
                const map = new Map();
                local.forEach(item => map.set(item.id, item));
                data.forEach(remote => {
                    const existing = map.get(remote.id);
                    map.set(remote.id, {
                        id: remote.id,
                        title: remote.title || 'Notification',
                        message: remote.message || '',
                        type: remote.type || 'BROADCAST',
                        link: remote.link || remote.action_link || '',
                        campus_id: remote.campus_id || 'ALL',
                        target_role: remote.target_role || remote.target_audience || 'ALL',
                        timestamp: remote.created_at || new Date().toISOString(),
                        unread: existing ? existing.unread : (remote.unread !== undefined ? remote.unread : !remote.is_read)
                    });
                });
                const merged = Array.from(map.values()).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(merged));
                window.dispatchEvent(new CustomEvent('notificationsUpdated'));
                return merged;
            }
        } catch (e) {
            console.warn("Could not sync notifications from Supabase:", e);
        }
        return this.getNotifications();
    }

    async createNotification(notif) {
        const list = JSON.parse(localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS) || '[]');
        notif.id = notif.id || `notif-${Date.now()}-${Math.floor(Math.random()*1000)}`;
        notif.timestamp = notif.timestamp || new Date().toISOString();
        notif.unread = notif.unread !== undefined ? notif.unread : true;
        notif.campus_id = notif.campus_id || this.activeCampusId || 'ALL';
        notif.type = notif.type || 'BROADCAST';
        
        list.unshift(notif);
        localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(list));
        window.dispatchEvent(new CustomEvent('notificationReceived', { detail: notif }));
        window.dispatchEvent(new CustomEvent('notificationsUpdated'));

        // Native Android Bridge notification
        if (typeof window !== 'undefined' && window.AndroidBridge && typeof window.AndroidBridge.postNativeNotification === 'function') {
            try {
                window.AndroidBridge.postNativeNotification(notif.title || 'Notification', notif.message || '', notif.type || 'BROADCAST', notif.link || '');
            } catch (e) {
                console.warn("AndroidBridge notification error:", e);
            }
        }

        // Supabase remote persistence
        try {
            await supabase.from('notifications').insert([{
                id: notif.id,
                campus_id: notif.campus_id,
                title: notif.title,
                message: notif.message,
                type: notif.type,
                link: notif.link || null,
                action_link: notif.link || null,
                target_audience: notif.target_audience || 'ALL',
                target_role: notif.target_role || 'ALL',
                unread: notif.unread,
                is_read: !notif.unread,
                created_at: notif.timestamp
            }]);
        } catch (e) {
            console.warn("Supabase notification insert error:", e);
        }

        return notif;
    }

    async markNotificationRead(id) {
        const list = JSON.parse(localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS) || '[]');
        const target = list.find(n => n.id === id);
        if (target) {
            target.unread = false;
            localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(list));
            window.dispatchEvent(new CustomEvent('notificationsUpdated'));
        }
        try {
            await supabase.from('notifications').update({ unread: false, is_read: true }).eq('id', id);
        } catch (e) {}
    }

    async markAllNotificationsRead() {
        const list = JSON.parse(localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS) || '[]');
        list.forEach(n => n.unread = false);
        localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(list));
        window.dispatchEvent(new CustomEvent('notificationsUpdated'));
        try {
            await supabase.from('notifications').update({ unread: false, is_read: true }).neq('id', 'dummy');
        } catch (e) {}
    }

    async deleteNotification(id) {
        let list = JSON.parse(localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS) || '[]');
        list = list.filter(n => n.id !== id);
        localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(list));
        window.dispatchEvent(new CustomEvent('notificationsUpdated'));
        try {
            await supabase.from('notifications').delete().eq('id', id);
        } catch (e) {}
    }

    // --- PREMIUM ADMIN MESSENGER & HELPDESK ---
    getChatChannels() {
        return JSON.parse(localStorage.getItem(STORAGE_KEYS.CHAT_CHANNELS) || '[]');
    }

    getChatMessages(channelId = 'ch-admin') {
        const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.CHAT_MESSAGES) || '[]');
        return all.filter(m => m.channel_id === channelId);
    }

    sendChatMessage(channelId, senderId, senderName, senderRole, text, isOutgoing = true) {
        const messages = JSON.parse(localStorage.getItem(STORAGE_KEYS.CHAT_MESSAGES) || '[]');
        const channels = this.getChatChannels();

        const newMsg = {
            id: `msg-${Date.now()}-${Math.floor(Math.random()*1000)}`,
            channel_id: channelId,
            sender_id: senderId,
            sender_name: senderName,
            sender_role: senderRole,
            text: text,
            is_outgoing: isOutgoing,
            timestamp: new Date().toISOString()
        };

        messages.push(newMsg);
        localStorage.setItem(STORAGE_KEYS.CHAT_MESSAGES, JSON.stringify(messages));

        // Update channel last message
        const ch = channels.find(c => c.id === channelId);
        if (ch) {
            ch.last_message = text;
            ch.last_time = newMsg.timestamp;
            localStorage.setItem(STORAGE_KEYS.CHAT_CHANNELS, JSON.stringify(channels));
        }

        window.dispatchEvent(new CustomEvent('chatMessageSent', { detail: newMsg }));
        return newMsg;
    }

    // --- ACADEMIC SCHOOL LIBRARY: SELF-SERVICE CHECKOUT & RETURN ---
    selfCheckout(studentIdOrNfc, barcode) {
        // Find student
        const students = JSON.parse(localStorage.getItem(STORAGE_KEYS.STUDENTS) || '[]');
        const q = studentIdOrNfc.trim().toLowerCase();
        const student = students.find(s => 
            s.student_id?.toLowerCase() === q || 
            s.nfc_tag_id?.toLowerCase() === q || 
            s.barcode?.toLowerCase() === q
        ) || { id: 's-guest', name: 'Student Member', student_id: studentIdOrNfc };

        const dueDate = new Date(Date.now() + 14 * 86400 * 1000).toISOString().split('T')[0];
        const newLoan = {
            id: `loan-sc-${Date.now()}`,
            student_id: student.id,
            student_name: student.name,
            student_code: student.student_id,
            barcode: barcode.trim(),
            issue_date: new Date().toISOString().split('T')[0],
            due_date: dueDate,
            status: 'ACTIVE',
            mode: 'SELF_SERVICE_KIOSK'
        };

        const loans = JSON.parse(localStorage.getItem('erp_kiosk_loans') || '[]');
        loans.unshift(newLoan);
        localStorage.setItem('erp_kiosk_loans', JSON.stringify(loans));

        return { student, loan: newLoan, dueDate };
    }

    selfReturn(barcode) {
        const b = barcode.trim().toUpperCase();
        const loans = JSON.parse(localStorage.getItem('erp_kiosk_loans') || '[]');
        const target = loans.find(l => l.barcode.toUpperCase() === b && l.status === 'ACTIVE');
        
        if (target) {
            target.status = 'RETURNED';
            target.return_date = new Date().toISOString();
            localStorage.setItem('erp_kiosk_loans', JSON.stringify(loans));
        }

        return { barcode: b, returnedAt: new Date().toLocaleTimeString(), onTime: true };
    }

    // --- ACADEMIC READING LOGS & BADGES ---
    getReadingLogs(studentId) {
        const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.READING_LOGS) || '[]');
        return studentId ? all.filter(r => r.student_id === studentId) : all;
    }

    logReadingSession(studentId, studentName, bookTitle, pagesRead, minutesSpent, feedback = '') {
        const list = JSON.parse(localStorage.getItem(STORAGE_KEYS.READING_LOGS) || '[]');
        const log = {
            id: `rl-${Date.now()}`,
            student_id: studentId,
            student_name: studentName,
            book_title: bookTitle,
            pages_read: parseInt(pagesRead) || 10,
            minutes_spent: parseInt(minutesSpent) || 30,
            feedback: feedback,
            date: new Date().toISOString().split('T')[0]
        };
        list.unshift(log);
        localStorage.setItem(STORAGE_KEYS.READING_LOGS, JSON.stringify(list));
        return log;
    }

    // --- TEACHER CLASSROOM BOOK SETS ---
    getClassroomSets(campusId = this.activeCampusId) {
        const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.CLASSROOM_SETS) || '[]');
        return campusId === 'ALL' ? all : all.filter(c => c.campus_id === campusId);
    }

    borrowClassroomSet(teacherId, teacherName, setTitle, copiesCount, gradeClass, dueDate) {
        const list = JSON.parse(localStorage.getItem(STORAGE_KEYS.CLASSROOM_SETS) || '[]');
        const setObj = {
            id: `set-${Date.now()}`,
            campus_id: this.activeCampusId,
            teacher_id: teacherId,
            teacher_name: teacherName,
            set_title: setTitle,
            copies_count: parseInt(copiesCount) || 30,
            grade_class: gradeClass,
            borrow_date: new Date().toISOString().split('T')[0],
            due_date: dueDate || new Date(Date.now() + 60*86400*1000).toISOString().split('T')[0],
            status: 'BORROWED_FOR_CLASS'
        };
        list.unshift(setObj);
        localStorage.setItem(STORAGE_KEYS.CLASSROOM_SETS, JSON.stringify(list));
        return setObj;
    }

    returnClassroomSet(setId) {
        const list = JSON.parse(localStorage.getItem(STORAGE_KEYS.CLASSROOM_SETS) || '[]');
        const target = list.find(s => s.id === setId);
        if (target) {
            target.status = 'RETURNED_TO_LIBRARY';
            target.return_date = new Date().toISOString().split('T')[0];
            localStorage.setItem(STORAGE_KEYS.CLASSROOM_SETS, JSON.stringify(list));
        }
        return target;
    }

    // --- INTER-CAMPUS SCHOOL BRANCH TRANSFERS ---
    getCampusTransfers(campusId = this.activeCampusId) {
        const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.CAMPUS_TRANSFERS) || '[]');
        return campusId === 'ALL' ? all : all.filter(t => t.from_campus === campusId || t.to_campus === campusId);
    }

    createCampusTransfer(fromCampusId, toCampusId, bookTitle, quantity, requestedBy, reason = '') {
        const list = JSON.parse(localStorage.getItem(STORAGE_KEYS.CAMPUS_TRANSFERS) || '[]');
        const transfer = {
            id: `tr-${Date.now()}`,
            from_campus: fromCampusId,
            to_campus: toCampusId,
            book_title: bookTitle,
            quantity: parseInt(quantity) || 1,
            requested_by: requestedBy,
            reason: reason,
            status: 'IN_TRANSIT_COURIER',
            requested_at: new Date().toISOString()
        };
        list.unshift(transfer);
        localStorage.setItem(STORAGE_KEYS.CAMPUS_TRANSFERS, JSON.stringify(list));
        return transfer;
    }

    updateTransferStatus(transferId, status) {
        const list = JSON.parse(localStorage.getItem(STORAGE_KEYS.CAMPUS_TRANSFERS) || '[]');
        const t = list.find(tr => tr.id === transferId);
        if (t) {
            t.status = status;
            t.updated_at = new Date().toISOString();
            localStorage.setItem(STORAGE_KEYS.CAMPUS_TRANSFERS, JSON.stringify(list));
        }
        return t;
    }

    // --- DAMAGED & LOST BOOK AUDIT ---
    getDamageIncidents(campusId = this.activeCampusId) {
        const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.DAMAGE_INCIDENTS) || '[]');
        return campusId === 'ALL' ? all : all.filter(d => d.campus_id === campusId);
    }

    reportDamageIncident(barcode, bookTitle, studentId, studentName, damageType, notes = '', resolution = 'REPLACEMENT_PENDING') {
        const list = JSON.parse(localStorage.getItem(STORAGE_KEYS.DAMAGE_INCIDENTS) || '[]');
        const inc = {
            id: `dam-${Date.now()}`,
            campus_id: this.activeCampusId,
            barcode: barcode,
            book_title: bookTitle,
            student_id: studentId,
            student_name: studentName,
            damage_type: damageType, // 'PAGES_TORN', 'WATER_DAMAGE', 'BINDING_BROKEN', 'LOST'
            notes: notes,
            resolution: resolution, // 'REPLACED_BY_STUDENT', 'FINE_RECORDED', 'REPLACEMENT_PENDING'
            reported_at: new Date().toISOString()
        };
        list.unshift(inc);
        localStorage.setItem(STORAGE_KEYS.DAMAGE_INCIDENTS, JSON.stringify(list));
        return inc;
    }

    // --- DIGITAL HALL PASS & LIBRARY ENTRANCE VERIFICATION ---
    getHallPasses(campusId = this.activeCampusId) {
        const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.HALL_PASSES) || '[]');
        return campusId === 'ALL' ? all : all.filter(p => p.campus_id === campusId);
    }

    issueHallPass(studentId, studentName, teacherName, originClass, reason = 'Library Research Period', durationMins = 15) {
        const list = JSON.parse(localStorage.getItem(STORAGE_KEYS.HALL_PASSES) || '[]');
        const departureTime = new Date();
        const expectedArrival = new Date(departureTime.getTime() + durationMins * 60 * 1000);

        const pass = {
            id: `PASS-${Math.floor(1000 + Math.random() * 9000)}`,
            campus_id: this.activeCampusId,
            student_id: studentId,
            student_name: studentName,
            teacher_name: teacherName,
            origin_class: originClass,
            reason: reason,
            duration_minutes: durationMins,
            issued_at: departureTime.toISOString(),
            expected_arrival_at: expectedArrival.toISOString(),
            verified_arrival_at: null,
            status: 'IN_TRANSIT', // 'IN_TRANSIT', 'ARRIVED_ON_TIME', 'LATE_ARRIVAL', 'EXPIRED'
            flagged_truant: false
        };

        list.unshift(pass);
        localStorage.setItem(STORAGE_KEYS.HALL_PASSES, JSON.stringify(list));
        return pass;
    }

    verifyHallPassArrival(passIdOrStudentId) {
        const list = JSON.parse(localStorage.getItem(STORAGE_KEYS.HALL_PASSES) || '[]');
        const q = passIdOrStudentId.trim().toLowerCase();
        
        // Find active pass in transit for this student
        const pass = list.find(p => 
            p.status === 'IN_TRANSIT' && 
            (p.id.toLowerCase() === q || p.student_id.toLowerCase() === q || p.student_name.toLowerCase().includes(q))
        );

        if (!pass) {
            throw new Error(`No active in-transit Hall Pass found for "${passIdOrStudentId}". Student may not have exit permission.`);
        }

        const arrivalTime = new Date();
        const expected = new Date(pass.expected_arrival_at);
        const isLate = arrivalTime > expected;

        pass.verified_arrival_at = arrivalTime.toISOString();
        pass.status = isLate ? 'LATE_ARRIVAL' : 'ARRIVED_ON_TIME';
        pass.flagged_truant = isLate;

        localStorage.setItem(STORAGE_KEYS.HALL_PASSES, JSON.stringify(list));
        return pass;
    }

    // --- WINDOWS COMPUTER LAB WORKSTATION CLASSROOM LOCK & FOCUS POLICY ---
    getWorkstationPolicy() {
        const defaultPolicy = {
            active_period_id: 'per-2',
            period_name: 'Period 5 (01:30 PM - 02:30 PM) - Practical Coding & Spreadsheet Lab',
            class_name: 'CS-B 2026',
            teacher_name: 'Prof. Ananya Roy',
            allowed_mode: 'EXCEL_ONLY', // 'EXCEL_ONLY', 'PYTHON_CODING', 'RESEARCH_BROWSER', 'EXAM_LOCKDOWN', 'UNRESTRICTED'
            allowed_apps: ['Microsoft Excel', 'Google Sheets Calc', 'Institutional ERP'],
            blocked_apps: ['Social Media', 'Games', 'YouTube', 'Chat Apps', 'External USB Drives'],
            lock_active: true,
            strict_student_assignment: true
        };
        return JSON.parse(localStorage.getItem(STORAGE_KEYS.WORKSTATION_POLICIES) || JSON.stringify(defaultPolicy));
    }

    setWorkstationPolicy(policy) {
        localStorage.setItem(STORAGE_KEYS.WORKSTATION_POLICIES, JSON.stringify(policy));
        window.dispatchEvent(new CustomEvent('workstationPolicyChanged', { detail: policy }));
        return policy;
    }

    getWorkstationAssignments() {
        return JSON.parse(localStorage.getItem(STORAGE_KEYS.WORKSTATION_ASSIGNMENTS) || '[]');
    }

    assignStudentToMachine(machineCode, studentId, studentName, className = 'CS-B 2026') {
        const list = this.getWorkstationAssignments();
        let item = list.find(a => a.machine_code === machineCode);
        if (item) {
            item.student_id = studentId;
            item.student_name = studentName;
            item.class_name = className;
        } else {
            list.push({ machine_code: machineCode, student_id: studentId, student_name: studentName, class_name: className });
        }
        localStorage.setItem(STORAGE_KEYS.WORKSTATION_ASSIGNMENTS, JSON.stringify(list));
    }

    validateWorkstationLogin(machineCode, username, password) {
        const policy = this.getWorkstationPolicy();
        const assignments = this.getWorkstationAssignments();
        const u = (username || '').trim().toLowerCase();

        // 1. Check if login matches assigned student if strict assignment is enabled
        if (policy.strict_student_assignment) {
            const assignment = assignments.find(a => a.machine_code.toLowerCase() === machineCode.toLowerCase());
            if (!assignment) {
                throw new Error(`Workstation "${machineCode}" is not registered in current classroom schedule.`);
            }

            const matchesAssigned = assignment.student_id.toLowerCase() === u || assignment.student_name.toLowerCase().includes(u);
            if (!matchesAssigned) {
                throw new Error(`ACCESS DENIED: Machine ${machineCode} is reserved exclusively for "${assignment.student_name} (${assignment.student_id})" during ${policy.period_name}.`);
            }
        }

        return {
            authenticated: true,
            student_id: assignment.student_id,
            student_name: assignment.student_name,
            machine_code: machineCode,
            policy: policy,
            session: res.session
        };
    }

    // --- NFC TAGS & SMART CARD PROVISIONING ---
    getNfcTags(campusId = this.activeCampusId) {
        const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.NFC_TAGS) || '[]');
        return campusId === 'ALL' ? all : all.filter(t => !t.campus_id || t.campus_id === 'ALL' || t.campus_id === campusId);
    }

    saveNfcTag(tag) {
        const list = JSON.parse(localStorage.getItem(STORAGE_KEYS.NFC_TAGS) || '[]');
        if (tag.id) {
            const idx = list.findIndex(t => t.id === tag.id);
            if (idx !== -1) list[idx] = { ...list[idx], ...tag, updated_at: new Date().toISOString() };
        } else {
            tag.id = `nfc-${Date.now()}`;
            tag.status = tag.status || 'ACTIVE';
            tag.created_at = new Date().toISOString();
            list.unshift(tag);
        }
        localStorage.setItem(STORAGE_KEYS.NFC_TAGS, JSON.stringify(list));
        window.dispatchEvent(new CustomEvent('nfcTagsUpdated', { detail: list }));
        return tag;
    }

    deleteNfcTag(id) {
        let list = JSON.parse(localStorage.getItem(STORAGE_KEYS.NFC_TAGS) || '[]');
        list = list.filter(t => t.id !== id);
        localStorage.setItem(STORAGE_KEYS.NFC_TAGS, JSON.stringify(list));
        window.dispatchEvent(new CustomEvent('nfcTagsUpdated', { detail: list }));
    }

    findNfcTagByUid(uid) {
        if (!uid) return null;
        const list = this.getNfcTags('ALL');
        return list.find(t => t.tag_uid && t.tag_uid.toLowerCase() === uid.trim().toLowerCase());
    }

    findNfcTagByBarcode(barcode) {
        if (!barcode) return null;
        const list = this.getNfcTags('ALL');
        return list.find(t => t.barcode && t.barcode.toLowerCase() === barcode.trim().toLowerCase());
    }

    // --- ID CARD DESIGNER TEMPLATES ---
    getIdCardTemplates() {
        const defaultTemplates = [
            {
                id: 'tmpl-cr80-landscape',
                name: 'Standard CR80 Landscape (Institutional)',
                orientation: 'landscape',
                width_mm: 85.6,
                height_mm: 53.98,
                theme_color: '#3b82f6',
                accent_color: '#1e3a8a',
                bg_type: 'gradient',
                show_logo: true,
                show_photo: true,
                show_barcode: true,
                show_qrcode: true,
                show_nfc_chip: true,
                show_blood_group: true,
                show_expiry: true,
                show_signature: true,
                is_default: true
            },
            {
                id: 'tmpl-cr80-portrait',
                name: 'Modern Executive Portrait Badge',
                orientation: 'portrait',
                width_mm: 53.98,
                height_mm: 85.6,
                theme_color: '#4f46e5',
                accent_color: '#312e81',
                bg_type: 'clean_light',
                show_logo: true,
                show_photo: true,
                show_barcode: true,
                show_qrcode: true,
                show_nfc_chip: true,
                show_blood_group: true,
                show_expiry: true,
                show_signature: true,
                is_default: false
            }
        ];
        return JSON.parse(localStorage.getItem(STORAGE_KEYS.ID_CARD_TEMPLATES) || JSON.stringify(defaultTemplates));
    }

    saveIdCardTemplate(tmpl) {
        const list = this.getIdCardTemplates();
        if (tmpl.id) {
            const idx = list.findIndex(t => t.id === tmpl.id);
            if (idx !== -1) list[idx] = { ...list[idx], ...tmpl };
        } else {
            tmpl.id = `tmpl-${Date.now()}`;
            list.push(tmpl);
        }
        localStorage.setItem(STORAGE_KEYS.ID_CARD_TEMPLATES, JSON.stringify(list));
        return tmpl;
    }

    deleteIdCardTemplate(id) {
        let list = this.getIdCardTemplates();
        list = list.filter(t => t.id !== id && !t.is_default);
        localStorage.setItem(STORAGE_KEYS.ID_CARD_TEMPLATES, JSON.stringify(list));
    }
}

export const erp = new ErpDataService();
window.erp = erp;



