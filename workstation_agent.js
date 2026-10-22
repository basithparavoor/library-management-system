// workstation_agent.js - Windows Computer Classroom Lock, Single-Student Access & Focus App Policy
import { erp } from './erp_service.js';
import { showToast, playAudioChime } from './ui.js';

let activeMachineCode = '';
let currentSessionUser = null;
let sessionSeconds = 0;
let sessionInterval = null;

document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initMachineSelector();
    initClock();
    renderAssignments();
    setupEventListeners();
});

function initNavigation() {
    const clientView = document.getElementById('section-client-view');
    const adminView = document.getElementById('section-admin-view');
    const btnClient = document.getElementById('btn-view-client');
    const btnAdmin = document.getElementById('btn-view-admin-ctrl');

    btnClient?.addEventListener('click', () => {
        clientView.style.display = 'block';
        adminView.style.display = 'none';
        btnClient.className = 'btn btn-primary';
        btnAdmin.className = 'btn btn-outline';
        if (window.lucide) lucide.createIcons();

    // Refresh mobile card view
    if (window.initMobileCardTables) window.initMobileCardTables();
    });

    btnAdmin?.addEventListener('click', () => {
        clientView.style.display = 'none';
        adminView.style.display = 'block';
        btnAdmin.className = 'btn btn-primary';
        btnClient.className = 'btn btn-outline';
        renderAssignments();
        if (window.lucide) lucide.createIcons();

    // Refresh mobile card view
    if (window.initMobileCardTables) window.initMobileCardTables();
    });
}

function initMachineSelector() {
    const select = document.getElementById('active-machine-select');
    if (!select) return;
    
    const computers = erp.getComputers('ALL');
    if (computers && computers.length > 0) {
        select.innerHTML = computers.map(c => `
            <option value="${c.machine_code}">${c.machine_code} - ${c.lab_name} (${c.status})</option>
        `).join('');
        activeMachineCode = computers[0].machine_code;
    } else {
        select.innerHTML = `<option value="PC-01">PC-01 (Default Terminal)</option>`;
        activeMachineCode = 'PC-01';
    }

    const lockMachineCodeEl = document.getElementById('lockscreen-machine-code');
    if (lockMachineCodeEl) lockMachineCodeEl.innerText = activeMachineCode;

    select.addEventListener('change', (e) => {
        activeMachineCode = e.target.value;
        if (lockMachineCodeEl) lockMachineCodeEl.innerText = activeMachineCode;
        logOffCurrentWorkstation();
    });
}

function initClock() {
    const clockEl = document.getElementById('lockscreen-clock');
    const update = () => {
        const now = new Date();
        if (clockEl) clockEl.innerText = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };
    update();
    setInterval(update, 1000);
}

function renderAssignments() {
    const tbody = document.getElementById('assignments-tbody');
    if (!tbody) return;

    const assignments = erp.getWorkstationAssignments();
    const computers = erp.getComputers('ALL');

    if (!assignments || assignments.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="padding: 2.5rem; text-align: center; color: var(--text-muted);">No student workstation seat assignments configured.</td></tr>`;
        return;
    }

    tbody.innerHTML = assignments.map(a => {
        const comp = computers.find(c => c.machine_code === a.machine_code);
        const isOccupied = comp && comp.status === 'IN_USE';

        return `
            <tr>
                <td style="font-family: var(--font-mono); font-weight: 700; color: var(--brand-primary);">${a.machine_code}</td>
                <td style="font-weight: 700;">${a.student_name}</td>
                <td style="font-family: var(--font-mono); font-size: 0.85rem;">${a.student_id}</td>
                <td><span class="badge badge-brand" style="font-size: 0.7rem;">${a.class_name || 'Academic Class'}</span></td>
                <td>
                    <span class="badge ${isOccupied ? 'badge-warning' : 'badge-success'}">
                        ${isOccupied ? '<span class="badge-dot"></span> LOGGED IN' : 'READY FOR STUDENT'}
                    </span>
                </td>
                <td style="text-align: right;">
                    <button class="btn btn-outline btn-sm btn-reassign" data-pc="${a.machine_code}" style="font-size: 0.75rem; padding: 0.25rem 0.5rem;">
                        Reassign Seat
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    tbody.querySelectorAll('.btn-reassign').forEach(btn => {
        btn.addEventListener('click', () => {
            const pc = btn.dataset.pc;
            const newName = prompt(`Enter new student name for workstation ${pc}:`);
            const newId = prompt(`Enter student register ID:`);
            if (newName && newId) {
                erp.assignStudentToMachine(pc, newId.trim(), newName.trim());
                playAudioChime('SUCCESS');
                showToast(`Workstation ${pc} assigned to ${newName}`, 'success');
                renderAssignments();
            }
        });
    });
}

function handleLoginSubmit(e) {
    e.preventDefault();
    const username = document.getElementById('ws-username').value.trim();
    const password = document.getElementById('ws-password').value.trim();
    const errBox = document.getElementById('ws-login-error');

    errBox.style.display = 'none';

    try {
        const result = erp.validateWorkstationLogin(activeMachineCode, username, password);
        currentSessionUser = result;

        // Transition from Lock Screen to Desktop
        document.getElementById('client-locked-screen').style.display = 'none';
        document.getElementById('client-unlocked-desktop').style.display = 'flex';

        document.getElementById('desktop-user-display').innerText = result.student_name;
        document.getElementById('active-app-title').innerHTML = `
            <i data-lucide="file-spreadsheet" style="width: 16px; color: #22c55e;"></i> Microsoft Excel - ${result.policy.period_name} [Whitelisted Focus Mode]
        `;

        // Start session usage timer
        sessionSeconds = 0;
        clearInterval(sessionInterval);
        sessionInterval = setInterval(() => {
            sessionSeconds++;
            const hrs = String(Math.floor(sessionSeconds / 3600)).padStart(2, '0');
            const mins = String(Math.floor((sessionSeconds % 3600) / 60)).padStart(2, '0');
            const secs = String(sessionSeconds % 60).padStart(2, '0');
            document.getElementById('desktop-timer').innerText = `${hrs}:${mins}:${secs}`;
        }, 1000);

        playAudioChime('SUCCESS');
        showToast(`Welcome, ${result.student_name}. Focus Policy: ${result.policy.allowed_mode}`, 'success');
        if (window.lucide) lucide.createIcons();

    // Refresh mobile card view
    if (window.initMobileCardTables) window.initMobileCardTables();
    } catch (err) {
        playAudioChime('ERROR');
        errBox.style.display = 'block';
        errBox.innerHTML = `<strong>⚠ ACCESS RESTRICTION:</strong> ${err.message}`;
        showToast(err.message, 'error');
    }
}

function logOffCurrentWorkstation() {
    clearInterval(sessionInterval);
    if (currentSessionUser) {
        try {
            erp.checkOutComputer(activeMachineCode);
        } catch(e) {}
    }
    currentSessionUser = null;
    document.getElementById('client-unlocked-desktop').style.display = 'none';
    document.getElementById('client-locked-screen').style.display = 'flex';
    document.getElementById('ws-username').value = '';
    document.getElementById('ws-login-error').style.display = 'none';
}

function setupEventListeners() {
    document.getElementById('form-workstation-login')?.addEventListener('submit', handleLoginSubmit);
    document.getElementById('btn-ws-logoff')?.addEventListener('click', () => {
        playAudioChime('TAP');
        logOffCurrentWorkstation();
        showToast('Workstation logged off and session time saved to ERP.', 'info');
    });

    // Test Blocked App Clicks
    document.querySelectorAll('.btn-try-blocked').forEach(btn => {
        btn.addEventListener('click', () => {
            const app = btn.dataset.app;
            playAudioChime('ERROR');
            alert(`🛡️ SECURITY POLICY INTERCEPTION:\n\nAccess to "${app}" is strictly blocked by the Instructor during this period.\nOnly Microsoft Excel & approved courseware are permitted.`);
        });
    });

    // Admin Policy Controls
    document.getElementById('btn-apply-policy')?.addEventListener('click', () => {
        const mode = document.getElementById('admin-policy-mode').value;
        const strict = document.getElementById('admin-strict-toggle').value === 'true';

        erp.setWorkstationPolicy({
            active_period_id: 'per-2',
            period_name: 'Period 5: Practical Coding & Excel Lab',
            class_name: 'CS-B 2026',
            teacher_name: 'Prof. Ananya Roy',
            allowed_mode: mode,
            lock_active: true,
            strict_student_assignment: strict
        });

        document.getElementById('client-policy-badge').innerText = mode.replace('_', ' ');
        playAudioChime('SUCCESS');
        showToast(`Policy updated to ${mode}. Strict matching: ${strict}`, 'success');
    });

    // Broadcast Lab Alert
    document.getElementById('btn-broadcast-lab-alert')?.addEventListener('click', () => {
        const msg = prompt('Enter announcement to display on all workstation screens:', '5 Minutes Remaining: Save your Excel workbook and submit to professor.');
        if (msg) {
            playAudioChime('SUCCESS');
            alert(`📢 LAB SCREEN BROADCAST TRANSMITTED:\n\n"${msg}"\n\n(Displayed across all active client terminals)`);
        }
    });
}

