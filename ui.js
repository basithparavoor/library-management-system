import { supabase } from './supabaseClient.js';
import { erp } from './erp_service.js';
import { hardware } from './hardware.js';
import { shortcuts } from './shortcuts.js';

// Global UI state
let cmdOverlay = null;
let cmdInput = null;
let cmdResults = null;
let activePaletteIndex = -1;

// --- AUDIO SYNTHESIS FEEDBACK ---
export function playSynthSound(type = 'success') {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();

        if (type === 'success' || type === 'scan') {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.15);
        } else if (type === 'error') {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(220, ctx.currentTime);
            osc.frequency.linearRampToValueAtTime(150, ctx.currentTime + 0.2);
            gain.gain.setValueAtTime(0.2, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.25);
        }
    } catch (e) {}
}

// --- THEME MANAGEMENT ---
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
    window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme: newTheme } }));
}

function updateThemeIcon(theme) {
    const iconBtn = document.getElementById('theme-toggle');
    if (iconBtn && window.lucide) {
        iconBtn.innerHTML = `<i data-lucide="${theme === 'light' ? 'moon' : 'sun'}" style="width: 16px; height: 16px;"></i>`;
        lucide.createIcons();
    }
}

// --- LIVE CLOCK & ACADEMIC SCHEDULE ---
function getAcademicPeriodStatus() {
    try {
        if (window.erp && typeof erp.getPeriodSessions === 'function') {
            const sessions = erp.getPeriodSessions();
            const todayStr = new Date().toISOString().split('T')[0];
            const activeSessions = sessions.filter(s => s.status === 'ACTIVE' && (!s.date || s.date === todayStr));
            if (activeSessions.length > 0) {
                const current = activeSessions[0];
                return `${current.period_name || 'Active Period'} • ${current.class_name || 'Session'}`;
            }
        }
    } catch (e) {}
    return "No Active Period";
}

function closeAllTopbarPopovers(exceptElement = null) {
    document.querySelectorAll('.topbar-popover').forEach(pop => {
        if (pop !== exceptElement) {
            pop.classList.remove('active');
        }
    });
}

function startLiveClock() {
    const updateTime = () => {
        const timeEl = document.getElementById('topbar-clock-time');
        const clockContainer = document.getElementById('topbar-clock');
        if (timeEl) {
            const now = new Date();
            timeEl.innerText = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        } else if (clockContainer) {
            const now = new Date();
            clockContainer.innerText = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        }
    };
    updateTime();
    setInterval(updateTime, 1000);
}

// --- COMMAND PALETTE LOGIC ---
function ensureCommandPalette() {
    cmdOverlay = document.getElementById('command-overlay');
    if (!cmdOverlay) {
        cmdOverlay = document.createElement('div');
        cmdOverlay.id = 'command-overlay';
        cmdOverlay.style.cssText = 'display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.65); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); z-index: 9999; align-items: flex-start; justify-content: center; padding-top: 10vh;';
        
        cmdOverlay.innerHTML = `
            <div class="card card-glass animate-scale-in" style="width: 100%; max-width: 620px; padding: 0; overflow: hidden; display: flex; flex-direction: column; margin: 0 1rem; box-shadow: var(--shadow-xl); border: 1px solid var(--border-glass);">
                <div style="display: flex; align-items: center; padding: 0.5rem 1.25rem; border-bottom: 1px solid var(--border-color); background: var(--bg-surface);">
                    <i data-lucide="search" style="color: var(--brand-primary); width: 20px; height: 20px; margin-right: 0.75rem;"></i>
                    <input type="text" id="global-search-input" placeholder="Search books, patrons, shelves, modules..." style="width: 100%; padding: 0.85rem 0; border: none; font-size: 1.05rem; background: transparent; outline: none; color: var(--text-primary); box-shadow: none;">
                    <kbd style="background: var(--bg-muted); color: var(--text-muted); padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem; border: 1px solid var(--border-color); font-weight: 600;">ESC</kbd>
                </div>
                
                <div id="command-results" style="max-height: 440px; overflow-y: auto; padding: 0.75rem; display: flex; flex-direction: column; gap: 0.25rem;">
                    <!-- Dynamically populated -->
                </div>
            </div>
        `;
        document.body.appendChild(cmdOverlay);

        cmdOverlay.addEventListener('click', (e) => {
            if (e.target === cmdOverlay) window.toggleCommandPalette();
        });

        if (window.lucide) lucide.createIcons();
    }

    cmdInput = document.getElementById('global-search-input');
    cmdResults = document.getElementById('command-results');
    setupPaletteSearch();
}

window.toggleCommandPalette = function() {
    ensureCommandPalette();
    if (!cmdOverlay) return;

    if (cmdOverlay.style.display === 'none' || !cmdOverlay.style.display) {
        cmdOverlay.style.display = 'flex';
        cmdOverlay.classList.add('animate-fade-in');
        if (cmdInput) {
            cmdInput.value = '';
            setTimeout(() => cmdInput.focus(), 50);
        }
        activePaletteIndex = -1;
        renderDefaultPaletteItems();
    } else {
        cmdOverlay.style.display = 'none';
    }
};

function renderDefaultPaletteItems() {
    if (!cmdResults) return;
    cmdResults.innerHTML = `
        <div style="padding: 0.5rem 1rem; font-size: 0.75rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em;">Institutional Modules & Shortcuts</div>
        <div class="cmd-item" onclick="window.location.href='index.html'"><i data-lucide="layout-dashboard"></i> <div><div style="font-weight: 600;">ERP Dashboard</div><div style="font-size: 0.75rem; color: var(--text-secondary);">Multi-campus institutional overview & live metrics</div></div></div>
        <div class="cmd-item" onclick="window.location.href='circulation.html'"><i data-lucide="repeat"></i> <div><div style="font-weight: 600;">Circulation Desk</div><div style="font-size: 0.75rem; color: var(--text-secondary);">NFC, QR, Barcode check-out & check-in</div></div></div>
        <div class="cmd-item" onclick="window.location.href='nfc_id_cards.html'"><i data-lucide="contact-2"></i> <div><div style="font-weight: 600;">NFC Smart Card & ID Card Studio</div><div style="font-size: 0.75rem; color: var(--text-secondary);">Program NFC tags, barcode sync & 300 DPI vector PDF printing</div></div></div>
        <div class="cmd-item" onclick="window.location.href='books.html'"><i data-lucide="book-open"></i> <div><div style="font-weight: 600;">Book Catalogue & Copies</div><div style="font-size: 0.75rem; color: var(--text-secondary);">Search, add books & print barcode stickers</div></div></div>
        <div class="cmd-item" onclick="window.location.href='students.html'"><i data-lucide="users"></i> <div><div style="font-weight: 600;">Student Members</div><div style="font-size: 0.75rem; color: var(--text-secondary);">Patron directory, borrow limits & NFC sync</div></div></div>
        <div class="cmd-item" onclick="window.location.href='academic_structure.html'"><i data-lucide="network"></i> <div><div style="font-weight: 600;">Academic Structure Management</div><div style="font-size: 0.75rem; color: var(--text-secondary);">Departments, degree programs, class cohorts & audit PDF</div></div></div>
        <div class="cmd-item" onclick="window.location.href='library_storage.html'"><i data-lucide="archive"></i> <div><div style="font-weight: 600;">Library Physical Storage</div><div style="font-size: 0.75rem; color: var(--text-secondary);">Wings, stack rooms, shelves, rack compartments & live matrix</div></div></div>
        <div class="cmd-item" onclick="window.location.href='computers.html'"><i data-lucide="monitor"></i> <div><div style="font-weight: 600;">Computer Lab Workstation Tracker</div><div style="font-size: 0.75rem; color: var(--text-secondary);">Machine codes, user time analytics (day/week/month)</div></div></div>
        <div class="cmd-item" onclick="window.location.href='attendance.html'"><i data-lucide="calendar-check"></i> <div><div style="font-weight: 600;">Class Period & Lab Attendance</div><div style="font-size: 0.75rem; color: var(--text-secondary);">Teacher roll call, smart NFC check-in & report downloads</div></div></div>
        <div class="cmd-item" onclick="window.location.href='events.html'"><i data-lucide="ticket"></i> <div><div style="font-weight: 600;">Event Halls & Auditorium Bookings</div><div style="font-size: 0.75rem; color: var(--text-secondary);">Schedule events, conductor tickets & attendee scanner</div></div></div>
        <div class="cmd-item" onclick="window.location.href='campus_portal.html'"><i data-lucide="shield-check"></i> <div><div style="font-weight: 600;">Campus Heads & Dean Portal</div><div style="font-size: 0.75rem; color: var(--text-secondary);">Facility requests, approvals & executive oversight</div></div></div>
        <div class="cmd-item" onclick="window.location.href='settings.html'"><i data-lucide="settings"></i> <div><div style="font-weight: 600;">Institution Profile & Settings</div><div style="font-size: 0.75rem; color: var(--text-secondary);">Campus logos, branding, loan rules & fine rates</div></div></div>
    `;
    if (window.lucide) lucide.createIcons();
}

document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        e.stopPropagation();
        window.toggleCommandPalette();
    }
    if (e.key === 'Escape') {
        if (cmdOverlay && cmdOverlay.style.display === 'flex') {
            window.toggleCommandPalette();
        }
        const sidebarContainer = document.getElementById('sidebar-container');
        const mobileOverlay = document.getElementById('mobile-sidebar-overlay');
        if (sidebarContainer?.classList.contains('open')) {
            sidebarContainer.classList.remove('open');
            mobileOverlay?.classList.remove('active');
        }
    }
});

let searchTimeout = null;
function setupPaletteSearch() {
    if (!cmdInput) return;
    cmdInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const query = e.target.value.trim();
        if (query.length < 2) {
            renderDefaultPaletteItems();
            return;
        }
        searchTimeout = setTimeout(() => performGlobalSearch(query), 250);
    });
}

async function performGlobalSearch(query) {
    if (!cmdResults) return;
    cmdResults.innerHTML = `<div style="padding: 2rem; text-align: center; color: var(--text-secondary);"><i data-lucide="loader-2" class="animate-spin" style="width: 24px; height: 24px; margin-bottom: 0.5rem;"></i><div>Searching records across all modules...</div></div>`;
    if (window.lucide) lucide.createIcons();

    try {
        const [booksRes, studentsRes] = await Promise.all([
            supabase.from('books').select('id, title, author, isbn').or(`title.ilike.%${query}%,author.ilike.%${query}%,isbn.ilike.%${query}%`).limit(3),
            supabase.from('students').select('id, name, student_id, place').or(`name.ilike.%${query}%,student_id.ilike.%${query}%`).limit(3)
        ]);

        const computers = erp.getComputers('ALL').filter(c => c.machine_code.toLowerCase().includes(query.toLowerCase()) || c.lab_name.toLowerCase().includes(query.toLowerCase())).slice(0, 3);
        const events = erp.getEvents('ALL').filter(e => e.title.toLowerCase().includes(query.toLowerCase()) || e.hall_name?.toLowerCase().includes(query.toLowerCase())).slice(0, 3);

        let html = '';
        if (booksRes.data && booksRes.data.length > 0) {
            html += `<div style="padding: 0.5rem 1rem; font-size: 0.75rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Books</div>`;
            booksRes.data.forEach(book => {
                html += `
                    <div class="cmd-item" onclick="window.location.href='books.html?search=${encodeURIComponent(book.title)}'">
                        <i data-lucide="book"></i>
                        <div style="flex: 1;"><div style="font-weight: 600; color: var(--text-primary);">${book.title}</div><div style="font-size: 0.75rem; color: var(--text-secondary);">${book.author}</div></div>
                        <span class="badge badge-brand" style="font-size: 0.65rem;">Book</span>
                    </div>`;
            });
        }

        if (studentsRes.data && studentsRes.data.length > 0) {
            html += `<div style="padding: 0.5rem 1rem; font-size: 0.75rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Students & Members</div>`;
            studentsRes.data.forEach(student => {
                html += `
                    <div class="cmd-item" onclick="window.location.href='students.html?search=${encodeURIComponent(student.name)}'">
                        <i data-lucide="user"></i>
                        <div style="flex: 1;"><div style="font-weight: 600; color: var(--text-primary);">${student.name}</div><div style="font-size: 0.75rem; color: var(--text-secondary);">ID: ${student.student_id}</div></div>
                        <span class="badge badge-success" style="font-size: 0.65rem;">Member</span>
                    </div>`;
            });
        }

        if (computers.length > 0) {
            html += `<div style="padding: 0.5rem 1rem; font-size: 0.75rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Lab Workstations</div>`;
            computers.forEach(comp => {
                html += `
                    <div class="cmd-item" onclick="window.location.href='computers.html'">
                        <i data-lucide="monitor"></i>
                        <div style="flex: 1;"><div style="font-weight: 600; color: var(--text-primary);">${comp.machine_code} (${comp.lab_name})</div><div style="font-size: 0.75rem; color: var(--text-secondary);">${comp.specs}</div></div>
                        <span class="badge ${comp.status === 'AVAILABLE' ? 'badge-success' : 'badge-warning'}" style="font-size: 0.65rem;">${comp.status}</span>
                    </div>`;
            });
        }

        if (events.length > 0) {
            html += `<div style="padding: 0.5rem 1rem; font-size: 0.75rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Events & Halls</div>`;
            events.forEach(ev => {
                html += `
                    <div class="cmd-item" onclick="window.location.href='events.html'">
                        <i data-lucide="ticket"></i>
                        <div style="flex: 1;"><div style="font-weight: 600; color: var(--text-primary);">${ev.title}</div><div style="font-size: 0.75rem; color: var(--text-secondary);">${ev.hall_name}</div></div>
                        <span class="badge badge-brand" style="font-size: 0.65rem;">Event</span>
                    </div>`;
            });
        }

        if (!html) {
            html = `<div style="padding: 2.5rem 1rem; text-align: center; color: var(--text-secondary);">No records found for "<strong>${query}</strong>"</div>`;
        }

        cmdResults.innerHTML = html;
        if (window.lucide) lucide.createIcons();
    } catch (error) {
        cmdResults.innerHTML = `<div style="padding: 1.5rem; text-align: center; color: var(--danger);">Search error occurred.</div>`;
    }
}

// --- GLOBAL FLOATING TOASTS & DIALOGS ---
let toastContainer = null;
function ensureToastContainer() {
    if (!toastContainer) {
        toastContainer = document.getElementById('toast-container');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toast-container';
            document.body.appendChild(toastContainer);
        }
    }
    return toastContainer;
}

window.app = {
    playBeep: playSynthSound,

    toast: function(message, type = 'info', title = '', duration = 4000) {
        const container = ensureToastContainer();
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        const typeMap = {
            success: { icon: 'check-circle-2', color: 'var(--success)', defaultTitle: 'Success' },
            error: { icon: 'alert-circle', color: 'var(--danger)', defaultTitle: 'Error' },
            warning: { icon: 'alert-triangle', color: 'var(--warning)', defaultTitle: 'Warning' },
            info: { icon: 'info', color: 'var(--brand-primary)', defaultTitle: 'Notice' }
        };

        const config = typeMap[type] || typeMap.info;
        toast.style.setProperty('--toast-color', config.color);
        playSynthSound(type === 'error' ? 'error' : 'success');

        toast.innerHTML = `
            <i data-lucide="${config.icon}" class="toast-icon"></i>
            <div class="toast-content">
                <div class="toast-title">${title || config.defaultTitle}</div>
                <div class="toast-message">${message}</div>
            </div>
            <button class="toast-close"><i data-lucide="x" style="width: 14px; height: 14px;"></i></button>
        `;

        container.appendChild(toast);
        if (window.lucide) lucide.createIcons();

        const dismiss = () => {
            toast.classList.add('toast-hiding');
            setTimeout(() => toast.remove(), 300);
        };

        toast.querySelector('.toast-close')?.addEventListener('click', dismiss);
        if (duration > 0) setTimeout(dismiss, duration);
    },

    alert: function(message, title = 'Notice') {
        window.app.toast(message, 'info', title);
    },

    confirm: function(message, title = 'Confirmation', onConfirm, onCancel) {
        const overlay = document.createElement('div');
        overlay.className = 'app-dialog-overlay';

        overlay.innerHTML = `
            <div class="app-dialog">
                <div class="app-dialog-header">${title}</div>
                <div class="app-dialog-message">${message}</div>
                <div class="app-dialog-actions">
                    <button class="btn btn-outline cancel-btn">Cancel</button>
                    <button class="btn btn-primary confirm-btn">Confirm</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        setTimeout(() => overlay.classList.add('active'), 10);

        const close = () => {
            overlay.classList.remove('active');
            setTimeout(() => overlay.remove(), 300);
        };

        overlay.querySelector('.confirm-btn')?.addEventListener('click', () => { close(); if (onConfirm) onConfirm(); });
        overlay.querySelector('.cancel-btn')?.addEventListener('click', () => { close(); if (onCancel) onCancel(); });
    },

    prompt: function(message, title = 'Input Required', onConfirm) {
        const overlay = document.createElement('div');
        overlay.className = 'app-dialog-overlay';

        overlay.innerHTML = `
            <div class="app-dialog">
                <div class="app-dialog-header">${title}</div>
                <div class="app-dialog-message">${message}</div>
                <input type="text" class="app-dialog-input" style="padding: 0.75rem 1rem; width: 100%; border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-muted); color: var(--text-primary); outline: none; margin-bottom: 1.5rem; font-size: 0.95rem;">
                <div class="app-dialog-actions">
                    <button class="btn btn-outline cancel-btn">Cancel</button>
                    <button class="btn btn-primary confirm-btn">Submit</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        setTimeout(() => overlay.classList.add('active'), 10);

        const input = overlay.querySelector('.app-dialog-input');
        input?.focus();

        const close = () => {
            overlay.classList.remove('active');
            setTimeout(() => overlay.remove(), 300);
        };

        const submit = () => {
            const val = input.value;
            close();
            if (onConfirm) onConfirm(val);
        };

        overlay.querySelector('.confirm-btn')?.addEventListener('click', submit);
        input?.addEventListener('keypress', (e) => { if (e.key === 'Enter') submit(); });
        overlay.querySelector('.cancel-btn')?.addEventListener('click', close);
    }
};

// --- PRINT ID CARD MODAL UTILITY (STUDENT & STAFF) ---
window.printLibraryCard = function(name, idNumber, roleOrClass = 'Member', nfcTag = '', qrPayload = '') {
    let modal = document.getElementById('modal-id-card-print');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-id-card-print';
        modal.className = 'app-dialog-overlay';
        document.body.appendChild(modal);
    }

    const qrData = qrPayload || idNumber;

    modal.innerHTML = `
        <div class="app-dialog" style="max-width: 440px; display: flex; flex-direction: column; align-items: center; text-align: center;">
            <div style="display: flex; justify-content: space-between; width: 100%; align-items: center; margin-bottom: 1rem;">
                <h3 style="margin: 0; font-size: 1.1rem; font-weight: 700;">Institutional Smart Card</h3>
                <button class="btn btn-ghost btn-icon close-id-card"><i data-lucide="x" style="width: 18px; height: 18px;"></i></button>
            </div>

            <!-- Authentic Smart Card -->
            <div id="printable-card-container" style="padding: 10px; background: transparent;">
                <div class="id-card-preview" style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); border-radius: 14px; border: 1px solid rgba(255,255,255,0.2); width: 340px; height: 215px; padding: 16px; display: flex; flex-direction: column; justify-content: space-between; text-align: left; box-shadow: 0 10px 30px rgba(0,0,0,0.4); color: white; position: relative;">
                    <!-- Card Top -->
                    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.15); padding-bottom: 8px;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div style="width: 24px; height: 24px; border-radius: 6px; background: #3b82f6; display: flex; align-items: center; justify-content: center;">
                                <i data-lucide="building-2" style="width: 14px; height: 14px; color: white;"></i>
                            </div>
                            <span style="font-weight: 800; font-size: 0.85rem; letter-spacing: 0.5px;">${erp?.getInstitutionProfile?.()?.name || 'INSTITUTION'}</span>
                        </div>
                        <div style="display: flex; gap: 4px; align-items: center;">
                            <span style="font-size: 0.6rem; font-weight: 700; background: rgba(59,130,246,0.3); color: #93c5fd; padding: 2px 6px; border-radius: 4px;">NFC SMART</span>
                        </div>
                    </div>

                    <!-- Card Body -->
                    <div style="display: flex; gap: 12px; align-items: center; margin: 4px 0;">
                        <div style="width: 54px; height: 54px; border-radius: 50%; background: #3b82f6; display: flex; align-items: center; justify-content: center; font-size: 1.35rem; font-weight: 800; color: white; border: 2px solid rgba(255,255,255,0.4); flex-shrink: 0;">
                            ${name.charAt(0).toUpperCase()}
                        </div>
                        <div style="flex: 1; min-width: 0;">
                            <div style="font-weight: 800; font-size: 0.95rem; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${name}</div>
                            <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 2px;">ID: <span style="font-family: monospace; color: #e2e8f0; font-weight: 700;">${idNumber}</span></div>
                            <div style="font-size: 0.7rem; color: #60a5fa; font-weight: 600;">${roleOrClass}</div>
                        </div>
                        <div style="width: 44px; height: 44px; background: white; padding: 2px; border-radius: 4px; flex-shrink: 0;">
                            <img src="https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(qrData)}" alt="QR" style="width: 100%; height: 100%;">
                        </div>
                    </div>

                    <!-- Card Bottom Barcode -->
                    <div style="background: white; border-radius: 6px; padding: 3px; display: flex; justify-content: center; align-items: center;">
                        <svg id="id-card-barcode-svg" style="width: 100%; height: 32px;"></svg>
                    </div>
                </div>
            </div>

            <div style="display: flex; gap: 0.75rem; width: 100%; margin-top: 1.25rem;">
                <button class="btn btn-outline" style="flex: 1;" onclick="document.getElementById('modal-id-card-print').classList.remove('active')">Close</button>
                <button class="btn btn-primary" style="flex: 1;" onclick="window.print()"><i data-lucide="printer" style="width: 16px;"></i> Print Smartcard</button>
            </div>
        </div>
    `;

    modal.classList.add('active');
    if (window.lucide) lucide.createIcons();

    modal.querySelector('.close-id-card')?.addEventListener('click', () => {
        modal.classList.remove('active');
    });

    if (window.JsBarcode) {
        JsBarcode("#id-card-barcode-svg", idNumber, {
            format: "CODE128",
            width: 1.4,
            height: 28,
            displayValue: false,
            margin: 0
        });
    }
};

// --- APP INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    startLiveClock();
    applyInstitutionBranding();
    
    // Register Service Worker for PWA
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('/sw.js');
            console.log('SW registered:', registration.scope);
        } catch (err) {
            console.warn('SW registration failed:', err);
        }
    }
    
    // Background sync institution branding from remote Supabase
    if (typeof erp?.syncInstitutionProfileFromSupabase === 'function') {
        erp.syncInstitutionProfileFromSupabase().then(() => {
            applyInstitutionBranding();
        }).catch(() => {});
    }

    // 1. Mobile Overlay
    let mobileOverlay = document.getElementById('mobile-sidebar-overlay');
    if (!mobileOverlay) {
        mobileOverlay = document.createElement('div');
        mobileOverlay.id = 'mobile-sidebar-overlay';
        document.body.appendChild(mobileOverlay);
    }

    // 2. Inject Sidebar
    const sidebarContainer = document.getElementById('sidebar-container');
    if (sidebarContainer) {
        try {
            const res = await fetch('sidebar.html');
            if (res.ok) {
                sidebarContainer.innerHTML = await res.text();
                const navEl = sidebarContainer.querySelector('#sidebar-main-nav') || sidebarContainer.querySelector('nav');
                
                // Restore saved scroll position so sidebar doesn't jump back to the top
                const savedScrollPos = sessionStorage.getItem('sidebar_nav_scroll_top');
                if (savedScrollPos !== null) {
                    const pos = parseInt(savedScrollPos, 10);
                    if (navEl) navEl.scrollTop = pos;
                    sidebarContainer.scrollTop = pos;
                }

                const currentPath = window.location.pathname.split('/').pop() || 'index.html';
                sidebarContainer.querySelectorAll('.nav-item').forEach(item => {
                    if (item.getAttribute('href') === currentPath) {
                        item.classList.add('active');
                        // If no saved position, ensure active item is visible in viewport without jumping to top
                        if (savedScrollPos === null) {
                            setTimeout(() => item.scrollIntoView({ block: 'nearest' }), 50);
                        }
                    }

                    // Save scroll position on click
                    item.addEventListener('click', () => {
                        const currentScroll = navEl ? navEl.scrollTop : sidebarContainer.scrollTop;
                        sessionStorage.setItem('sidebar_nav_scroll_top', currentScroll);
                        if (window.innerWidth <= 1024) {
                            sidebarContainer.classList.remove('open');
                            mobileOverlay?.classList.remove('active');
                        }
                    });
                });

                // Continuously track scroll position on nav & container
                if (navEl) {
                    navEl.addEventListener('scroll', () => {
                        sessionStorage.setItem('sidebar_nav_scroll_top', navEl.scrollTop);
                    }, { passive: true });
                }
                sidebarContainer.addEventListener('scroll', () => {
                    sessionStorage.setItem('sidebar_nav_scroll_top', sidebarContainer.scrollTop);
                }, { passive: true });

                // Mobile Sidebar Close Button
                const closeSidebarBtn = document.getElementById('mobile-sidebar-close-btn');
                closeSidebarBtn?.addEventListener('click', () => {
                    sidebarContainer.classList.remove('open');
                    mobileOverlay?.classList.remove('active');
                });

                applyInstitutionBranding();
                if (window.lucide) lucide.createIcons();
            }
        } catch (e) {
            console.warn("Could not load sidebar.html", e);
        }
    }

    // 3. Inject Topbar
    const topbarContainer = document.getElementById('topbar-container');
    if (topbarContainer) {
        try {
            const res = await fetch('topbar.html');
            if (res.ok) {
                topbarContainer.innerHTML = await res.text();
                
                // Campus Switcher Selector
                const campusSelect = document.getElementById('topbar-campus-select');
                if (campusSelect) {
                    const renderCampusOptions = () => {
                        const campuses = erp.getCampuses();
                        let opts = `<option value="ALL">🌐 All Campuses</option>`;
                        if (campuses && campuses.length > 0) {
                            campuses.forEach(c => {
                                opts += `<option value="${c.id}">${c.name} (${c.code || 'CAMPUS'})</option>`;
                            });
                        }
                        campusSelect.innerHTML = opts;
                        const currentActive = erp.getActiveCampusId();
                        if (currentActive && (currentActive === 'ALL' || campuses.some(c => c.id === currentActive))) {
                            campusSelect.value = currentActive;
                        } else {
                            campusSelect.value = "ALL";
                        }
                    };

                    renderCampusOptions();

                    campusSelect.addEventListener('change', (e) => {
                        erp.setActiveCampusId(e.target.value);
                        const selectedText = e.target.options[e.target.selectedIndex]?.text || e.target.value;
                        window.app.toast(`Switched active view to: ${selectedText}`, "info", "Campus Changed", 2500);
                    });

                    window.addEventListener('campusChanged', renderCampusOptions);
                    window.addEventListener('institutionProfileUpdated', renderCampusOptions);
                }

                // Dynamic Academic Period Status
                const periodPill = document.getElementById('topbar-period-pill');
                if (periodPill) {
                    const updatePeriod = () => {
                        periodPill.innerText = getAcademicPeriodStatus();
                    };
                    updatePeriod();
                    setInterval(updatePeriod, 60000);
                }

                // Quick Action Popover Toggle
                const quickActionBtn = document.getElementById('btn-quick-create-menu');
                const quickActionPopover = document.getElementById('popover-quick-actions');
                quickActionBtn?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    closeAllTopbarPopovers(quickActionPopover);
                    quickActionPopover?.classList.toggle('active');
                });

                // Hardware Diagnostic Popover Toggle
                const hardwareStatusBtn = document.getElementById('btn-nfc-tap-topbar');
                const hardwareDiagPopover = document.getElementById('popover-hardware-diag');
                hardwareStatusBtn?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    closeAllTopbarPopovers(hardwareDiagPopover);
                    hardwareDiagPopover?.classList.toggle('active');
                });

                // User Profile Menu Popover Toggle
                const userProfileBtn = document.getElementById('topbar-user-profile-btn');
                const userProfilePopover = document.getElementById('popover-user-profile');
                
                // Populate current logged in admin user info
                const currentUserName = localStorage.getItem('user_name') || 'Administrator';
                const currentUserRole = localStorage.getItem('user_role') || 'SUPER ADMIN';
                const avatarLetter = (currentUserName || 'A').trim().charAt(0).toUpperCase();

                const userNameEl = document.getElementById('topbar-user-name');
                if (userNameEl) userNameEl.innerText = currentUserName;

                const userAvatarEl = document.getElementById('topbar-user-avatar');
                if (userAvatarEl) userAvatarEl.innerText = avatarLetter;

                if (userProfilePopover) {
                    const popoverAvatar = userProfilePopover.querySelector('div > div:first-child');
                    if (popoverAvatar) popoverAvatar.innerText = avatarLetter;
                    const popoverLabels = userProfilePopover.querySelectorAll('div[style*="flex: 1"] div');
                    if (popoverLabels.length >= 2) {
                        popoverLabels[0].innerText = currentUserName;
                        popoverLabels[1].innerText = currentUserRole;
                    }
                }

                userProfileBtn?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    closeAllTopbarPopovers(userProfilePopover);
                    userProfilePopover?.classList.toggle('active');
                });

                // Close popovers on click outside
                document.addEventListener('click', () => {
                    closeAllTopbarPopovers();
                });

                // Fullscreen Toggle
                const fullscreenBtn = document.getElementById('btn-fullscreen-toggle');
                fullscreenBtn?.addEventListener('click', () => {
                    if (!document.fullscreenElement) {
                        document.documentElement.requestFullscreen().catch(() => {});
                        fullscreenBtn.innerHTML = `<i data-lucide="minimize" style="width: 16px; height: 16px;"></i>`;
                    } else {
                        document.exitFullscreen().catch(() => {});
                        fullscreenBtn.innerHTML = `<i data-lucide="maximize" style="width: 16px; height: 16px;"></i>`;
                    }
                    if (window.lucide) lucide.createIcons();
                });

                // Mobile Menu Toggle
                const menuBtn = document.getElementById('mobile-menu-btn');
                menuBtn?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    sidebarContainer?.classList.add('open');
                    mobileOverlay?.classList.add('active');
                });

                mobileOverlay?.addEventListener('click', () => {
                    sidebarContainer?.classList.remove('open');
                    mobileOverlay?.classList.remove('active');
                });

                // Theme Toggle
                document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);

                // Logout
                document.getElementById('logout-btn')?.addEventListener('click', async () => {
                    window.app.confirm("Are you sure you want to sign out?", "Sign Out", async () => {
                        localStorage.removeItem('custom_admin_session');
                        localStorage.removeItem('user_id');
                        localStorage.removeItem('user_name');
                        localStorage.removeItem('user_role');
                        localStorage.removeItem('user_email');
                        try { await supabase.auth.signOut(); } catch (e) {}
                        window.location.href = 'login.html';
                    });
                });
            }
        } catch (e) {
            console.warn("Could not load topbar.html", e);
        }
    }

    // 5. Initialize Mobile Bottom Navigation
    initMobileBottomNav();

    // 6. Command Palette bindings
    cmdOverlay = document.getElementById('command-overlay');
    cmdInput = document.getElementById('global-search-input');
    cmdResults = document.getElementById('command-results');
    
    cmdOverlay?.addEventListener('click', (e) => {
        if (e.target === cmdOverlay) window.toggleCommandPalette();
    });

    setupPaletteSearch();

    // 5. Initialize Notification Center & Messenger Widget
    initNotificationDrawer();
    initMessengerWidget();

    if (window.lucide) lucide.createIcons();
    
    // Initialize mobile enhancements
    initMobileEnhancements();
});

// ==========================================================================
// MOBILE BOTTOM NAVIGATION
// ==========================================================================
let mobileBottomNav = null;
let mobileMorePopover = null;

function initMobileBottomNav() {
    // Only initialize on main ERP pages (not login, student_portal, kiosk)
    const isPublicPage = window.location.pathname.includes('login.html') || 
                         window.location.pathname.includes('student_portal.html') || 
                         window.location.pathname.includes('kiosk.html');
    
    if (isPublicPage) return;
    
    // Create mobile bottom nav if not exists
    if (!document.getElementById('mobile-bottom-nav')) {
        const navHTML = `
            <nav class="mobile-bottom-nav" id="mobile-bottom-nav" role="navigation" aria-label="Primary navigation">
                <ul>
                    <li>
                        <a href="index.html" data-nav="dashboard" class="nav-link">
                            <i data-lucide="layout-dashboard" aria-hidden="true"></i>
                            <span>Dashboard</span>
                        </a>
                    </li>
                    <li>
                        <a href="circulation.html" data-nav="circulation" class="nav-link">
                            <i data-lucide="repeat" aria-hidden="true"></i>
                            <span>Circulation</span>
                        </a>
                    </li>
                    <li>
                        <a href="books.html" data-nav="books" class="nav-link">
                            <i data-lucide="book-open" aria-hidden="true"></i>
                            <span>Catalogue</span>
                        </a>
                    </li>
                    <li>
                        <a href="students.html" data-nav="students" class="nav-link">
                            <i data-lucide="users" aria-hidden="true"></i>
                            <span>Members</span>
                        </a>
                    </li>
                    <li>
                        <a href="#" data-nav="more" class="nav-link" id="mobile-more-btn">
                            <i data-lucide="more-horizontal" aria-hidden="true"></i>
                            <span>More</span>
                        </a>
                    </li>
                </ul>
            </nav>

            <!-- Mobile More Menu Popover -->
            <div class="mobile-more-popover" id="mobile-more-popover" role="menu" aria-label="More navigation options" style="display: none;">
                <div class="mobile-more-popover-arrow" aria-hidden="true"></div>
                <div class="mobile-more-popover-content">
                    <a href="nfc_id_cards.html" class="mobile-more-item" role="menuitem">
                        <i data-lucide="contact-2" aria-hidden="true"></i>
                        <span>NFC & ID Cards</span>
                    </a>
                    <a href="academic_structure.html" class="mobile-more-item" role="menuitem">
                        <i data-lucide="network" aria-hidden="true"></i>
                        <span>Academic Structure</span>
                    </a>
                    <a href="library_storage.html" class="mobile-more-item" role="menuitem">
                        <i data-lucide="archive" aria-hidden="true"></i>
                        <span>Library Storage</span>
                    </a>
                    <a href="computers.html" class="mobile-more-item" role="menuitem">
                        <i data-lucide="monitor" aria-hidden="true"></i>
                        <span>Computer Labs</span>
                    </a>
                    <a href="attendance.html" class="mobile-more-item" role="menuitem">
                        <i data-lucide="calendar-check" aria-hidden="true"></i>
                        <span>Attendance</span>
                    </a>
                    <a href="events.html" class="mobile-more-item" role="menuitem">
                        <i data-lucide="ticket" aria-hidden="true"></i>
                        <span>Events & Halls</span>
                    </a>
                    <a href="inventory.html" class="mobile-more-item" role="menuitem">
                        <i data-lucide="scan-line" aria-hidden="true"></i>
                        <span>Inventory Audit</span>
                    </a>
                    <a href="reports.html" class="mobile-more-item" role="menuitem">
                        <i data-lucide="bar-chart-3" aria-hidden="true"></i>
                        <span>Reports</span>
                    </a>
                    <a href="campus_portal.html" class="mobile-more-item" role="menuitem">
                        <i data-lucide="shield-check" aria-hidden="true"></i>
                        <span>Campus Portal</span>
                    </a>
                    <a href="settings.html" class="mobile-more-item" role="menuitem">
                        <i data-lucide="settings" aria-hidden="true"></i>
                        <span>Settings</span>
                    </a>
                    <a href="access_control.html" class="mobile-more-item" role="menuitem">
                        <i data-lucide="lock" aria-hidden="true"></i>
                        <span>Access Control</span>
                    </a>
                </div>
            </div>
        `;
        
        const navContainer = document.createElement('div');
        navContainer.innerHTML = navHTML.trim();
        document.body.appendChild(navContainer.firstElementChild);
        document.body.appendChild(navContainer.lastElementChild);
    }
    
    mobileBottomNav = document.getElementById('mobile-bottom-nav');
    mobileMorePopover = document.getElementById('mobile-more-popover');
    
    if (!mobileBottomNav || !mobileMorePopover) return;
    
    // Set active state based on current page (handles query params)
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    const basePath = currentPath.split('?')[0]; // Remove query params
    const navMap = {
        'index.html': 'dashboard',
        'circulation.html': 'circulation',
        'books.html': 'books',
        'students.html': 'students',
        'nfc_id_cards.html': 'more',
        'academic_structure.html': 'more',
        'library_storage.html': 'more',
        'computers.html': 'more',
        'attendance.html': 'more',
        'events.html': 'more',
        'inventory.html': 'more',
        'reports.html': 'more',
        'campus_portal.html': 'more',
        'settings.html': 'more',
        'access_control.html': 'more',
        'staff.html': 'more',
        'reading_logs.html': 'more',
        'hallpass.html': 'more',
        'audio_station.html': 'more',
        'barcode_printer.html': 'more',
        'workstation_agent.html': 'more',
        'inspect.html': 'more',
    };
    
    const activeNav = navMap[basePath] || 'dashboard';
    mobileBottomNav.querySelectorAll('.nav-link').forEach(link => {
        link.classList.toggle('active', link.dataset.nav === activeNav);
    });
    
    // More button toggle
    const moreBtn = document.getElementById('mobile-more-btn');
    moreBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        mobileMorePopover.classList.toggle('active');
        moreBtn.classList.toggle('active');
    });
    
    // Close popover on click outside
    document.addEventListener('click', (e) => {
        if (!mobileMorePopover.contains(e.target) && e.target !== moreBtn) {
            mobileMorePopover.classList.remove('active');
            moreBtn?.classList.remove('active');
        }
    });
    
    // Close popover on escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && mobileMorePopover.classList.contains('active')) {
            mobileMorePopover.classList.remove('active');
            moreBtn?.classList.remove('active');
        }
    });
    
    // Handle window resize - reposition popover
    window.addEventListener('resize', () => {
        if (mobileMorePopover.classList.contains('active')) {
            // Popover is positioned via CSS bottom/right, no JS reposition needed
        }
    });
    
    // Re-create icons
    if (window.lucide) lucide.createIcons();
}

// Add skip link for accessibility
function addSkipLink() {
    if (document.getElementById('skip-link')) return;
    
    const skipLink = document.createElement('a');
    skipLink.id = 'skip-link';
    skipLink.className = 'skip-link';
    skipLink.href = '#main-content';
    skipLink.textContent = 'Skip to main content';
    document.body.insertBefore(skipLink, document.body.firstChild);
}

// Initialize mobile card tables
function initMobileCardTables() {
    document.querySelectorAll('.table-responsive').forEach(tableContainer => {
        const table = tableContainer.querySelector('table');
        if (!table) return;
        
        // Check if already initialized
        if (tableContainer.querySelector('.mobile-card-list')) return;
        
        // Enable mobile card view
        tableContainer.setAttribute('data-mobile-cards', 'true');
        
        // Build card list from table rows
        const tbody = table.querySelector('tbody');
        if (!tbody) return;
        
        const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim());
        const cardList = document.createElement('div');
        cardList.className = 'mobile-card-list';
        cardList.setAttribute('role', 'list');
        cardList.setAttribute('aria-label', 'Data records');
        
        tbody.querySelectorAll('tr').forEach(tr => {
            const cells = tr.querySelectorAll('td');
            if (cells.length === 0) return;
            
            const card = document.createElement('div');
            card.className = 'mobile-card-item';
            card.setAttribute('role', 'listitem');
            
            // First cell as title (or first non-checkbox cell)
            let titleIndex = 0;
            if (cells[0].classList.contains('checkbox-cell')) {
                titleIndex = 1;
            }
            
            const title = cells[titleIndex]?.textContent?.trim() || 'Record';
            
            // Build fields
            let fieldsHTML = '';
            cells.forEach((cell, idx) => {
                if (idx === titleIndex) return;
                if (cell.classList.contains('checkbox-cell')) return;
                
                const label = headers[idx] || `Field ${idx + 1}`;
                const value = cell.textContent.trim() || '—';
                
                fieldsHTML += `
                    <div class="mobile-card-field">
                        <span class="mobile-card-field-label">${label}</span>
                        <span class="mobile-card-field-value">${value}</span>
                    </div>
                `;
            });
            
            // Extract action buttons
            const actionButtons = tr.querySelectorAll('button, a[class*="btn"]');
            let actionsHTML = '';
            actionButtons.forEach(btn => {
                const clonedBtn = btn.cloneNode(true);
                clonedBtn.classList.add('btn-sm');
                actionsHTML += clonedBtn.outerHTML;
            });
            
            card.innerHTML = `
                <div class="mobile-card-header">
                    <span class="mobile-card-title">${title}</span>
                </div>
                <div class="mobile-card-fields">${fieldsHTML}</div>
                ${actionsHTML ? `<div class="mobile-card-actions">${actionsHTML}</div>` : ''}
            `;
            
            cardList.appendChild(card);
        });
        
        tableContainer.appendChild(cardList);
    });
}

// MutationObserver to auto-refresh mobile card tables when table content changes
function initMobileTableObserver() {
    if (window.__mobileTableObserver) return;
    
    window.__mobileTableObserver = new MutationObserver((mutations) => {
        let shouldRefresh = false;
        
        for (const mutation of mutations) {
            if (mutation.type === 'childList') {
                // Check if a table tbody was modified
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === 1) { // Element node
                        if (node.tagName === 'TBODY' || node.querySelector?.('tbody')) {
                            shouldRefresh = true;
                            break;
                        }
                        // Also check if innerHTML was replaced on a table-responsive
                        if (node.classList?.contains('table-responsive') || node.closest?.('.table-responsive')) {
                            shouldRefresh = true;
                            break;
                        }
                    }
                }
                // Check removed nodes too
                for (const node of mutation.removedNodes) {
                    if (node.nodeType === 1 && (node.tagName === 'TBODY' || node.classList?.contains('table-responsive'))) {
                        shouldRefresh = true;
                        break;
                    }
                }
            }
        }
        
        if (shouldRefresh) {
            // Debounce
            clearTimeout(window.__mobileTableRefreshTimeout);
            window.__mobileTableRefreshTimeout = setTimeout(() => {
                initMobileCardTables();
            }, 100);
        }
    });
    
    // Observe the main content area
    const mainContent = document.querySelector('.main-content') || document.body;
    window.__mobileTableObserver.observe(mainContent, {
        childList: true,
        subtree: true
    });
}

// Call observer init
function initMobileEnhancements() {
    addSkipLink();
    initMobileTableObserver();
    // initMobileCardTables() - call after data loads
}

window.initMobileEnhancements = initMobileEnhancements;

let notifBackdrop = null;
let notifDrawer = null;
let activeNotifFilter = 'ALL';

function initNotificationDrawer() {
    // 1. Create Drawer Elements
    notifBackdrop = document.createElement('div');
    notifBackdrop.className = 'notification-drawer-backdrop';
    notifBackdrop.id = 'notif-backdrop';

    notifDrawer = document.createElement('div');
    notifDrawer.className = 'notification-drawer';
    notifDrawer.id = 'notif-drawer';

    notifDrawer.innerHTML = `
        <!-- Drawer Header -->
        <div style="padding: 1.25rem 1.5rem; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; background: var(--bg-surface);">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
                <div style="width: 32px; height: 32px; border-radius: 8px; background: rgba(59,130,246,0.1); color: var(--brand-primary); display: flex; align-items: center; justify-content: center;">
                    <i data-lucide="bell" style="width: 16px; height: 16px;"></i>
                </div>
                <div>
                    <h3 style="font-size: 1.05rem; font-weight: 800; margin: 0; color: var(--text-primary);">Notifications</h3>
                    <div style="font-size: 0.72rem; color: var(--text-muted);" id="notif-unread-status">0 unread alerts</div>
                </div>
            </div>
            <div style="display: flex; align-items: center; gap: 0.35rem;">
                <button class="btn btn-ghost btn-icon" id="btn-broadcast-notif" title="Broadcast Announcement (Admin)" style="color: var(--brand-primary); padding: 0.3rem;">
                    <i data-lucide="megaphone" style="width: 16px; height: 16px;"></i>
                </button>
                <button class="btn btn-ghost btn-icon" id="btn-manage-sent-notifs" title="Manage & Delete Sent Alerts (Admin)" style="color: #ef4444; padding: 0.3rem;">
                    <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
                </button>
                <button class="btn btn-ghost btn-icon" id="btn-mark-all-read" title="Mark All Read" style="padding: 0.3rem;">
                    <i data-lucide="check-check" style="width: 16px; height: 16px;"></i>
                </button>
                <button class="btn btn-ghost btn-icon" id="btn-close-notif" style="padding: 0.3rem;">
                    <i data-lucide="x" style="width: 18px; height: 18px;"></i>
                </button>
            </div>
        </div>

        <!-- Filter Tabs -->
        <div style="display: flex; gap: 0.25rem; padding: 0.65rem 1rem; border-bottom: 1px solid var(--border-color); background: var(--bg-muted); overflow-x: auto;">
            <button class="notif-tab btn btn-primary btn-sm" data-filter="ALL" style="padding: 0.25rem 0.65rem; font-size: 0.72rem; border-radius: var(--radius-full); white-space: nowrap;">All</button>
            <button class="notif-tab btn btn-outline btn-sm" data-filter="APP_UPDATE" style="padding: 0.25rem 0.65rem; font-size: 0.72rem; border-radius: var(--radius-full); white-space: nowrap;">📲 App Updates</button>
            <button class="notif-tab btn btn-outline btn-sm" data-filter="APPROVAL" style="padding: 0.25rem 0.65rem; font-size: 0.72rem; border-radius: var(--radius-full); white-space: nowrap;">Approvals</button>
            <button class="notif-tab btn btn-outline btn-sm" data-filter="OVERDUE" style="padding: 0.25rem 0.65rem; font-size: 0.72rem; border-radius: var(--radius-full); white-space: nowrap;">Overdues</button>
            <button class="notif-tab btn btn-outline btn-sm" data-filter="EVENT" style="padding: 0.25rem 0.65rem; font-size: 0.72rem; border-radius: var(--radius-full); white-space: nowrap;">Events</button>
            <button class="notif-tab btn btn-outline btn-sm" data-filter="BROADCAST" style="padding: 0.25rem 0.65rem; font-size: 0.72rem; border-radius: var(--radius-full); white-space: nowrap;">Broadcasts</button>
        </div>

        <!-- Notification Items List -->
        <div id="notif-items-list" style="flex: 1; overflow-y: auto;">
            <!-- Injected dynamically -->
        </div>

        <!-- Drawer Footer -->
        <div style="padding: 0.75rem 1.25rem; border-top: 1px solid var(--border-color); background: var(--bg-surface); display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; color: var(--text-muted);">
            <span>TGI ERP Push Alerts</span>
            <span style="color: var(--color-success); font-weight: 700;">● Active</span>
        </div>
    `;

    document.body.appendChild(notifBackdrop);
    document.body.appendChild(notifDrawer);

    // Event listeners
    document.getElementById('btn-notifications-topbar')?.addEventListener('click', window.toggleNotifications);
    document.getElementById('btn-close-notif')?.addEventListener('click', window.toggleNotifications);
    notifBackdrop.addEventListener('click', window.toggleNotifications);

    document.getElementById('btn-mark-all-read')?.addEventListener('click', () => {
        erp.markAllNotificationsRead();
        renderNotificationItems();
        updateNotificationBadges();
        playSynthSound('success');
    });

    document.getElementById('btn-broadcast-notif')?.addEventListener('click', () => {
        window.openBroadcastNotificationModal();
    });

    document.getElementById('btn-manage-sent-notifs')?.addEventListener('click', () => {
        window.openManageNotificationsModal();
    });

    // Tab Filters
    notifDrawer.querySelectorAll('.notif-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            notifDrawer.querySelectorAll('.notif-tab').forEach(t => {
                t.className = 'notif-tab btn btn-outline btn-sm';
                t.style.padding = '0.25rem 0.65rem';
                t.style.fontSize = '0.72rem';
                t.style.borderRadius = 'var(--radius-full)';
            });
            tab.className = 'notif-tab btn btn-primary btn-sm';
            tab.style.padding = '0.25rem 0.65rem';
            tab.style.fontSize = '0.72rem';
            tab.style.borderRadius = 'var(--radius-full)';
            activeNotifFilter = tab.dataset.filter;
            renderNotificationItems();
        });
    });

    // Global event listener for incoming notifications
    window.addEventListener('notificationReceived', (e) => {
        updateNotificationBadges();
        if (notifDrawer?.classList.contains('active')) renderNotificationItems();
    });

    window.addEventListener('notificationsUpdated', () => {
        updateNotificationBadges();
        if (notifDrawer?.classList.contains('active')) renderNotificationItems();
    });

    // Real-time Supabase push stream listener
    try {
        if (typeof supabase !== 'undefined' && supabase.channel) {
            supabase.channel('public:notifications:realtime')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, async (payload) => {
                    await erp.syncNotificationsFromSupabase();
                    if (payload.eventType === 'INSERT') {
                        const n = payload.new;
                        playSynthSound('success');
                        window.app.toast(n.title || 'New Announcement', 'info', 'Push Notification');
                        if (window.AndroidBridge && typeof window.AndroidBridge.postNativeNotification === 'function') {
                            window.AndroidBridge.postNativeNotification(n.title, n.message, n.type || 'BROADCAST', n.action_link || '');
                        }
                    }
                })
                .subscribe();
        }
    } catch (e) {
        console.warn("Realtime listener error:", e);
    }

    // Background sync notifications from Supabase (fast 6s sync for seamless instant updates)
    if (typeof erp?.syncNotificationsFromSupabase === 'function') {
        erp.syncNotificationsFromSupabase().then(() => {
            updateNotificationBadges();
            if (notifDrawer?.classList.contains('active')) renderNotificationItems();
        }).catch(() => {});

        setInterval(() => {
            erp.syncNotificationsFromSupabase().catch(() => {});
        }, 6000);
    }

    updateNotificationBadges();
}

window.toggleNotifications = function() {
    if (!notifDrawer || !notifBackdrop) return;
    const isActive = notifDrawer.classList.contains('active');

    if (isActive) {
        notifDrawer.classList.remove('active');
        notifBackdrop.classList.remove('active');
    } else {
        renderNotificationItems();
        updateNotificationBadges();
        notifDrawer.classList.add('active');
        notifBackdrop.classList.add('active');
        if (window.lucide) lucide.createIcons();
    }
};

function renderNotificationItems() {
    const listEl = document.getElementById('notif-items-list');
    if (!listEl) return;

    const allNotifs = erp.getNotifications();
    const filtered = allNotifs.filter(n => activeNotifFilter === 'ALL' || n.type === activeNotifFilter);

    if (filtered.length === 0) {
        listEl.innerHTML = `
            <div style="padding: 4rem 1.5rem; text-align: center; color: var(--text-muted);">
                <i data-lucide="bell-off" style="width: 36px; height: 36px; opacity: 0.4; margin-bottom: 0.5rem;"></i>
                <div style="font-weight: 600; color: var(--text-primary);">No notifications in this filter</div>
                <p style="font-size: 0.8rem; margin-top: 0.25rem;">You are completely caught up!</p>
            </div>
        `;
        if (window.lucide) lucide.createIcons();
        return;
    }

    const typeConfig = {
        'APP_UPDATE': { icon: 'smartphone', color: '#9333ea', bg: 'rgba(147,51,234,0.12)' },
        'APPROVAL': { icon: 'shield-check', color: 'var(--brand-primary)', bg: 'rgba(59,130,246,0.1)' },
        'OVERDUE': { icon: 'alert-triangle', color: 'var(--color-danger)', bg: 'rgba(239,68,68,0.1)' },
        'EVENT': { icon: 'ticket', color: 'var(--brand-accent)', bg: 'rgba(139,92,246,0.1)' },
        'LAB_SESSION': { icon: 'monitor', color: 'var(--color-warning)', bg: 'rgba(245,158,11,0.1)' },
        'BROADCAST': { icon: 'megaphone', color: 'var(--color-success)', bg: 'rgba(16,185,129,0.1)' }
    };

    listEl.innerHTML = filtered.map(n => {
        const conf = typeConfig[n.type] || typeConfig.BROADCAST;
        const timeAgo = formatTimeAgo(n.timestamp);
        const isApk = n.type === 'APP_UPDATE' || !!n.download_url;
        const downloadUrl = n.download_url || n.link || '';
        const apkFilename = n.apk_filename || 'tgi-library-release.apk';

        return `
            <div class="notification-item ${n.unread ? 'unread' : ''}" data-id="${n.id}" data-link="${n.link || ''}" style="${isApk ? 'border-left: 3px solid #9333ea; background: rgba(147,51,234,0.03);' : ''}">
                <div style="width: 36px; height: 36px; border-radius: 8px; background: ${conf.bg}; color: ${conf.color}; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                    <i data-lucide="${conf.icon}" style="width: 18px; height: 18px;"></i>
                </div>
                <div style="flex: 1; min-width: 0;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.2rem;">
                        <span style="font-weight: 700; font-size: 0.88rem; color: var(--text-primary); display: flex; align-items: center; gap: 0.35rem;">
                            ${n.title}
                            ${n.apk_version ? `<span class="badge" style="background: rgba(147,51,234,0.15); color: #9333ea; font-size: 0.65rem; padding: 0.05rem 0.4rem;">${n.apk_version}</span>` : ''}
                        </span>
                        <span style="font-size: 0.7rem; color: var(--text-muted);">${timeAgo}</span>
                    </div>
                    <p style="font-size: 0.8rem; color: var(--text-secondary); margin: 0 0 0.4rem 0; line-height: 1.35; white-space: pre-line;">
                        ${n.message}
                    </p>
                    ${isApk && downloadUrl ? `
                        <div style="margin: 0.5rem 0 0.6rem 0; display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap;">
                            <a href="${downloadUrl}" download="${apkFilename}" class="btn btn-primary btn-sm btn-download-apk" style="display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.35rem 0.8rem; font-size: 0.76rem; font-weight: 700; background: linear-gradient(135deg, #9333ea, #4f46e5); color: #fff; text-decoration: none; border-radius: 6px; box-shadow: 0 2px 6px rgba(147,51,234,0.35);">
                                <i data-lucide="download" style="width: 13px; height: 13px;"></i>
                                <span>Download & Update App ${n.apk_version ? `(${n.apk_version})` : ''}</span>
                            </a>
                            ${n.apk_size ? `<span style="font-size: 0.7rem; color: var(--text-muted); font-weight: 600;">📦 ${n.apk_size}</span>` : ''}
                        </div>
                    ` : ''}
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span class="badge" style="background: ${conf.bg}; color: ${conf.color}; font-size: 0.65rem; padding: 0.1rem 0.4rem;">${n.type === 'APP_UPDATE' ? '📲 APP RELEASE' : n.type}</span>
                        <button class="btn-dismiss-notif" data-id="${n.id}" style="background: transparent; border: none; color: var(--text-muted); font-size: 0.72rem; cursor: pointer; padding: 0.2rem;">Dismiss</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Attach click handlers
    listEl.querySelectorAll('.notification-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.classList.contains('btn-dismiss-notif') || e.target.closest('.btn-dismiss-notif')) return;
            if (e.target.classList.contains('btn-download-apk') || e.target.closest('.btn-download-apk')) {
                // Allow direct native APK download without navigating away
                erp.markNotificationRead(item.dataset.id);
                updateNotificationBadges();
                return;
            }
            const notifId = item.dataset.id;
            const link = item.dataset.link;
            erp.markNotificationRead(notifId);
            if (link && link !== 'dashboard' && !link.endsWith('.apk')) {
                window.location.href = link;
            } else {
                renderNotificationItems();
                updateNotificationBadges();
            }
        });
    });

    listEl.querySelectorAll('.btn-dismiss-notif').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            erp.deleteNotification(btn.dataset.id);
            renderNotificationItems();
            updateNotificationBadges();
        });
    });

    if (window.lucide) lucide.createIcons();
}

function updateNotificationBadges() {
    const unreadCount = erp.getUnreadNotificationCount();
    const topbarBadge = document.getElementById('topbar-notif-badge');
    const statusText = document.getElementById('notif-unread-status');

    if (topbarBadge) {
        topbarBadge.innerText = unreadCount > 99 ? '99+' : unreadCount;
        topbarBadge.style.display = unreadCount > 0 ? 'flex' : 'none';
    }
    if (statusText) {
        statusText.innerText = `${unreadCount} unread alert${unreadCount === 1 ? '' : 's'}`;
    }

    // Outside phone launcher icon badge sync
    if (typeof window !== 'undefined' && window.AndroidBridge && typeof window.AndroidBridge.updateBadgeCount === 'function') {
        try {
            window.AndroidBridge.updateBadgeCount(unreadCount);
        } catch (e) {}
    }
}

function formatTimeAgo(dateStr) {
    if (!dateStr) return 'Recently';
    const date = new Date(dateStr);
    const now = new Date();
    const diffSec = Math.floor((now - date) / 1000);

    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function applyInstitutionBranding() {
    const profile = erp.getInstitutionProfile();
    if (!profile) return;

    // 1. Universal Favicon
    if (profile.favicon_url) {
        let iconLink = document.querySelector("link[rel='icon']");
        if (!iconLink) {
            iconLink = document.createElement('link');
            iconLink.rel = 'icon';
            document.head.appendChild(iconLink);
        }
        iconLink.href = profile.favicon_url;

        let shortcutLink = document.querySelector("link[rel='shortcut icon']");
        if (!shortcutLink) {
            shortcutLink = document.createElement('link');
            shortcutLink.rel = 'shortcut icon';
            document.head.appendChild(shortcutLink);
        }
        shortcutLink.href = profile.favicon_url;
    }

    // 2. Document Title
    if (profile.name) {
        if (document.title.includes(' - ')) {
            const parts = document.title.split(' - ');
            const section = parts[0] || 'Library ERP';
            document.title = `${section} - ${profile.name}`;
        } else if (document.title.includes(' | ')) {
            const parts = document.title.split(' | ');
            const section = parts[0] || 'Library ERP';
            document.title = `${section} | ${profile.name}`;
        }
    }

    // 3. Admin Sidebar Branding
    const brandTitle = document.getElementById('sidebar-inst-brand-name') || document.querySelector('.brand h2');
    const brandTagline = document.getElementById('sidebar-inst-brand-tagline') || document.querySelector('.brand p');
    const brandIcon = document.getElementById('sidebar-brand-icon') || document.querySelector('.brand #sidebar-brand-icon');

    if (brandTitle && profile.name) brandTitle.innerText = profile.name;
    if (brandTagline && profile.tagline) brandTagline.innerText = profile.tagline;

    if (brandIcon) {
        if (profile.logo_url) {
            brandIcon.style.background = 'transparent';
            brandIcon.style.boxShadow = 'none';
            brandIcon.style.border = 'none';
            brandIcon.style.padding = '0';
            brandIcon.innerHTML = `<img src="${profile.logo_url}" alt="Logo" style="max-width: 40px; max-height: 40px; width: auto; height: auto; object-fit: contain; background: transparent; display: block;">`;
        } else {
            brandIcon.style.background = 'transparent';
            brandIcon.style.boxShadow = 'none';
            brandIcon.innerHTML = `<i data-lucide="building-2" style="width: 24px; height: 24px; color: var(--brand-primary);"></i>`;
            if (window.lucide) lucide.createIcons();
        }
    }

    // 4. Login Page Branding
    const loginLogo = document.getElementById('login-brand-logo');
    const loginTitle = document.getElementById('login-brand-title');
    const loginTagline = document.getElementById('login-brand-tagline');
    if (loginLogo && profile.logo_url) {
        loginLogo.style.background = 'transparent';
        loginLogo.style.boxShadow = 'none';
        loginLogo.innerHTML = `<img src="${profile.logo_url}" alt="Logo" style="max-width: 44px; max-height: 44px; width: auto; height: auto; object-fit: contain; display: block;">`;
    }
    if (loginTitle && profile.name) loginTitle.innerText = profile.name;
    if (loginTagline && profile.tagline) loginTagline.innerText = profile.tagline;

    // 5. Kiosk Page Branding
    const kioskLogo = document.getElementById('kiosk-brand-logo');
    const kioskTitle = document.getElementById('kiosk-brand-title');
    const kioskTagline = document.getElementById('kiosk-brand-tagline');
    if (kioskLogo && profile.logo_url) {
        kioskLogo.style.background = 'transparent';
        kioskLogo.style.boxShadow = 'none';
        kioskLogo.innerHTML = `<img src="${profile.logo_url}" alt="Logo" style="max-width: 44px; max-height: 44px; width: auto; height: auto; object-fit: contain; display: block;">`;
    }
    if (kioskTitle && profile.name) kioskTitle.innerText = `${profile.name} KIOSK`;
    if (kioskTagline && profile.tagline) kioskTagline.innerText = profile.tagline;

    // 6. Student Portal Branding
    const portalHeader = document.getElementById('portal-brand-header');
    const portalTagline = document.getElementById('portal-brand-tagline');
    const portalLogo = document.getElementById('portal-brand-logo');
    const scInstName = document.getElementById('sc-inst-name');
    if (portalHeader && profile.name) portalHeader.innerText = `${profile.name} PORTAL`;
    if (portalTagline && profile.tagline) portalTagline.innerText = profile.tagline;
    if (scInstName && profile.name) scInstName.innerText = profile.name.toUpperCase();
    if (portalLogo && profile.logo_url) {
        portalLogo.style.background = 'transparent';
        portalLogo.style.boxShadow = 'none';
        portalLogo.innerHTML = `<img src="${profile.logo_url}" alt="Logo" style="max-width: 36px; max-height: 36px; width: auto; height: auto; object-fit: contain; display: block;">`;
    }

    // 7. Lockscreen / Agent Branding
    const lockscreenInstName = document.getElementById('lockscreen-inst-name');
    if (lockscreenInstName && profile.name) {
        lockscreenInstName.innerText = `${profile.name.toUpperCase()} • WORKSTATION AGENT`;
    }

    // 8. Universal Institution Labels
    document.querySelectorAll('.inst-name-display, #inst-name-display, #inst-brand-name').forEach(el => {
        if (profile.name) el.innerText = profile.name;
    });
}

// Apply branding on load and upon storage updates
applyInstitutionBranding();
window.addEventListener('institutionProfileUpdated', applyInstitutionBranding);

window.openBroadcastNotificationModal = function() {
    let modal = document.getElementById('modal-broadcast-notification');
    const campuses = erp.getCampuses();
    const campusOptions = campuses.map(c => `<option value="${c.id}">${c.name} (${c.code || 'CAMPUS'})</option>`).join('');

    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-broadcast-notification';
        modal.className = 'app-dialog-overlay';

        modal.innerHTML = `
            <div class="app-dialog modal-responsive" style="max-width: 540px; width: 94vw; max-height: 88vh; display: flex; flex-direction: column; padding: 0; overflow: hidden; text-align: left; box-shadow: 0 20px 40px rgba(0,0,0,0.25); border-radius: var(--radius-lg);">
                <!-- Header (Sticky) -->
                <div style="padding: 1.15rem 1.5rem; border-bottom: 1px solid var(--border-color); background: var(--bg-surface); display: flex; justify-content: space-between; align-items: center; flex-shrink: 0;">
                    <div style="display: flex; align-items: center; gap: 0.6rem;">
                        <div style="width: 36px; height: 36px; border-radius: 8px; background: rgba(59,130,246,0.12); color: var(--brand-primary); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                            <i data-lucide="megaphone" style="width: 18px; height: 18px;"></i>
                        </div>
                        <div>
                            <h3 style="font-size: 1.1rem; font-weight: 800; margin: 0; color: var(--text-primary);">Create Push Notification</h3>
                            <p style="font-size: 0.72rem; color: var(--text-secondary); margin: 0;">Broadcast live alert across mobile app & web terminals</p>
                        </div>
                    </div>
                    <button class="btn btn-ghost btn-icon btn-close-modal" id="btn-close-broadcast-modal"><i data-lucide="x" style="width: 18px; height: 18px;"></i></button>
                </div>

                <!-- Scrollable Form Body -->
                <form id="form-broadcast-alert" style="display: flex; flex-direction: column; flex: 1; overflow: hidden; margin: 0;">
                    <div style="padding: 1.25rem 1.5rem; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 0.85rem;">
                        <div class="input-group">
                            <label style="font-weight: 600; font-size: 0.8rem; margin-bottom: 0.35rem; display: block;">Alert Title *</label>
                            <input type="text" id="bc-title" placeholder="e.g. Scheduled Lab Maintenance / Book Return Notice" required style="width: 100%; padding: 0.65rem 0.85rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-card); color: var(--text-primary); font-family: inherit; font-size: 0.88rem;">
                        </div>

                        <div class="input-group">
                            <label style="font-weight: 600; font-size: 0.8rem; margin-bottom: 0.35rem; display: block;">Message Content *</label>
                            <textarea id="bc-message" rows="3" placeholder="Enter detailed announcement message..." required style="width: 100%; padding: 0.65rem 0.85rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-card); color: var(--text-primary); font-family: inherit; font-size: 0.88rem; resize: vertical;"></textarea>
                        </div>

                        <div class="modal-form-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.85rem;">
                            <div class="input-group">
                                <label style="font-weight: 600; font-size: 0.8rem; margin-bottom: 0.35rem; display: block;">Category</label>
                                <select id="bc-type" style="padding: 0.6rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-card); color: var(--text-primary); width: 100%; font-family: inherit; font-size: 0.85rem;">
                                    <option value="BROADCAST">📢 General Broadcast</option>
                                    <option value="APP_UPDATE">📲 Mobile App APK Update / Release</option>
                                    <option value="APPROVAL">🛡️ Executive Approval</option>
                                    <option value="OVERDUE">⚠️ Circulation Overdue</option>
                                    <option value="EVENT">🎟️ Event & Symposium</option>
                                    <option value="LAB_SESSION">💻 Lab & Workstation</option>
                                </select>
                            </div>
                            <div class="input-group">
                                <label style="font-weight: 600; font-size: 0.8rem; margin-bottom: 0.35rem; display: block;">Campus</label>
                                <select id="bc-campus" style="padding: 0.6rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-card); color: var(--text-primary); width: 100%; font-family: inherit; font-size: 0.85rem;">
                                    <option value="ALL">🌐 All Campuses</option>
                                    ${campusOptions}
                                </select>
                            </div>
                        </div>

                        <!-- APK Upload & Release Section (Visible when Category is APP_UPDATE) -->
                        <div id="bc-apk-section" style="display: none; background: rgba(147,51,234,0.06); border: 1.5px dashed #9333ea; border-radius: var(--radius-md); padding: 1rem;">
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem;">
                                <div style="display: flex; align-items: center; gap: 0.5rem;">
                                    <i data-lucide="smartphone" style="width: 18px; height: 18px; color: #9333ea;"></i>
                                    <strong style="font-size: 0.88rem; color: var(--text-primary);">Android App Release Setup</strong>
                                </div>
                                <span class="badge" style="background: rgba(147,51,234,0.15); color: #9333ea; font-size: 0.68rem; font-weight: 700;">Direct Install APK</span>
                            </div>

                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 0.75rem;">
                                <div class="input-group">
                                    <label style="font-weight: 600; font-size: 0.76rem; margin-bottom: 0.25rem; display: block;">Version Name *</label>
                                    <input type="text" id="bc-apk-version" placeholder="e.g. v2.1.0" value="v2.1.0" style="padding: 0.55rem 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-card); color: var(--text-primary); width: 100%; font-family: inherit; font-size: 0.85rem;">
                                </div>
                                <div class="input-group">
                                    <label style="font-weight: 600; font-size: 0.76rem; margin-bottom: 0.25rem; display: block;">Build Number</label>
                                    <input type="number" id="bc-apk-build" placeholder="e.g. 21" value="21" style="padding: 0.55rem 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-card); color: var(--text-primary); width: 100%; font-family: inherit; font-size: 0.85rem;">
                                </div>
                            </div>

                            <div class="input-group" style="margin-bottom: 0.75rem;">
                                <label style="font-weight: 600; font-size: 0.76rem; margin-bottom: 0.25rem; display: block;">Select APK File (.apk)</label>
                                <input type="file" id="bc-apk-file" accept=".apk" style="padding: 0.45rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-card); color: var(--text-primary); width: 100%; font-family: inherit; font-size: 0.82rem;">
                                <small style="font-size: 0.72rem; color: var(--text-muted); display: block; margin-top: 0.25rem;">Direct upload to server (/downloads/) for instant 1-click user downloads.</small>
                            </div>

                            <div class="input-group">
                                <label style="font-weight: 600; font-size: 0.76rem; margin-bottom: 0.25rem; display: block;">Or Hosted Download Link (Optional)</label>
                                <input type="url" id="bc-apk-url" placeholder="https://github.com/.../app-release.apk (leave empty if uploading file above)" style="padding: 0.55rem 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-card); color: var(--text-primary); width: 100%; font-family: inherit; font-size: 0.85rem;">
                            </div>
                        </div>

                        <div class="input-group">
                            <label style="font-weight: 600; font-size: 0.8rem; margin-bottom: 0.35rem; display: block;">Target Audience</label>
                            <select id="bc-audience" style="padding: 0.6rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-card); color: var(--text-primary); width: 100%; font-family: inherit; font-size: 0.85rem;">
                                <option value="ALL_MEMBERS">Everyone (Students, Faculty, Staff)</option>
                                <option value="STUDENTS">Students & Enrolled Patrons Only</option>
                                <option value="FACULTY">Faculty & Teaching Staff Only</option>
                                <option value="ADMINS">Librarians & System Administrators Only</option>
                            </select>
                        </div>
                    </div>

                    <!-- Footer (Sticky Bottom) -->
                    <div style="padding: 0.85rem 1.5rem; border-top: 1px solid var(--border-color); background: var(--bg-surface); display: flex; justify-content: flex-end; align-items: center; gap: 0.75rem; flex-shrink: 0;">
                        <button type="button" class="btn btn-outline" id="btn-cancel-broadcast" style="padding: 0.45rem 1.1rem; font-size: 0.85rem;">Cancel</button>
                        <button type="submit" class="btn btn-primary" id="btn-submit-broadcast" style="padding: 0.45rem 1.25rem; font-size: 0.85rem; font-weight: 700; display: inline-flex; align-items: center; gap: 0.4rem;">
                            <i data-lucide="send" style="width: 15px;"></i> Send Push Notification
                        </button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(modal);

        const closeModal = () => {
            modal.classList.remove('active');
            modal.style.display = 'none';
        };

        modal.querySelector('#btn-close-broadcast-modal')?.addEventListener('click', closeModal);
        modal.querySelector('#btn-cancel-broadcast')?.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        // Toggle APK upload section
        const typeSelect = modal.querySelector('#bc-type');
        const apkSection = modal.querySelector('#bc-apk-section');
        const titleInput = modal.querySelector('#bc-title');
        const messageInput = modal.querySelector('#bc-message');

        typeSelect?.addEventListener('change', () => {
            if (typeSelect.value === 'APP_UPDATE') {
                apkSection.style.display = 'block';
                if (!titleInput.value || titleInput.value.startsWith('Scheduled') || titleInput.value.startsWith('General')) {
                    titleInput.value = '📲 Mobile App Update Available!';
                }
                if (!messageInput.value) {
                    messageInput.value = 'A new build of the TGI Library Android app is ready. Download and update now to get the latest features, improved barcode scanner, and speed optimizations.';
                }
            } else {
                apkSection.style.display = 'none';
            }
            if (window.lucide) lucide.createIcons();
        });

        modal.querySelector('#form-broadcast-alert')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const title = document.getElementById('bc-title')?.value.trim();
            const message = document.getElementById('bc-message')?.value.trim();
            const type = document.getElementById('bc-type')?.value || 'BROADCAST';
            const campusId = document.getElementById('bc-campus')?.value || 'ALL';
            const audience = document.getElementById('bc-audience')?.value || 'ALL_MEMBERS';

            if (!title || !message) {
                window.app.toast("Please enter both title and message content", "warning");
                return;
            }

            const submitBtn = modal.querySelector('#btn-submit-broadcast');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerText = 'Dispatching...';
            }

            try {
                let downloadUrl = '';
                let apkVersion = '';
                let apkFilename = '';
                let apkSize = '';

                if (type === 'APP_UPDATE') {
                    apkVersion = document.getElementById('bc-apk-version')?.value.trim() || 'Latest';
                    const fileInput = document.getElementById('bc-apk-file');
                    const externalUrl = document.getElementById('bc-apk-url')?.value.trim();
                    const file = fileInput?.files?.[0];

                    if (file) {
                        if (submitBtn) submitBtn.innerText = `Uploading APK (${(file.size / (1024*1024)).toFixed(1)} MB)...`;
                        const res = await fetch('/api/upload-apk', {
                            method: 'POST',
                            headers: {
                                'x-filename': encodeURIComponent(file.name)
                            },
                            body: file
                        });
                        const uploadData = await res.json();
                        if (!uploadData.success) {
                            throw new Error(uploadData.error || 'Failed to upload APK file to server');
                        }
                        downloadUrl = uploadData.downloadUrl;
                        apkFilename = uploadData.filename;
                        apkSize = uploadData.sizeFormatted || `${(file.size / (1024*1024)).toFixed(1)} MB`;
                    } else if (externalUrl) {
                        downloadUrl = externalUrl;
                        apkFilename = externalUrl.split('/').pop().split('?')[0] || 'app-release.apk';
                    } else {
                        window.app.toast("Please select an APK file to upload or enter a download URL", "warning");
                        if (submitBtn) {
                            submitBtn.disabled = false;
                            submitBtn.innerHTML = `<i data-lucide="send" style="width: 15px;"></i> Send Push Notification`;
                        }
                        return;
                    }
                }

                await erp.createNotification({
                    title,
                    message,
                    type,
                    campus_id: campusId,
                    target_audience: audience,
                    download_url: downloadUrl || null,
                    apk_version: apkVersion || null,
                    apk_filename: apkFilename || null,
                    apk_size: apkSize || null,
                    link: downloadUrl || null,
                    timestamp: new Date().toISOString()
                });

                playSynthSound('success');
                window.app.toast(`Broadcast notification "${title}" dispatched!`, 'success', 'Broadcast Live');
                closeModal();
                document.getElementById('form-broadcast-alert')?.reset();
                if (apkSection) apkSection.style.display = 'none';
                renderNotificationItems();
                updateNotificationBadges();
            } catch (err) {
                console.error("Failed to broadcast notification:", err);
                window.app.toast("Failed to dispatch alert: " + (err.message || 'Unknown error'), "error");
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = `<i data-lucide="send" style="width: 15px;"></i> Send Push Notification`;
                    if (window.lucide) lucide.createIcons();
                }
            }
        });
    } else {
        // Refresh campus options
        const campusSelect = modal.querySelector('#bc-campus');
        if (campusSelect) {
            campusSelect.innerHTML = `<option value="ALL">🌐 All Campuses</option>${campusOptions}`;
        }
    }

    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('active'), 10);
    if (window.lucide) lucide.createIcons();
};

window.openManageNotificationsModal = function() {
    let modal = document.getElementById('modal-manage-notifications');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-manage-notifications';
        modal.className = 'app-dialog-overlay';
        document.body.appendChild(modal);
    }

    const renderManageList = () => {
        const notifs = erp.getNotifications('ALL');
        const count = notifs.length;

        modal.innerHTML = `
            <div class="app-dialog modal-responsive" style="max-width: 680px; width: 95vw; max-height: 85vh; display: flex; flex-direction: column; text-align: left; padding: 1.5rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.85rem;">
                    <div style="display: flex; align-items: center; gap: 0.6rem;">
                        <div style="width: 36px; height: 36px; border-radius: 8px; background: rgba(239,68,68,0.12); color: #ef4444; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                            <i data-lucide="trash-2" style="width: 18px; height: 18px;"></i>
                        </div>
                        <div>
                            <h3 style="font-size: 1.15rem; font-weight: 800; margin: 0; color: var(--text-primary);">Manage Sent Notifications</h3>
                            <p style="font-size: 0.75rem; color: var(--text-secondary); margin: 0;">View, review, and permanently delete broadcast announcements</p>
                        </div>
                    </div>
                    <button class="btn btn-ghost btn-icon" id="btn-close-manage-notifs-modal"><i data-lucide="x" style="width: 18px; height: 18px;"></i></button>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; margin-bottom: 1rem; flex-wrap: wrap;">
                    <div style="font-size: 0.82rem; font-weight: 700; color: var(--text-secondary);">
                        Total Sent Alerts: <span style="color: var(--brand-primary);">${count}</span>
                    </div>
                    <div style="display: flex; gap: 0.5rem;">
                        <button class="btn btn-danger btn-sm" id="btn-clear-all-notifs" ${count === 0 ? 'disabled' : ''} style="font-size: 0.75rem;">
                            <i data-lucide="trash" style="width: 13px; height: 13px;"></i> Delete All Alerts
                        </button>
                    </div>
                </div>

                <!-- Notifications Table / List -->
                <div style="flex: 1; overflow-y: auto; max-height: 48vh; border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-card);">
                    ${count === 0 ? `
                        <div style="padding: 3rem 1rem; text-align: center; color: var(--text-muted);">
                            <i data-lucide="inbox" style="width: 36px; height: 36px; opacity: 0.4; margin-bottom: 0.5rem;"></i>
                            <div style="font-weight: 600;">No notifications found</div>
                            <p style="font-size: 0.78rem;">All sent alerts have been cleared from database.</p>
                        </div>
                    ` : `
                        <div style="display: flex; flex-direction: column; divide-y: 1px solid var(--border-color);">
                            ${notifs.map(n => `
                                <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.85rem 1rem; border-bottom: 1px solid var(--border-color); gap: 0.75rem;">
                                    <div style="flex: 1; min-width: 0;">
                                        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                                            <span class="badge" style="font-size: 0.65rem; padding: 0.15rem 0.45rem; background: rgba(59,130,246,0.12); color: var(--brand-primary);">${n.type || 'ALERT'}</span>
                                            <span style="font-weight: 700; font-size: 0.88rem; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${n.title || 'Untitled'}</span>
                                        </div>
                                        <p style="font-size: 0.78rem; color: var(--text-secondary); margin: 0 0 0.25rem 0; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">
                                            ${n.message || ''}
                                        </p>
                                        <div style="font-size: 0.7rem; color: var(--text-muted); display: flex; gap: 0.85rem;">
                                            <span>📅 ${new Date(n.timestamp || Date.now()).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                            <span>🌐 ${n.campus_id || 'All Campuses'}</span>
                                        </div>
                                    </div>
                                    <button class="btn btn-outline btn-sm btn-delete-single-notif" data-id="${n.id}" title="Permanently Delete" style="color: #ef4444; border-color: rgba(239,68,68,0.3); padding: 0.35rem 0.65rem; flex-shrink: 0;">
                                        <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i> Delete
                                    </button>
                                </div>
                            `).join('')}
                        </div>
                    `}
                </div>

                <div style="margin-top: 1.25rem; display: flex; justify-content: flex-end;">
                    <button type="button" class="btn btn-outline" id="btn-done-manage-notifs">Close</button>
                </div>
            </div>
        `;

        const closeModal = () => {
            modal.classList.remove('active');
            modal.style.display = 'none';
        };

        modal.querySelector('#btn-close-manage-notifs-modal')?.addEventListener('click', closeModal);
        modal.querySelector('#btn-done-manage-notifs')?.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        modal.querySelectorAll('.btn-delete-single-notif').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const notifId = btn.dataset.id;
                btn.disabled = true;
                btn.innerText = 'Deleting...';
                await erp.deleteNotification(notifId);
                window.app.toast("Notification deleted from database", "success", "Alert Removed", 2000);
                renderManageList();
                renderNotificationItems();
                updateNotificationBadges();
            });
        });

        modal.querySelector('#btn-clear-all-notifs')?.addEventListener('click', () => {
            window.app.confirm("Are you sure you want to permanently delete ALL sent notifications from the database?", "Delete All Alerts", async () => {
                const all = erp.getNotifications('ALL');
                for (const n of all) {
                    await erp.deleteNotification(n.id);
                }
                window.app.toast("All notifications have been wiped.", "info", "Database Cleared");
                renderManageList();
                renderNotificationItems();
                updateNotificationBadges();
            });
        });

        if (window.lucide) lucide.createIcons();
    };

    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('active'), 10);
    renderManageList();

    // Background sync from Supabase then re-render
    if (typeof erp?.syncNotificationsFromSupabase === 'function') {
        erp.syncNotificationsFromSupabase().then(() => {
            renderManageList();
        }).catch(() => {});
    }
};

// ==========================================================================
// PREMIUM ADMIN MESSENGER & HELPDESK WIDGET
// ==========================================================================
let messengerWindow = null;
let floatingBtn = null;
let activeChatChannelId = 'ch-admin';

function initMessengerWidget() {
    // 1. Floating Action Launcher Button (Draggable & Sticky Everywhere)
    floatingBtn = document.createElement('button');
    floatingBtn.className = 'floating-messenger-btn';
    floatingBtn.id = 'floating-messenger-btn';
    floatingBtn.title = 'Institutional Admin Messenger (Drag to reposition)';
    floatingBtn.innerHTML = `
        <i data-lucide="message-square" style="width: 24px; height: 24px;"></i>
        <span id="floating-chat-badge" style="position: absolute; top: 2px; right: 2px; width: 12px; height: 12px; border-radius: 50%; background: var(--color-success); border: 2px solid white;"></span>
    `;

    // Restore saved position if present
    try {
        const savedPos = JSON.parse(localStorage.getItem('admin_chat_btn_pos'));
        if (savedPos && typeof savedPos.left === 'number' && typeof savedPos.top === 'number') {
            const maxX = window.innerWidth - 68;
            const maxY = window.innerHeight - 68;
            const clampX = Math.max(12, Math.min(maxX, savedPos.left));
            const clampY = Math.max(12, Math.min(maxY, savedPos.top));
            floatingBtn.style.left = clampX + 'px';
            floatingBtn.style.top = clampY + 'px';
            floatingBtn.style.bottom = 'auto';
            floatingBtn.style.right = 'auto';
        }
    } catch (e) {}

    // Make Floating Button Drag & Drop to anywhere on screen
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let btnInitialLeft = 0;
    let btnInitialTop = 0;
    let hasMoved = false;

    const startDrag = (clientX, clientY) => {
        isDragging = true;
        hasMoved = false;
        dragStartX = clientX;
        dragStartY = clientY;
        const rect = floatingBtn.getBoundingClientRect();
        btnInitialLeft = rect.left;
        btnInitialTop = rect.top;
        floatingBtn.style.transition = 'none';
        floatingBtn.style.cursor = 'grabbing';
    };

    const doDrag = (clientX, clientY) => {
        if (!isDragging) return;
        const dx = clientX - dragStartX;
        const dy = clientY - dragStartY;

        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
            hasMoved = true;
        }

        const maxX = window.innerWidth - 64;
        const maxY = window.innerHeight - 64;
        let newLeft = Math.max(10, Math.min(maxX, btnInitialLeft + dx));
        let newTop = Math.max(10, Math.min(maxY, btnInitialTop + dy));

        floatingBtn.style.left = newLeft + 'px';
        floatingBtn.style.top = newTop + 'px';
        floatingBtn.style.bottom = 'auto';
        floatingBtn.style.right = 'auto';
    };

    const endDrag = () => {
        if (!isDragging) return;
        isDragging = false;
        floatingBtn.style.transition = '';
        floatingBtn.style.cursor = 'pointer';

        if (hasMoved) {
            const rect = floatingBtn.getBoundingClientRect();
            localStorage.setItem('admin_chat_btn_pos', JSON.stringify({
                left: Math.round(rect.left),
                top: Math.round(rect.top)
            }));
        }
    };

    // Mouse Dragging
    floatingBtn.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        startDrag(e.clientX, e.clientY);
        const onMouseMove = (ev) => doDrag(ev.clientX, ev.clientY);
        const onMouseUp = () => {
            endDrag();
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    });

    // Touch Dragging for Mobile / Tablets
    floatingBtn.addEventListener('touchstart', (e) => {
        const touch = e.touches[0];
        startDrag(touch.clientX, touch.clientY);
    }, { passive: true });

    floatingBtn.addEventListener('touchmove', (e) => {
        const touch = e.touches[0];
        doDrag(touch.clientX, touch.clientY);
    }, { passive: true });

    floatingBtn.addEventListener('touchend', endDrag);

    // Click handler (Only trigger toggle if not dragged)
    floatingBtn.addEventListener('click', (e) => {
        if (hasMoved) {
            e.preventDefault();
            e.stopPropagation();
            hasMoved = false;
            return;
        }
        window.toggleMessenger();
    });
    document.getElementById('btn-messenger-topbar')?.addEventListener('click', window.toggleMessenger);
    document.getElementById('btn-close-messenger')?.addEventListener('click', window.toggleMessenger);

    // Send chat listener
    const sendBtn = document.getElementById('btn-send-chat');
    const chatInput = document.getElementById('messenger-input');

    const handleSendMessage = () => {
        const text = chatInput.value.trim();
        if (!text) return;

        // Current user info fallback
        const userName = localStorage.getItem('user_name') || 'Member';
        const userId = localStorage.getItem('user_id') || 'MEM-001';

        erp.sendChatMessage(activeChatChannelId, userId, userName, 'STUDENT', text, true);
        chatInput.value = '';
        playSynthSound('success');
        renderChatMessages();

        // Simulate intelligent Admin / Helpdesk auto-reply after 1.2 seconds
        setTimeout(() => {
            simulateAdminResponse(text);
        }, 1200);
    };

    sendBtn?.addEventListener('click', handleSendMessage);
    chatInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleSendMessage();
    });

    // Quick chips
    messengerWindow.querySelectorAll('.chat-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            chatInput.value = chip.dataset.text;
            handleSendMessage();
        });
    });

    
    document.getElementById('btn-clear-chat')?.addEventListener('click', () => {
        window.app.confirm("Clear conversation history with the admin desk?", "Clear Chat", () => {
            const list = JSON.parse(localStorage.getItem('erp_chat_messages') || '[]');
            const remaining = list.filter(m => m.channel_id !== activeChatChannelId);
            localStorage.setItem('erp_chat_messages', JSON.stringify(remaining));
            playSynthSound('success');
            renderChatMessages();
            window.app.toast("Conversation cleared", "info");
        });
    });

    window.addEventListener('chatMessageSent', () => {
        if (messengerWindow.classList.contains('active')) renderChatMessages();
    });
}

window.toggleMessenger = function() {
    if (!messengerWindow) return;
    const isActive = messengerWindow.classList.contains('active');

    if (isActive) {
        messengerWindow.classList.remove('active');
    } else {
        messengerWindow.classList.add('active');
        renderChatChannels();
        renderChatMessages();
        setTimeout(() => document.getElementById('messenger-input')?.focus(), 100);
        if (window.lucide) lucide.createIcons();
    }
};

function renderChatChannels() {
    const bar = document.getElementById('chat-channels-bar');
    if (!bar) return;

    const channels = erp.getChatChannels();
    bar.innerHTML = channels.map(c => {
        const isSelected = c.id === activeChatChannelId;
        return `
            <button class="btn ${isSelected ? 'btn-primary' : 'btn-outline'} btn-sm chat-channel-btn" data-id="${c.id}" style="padding: 0.25rem 0.65rem; font-size: 0.72rem; white-space: nowrap; border-radius: var(--radius-full);">
                ${c.name.split(' ')[0]}
            </button>
        `;
    }).join('');

    bar.querySelectorAll('.chat-channel-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            activeChatChannelId = btn.dataset.id;
            const ch = channels.find(c => c.id === activeChatChannelId);
            if (ch) {
                document.getElementById('chat-header-name').innerText = ch.name;
            }
            renderChatChannels();
            renderChatMessages();
        });
    });
}

function renderChatMessages() {
    const body = document.getElementById('chat-messages-body');
    if (!body) return;

    const messages = erp.getChatMessages(activeChatChannelId);

    if (messages.length === 0) {
        body.innerHTML = `
            <div style="padding: 3rem 1rem; text-align: center; color: var(--text-muted); font-size: 0.82rem;">
                <i data-lucide="message-square" style="width: 28px; height: 28px; opacity: 0.4; margin-bottom: 0.35rem;"></i>
                <div>Send a message to begin instant dialogue with the administrative desk.</div>
            </div>
        `;
        if (window.lucide) lucide.createIcons();
        return;
    }

    body.innerHTML = messages.map(m => {
        const timeStr = new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        if (m.is_outgoing) {
            return `
                <div style="display: flex; flex-direction: column; align-items: flex-end;">
                    <div class="chat-bubble-outgoing">${m.text}</div>
                    <div style="font-size: 0.65rem; color: var(--text-muted); margin-top: 0.15rem; display: flex; align-items: center; gap: 0.2rem;">
                        ${timeStr} <span>✓✓</span>
                    </div>
                </div>
            `;
        } else {
            return `
                <div style="display: flex; flex-direction: column; align-items: flex-start;">
                    <div style="font-size: 0.7rem; font-weight: 700; color: var(--brand-primary); margin-bottom: 0.15rem;">
                        ${m.sender_name} (${m.sender_role})
                    </div>
                    <div class="chat-bubble-incoming">${m.text}</div>
                    <div style="font-size: 0.65rem; color: var(--text-muted); margin-top: 0.15rem;">
                        ${timeStr}
                    </div>
                </div>
            `;
        }
    }).join('');

    body.scrollTop = body.scrollHeight;
}

function simulateAdminResponse(userPrompt) {
    const q = userPrompt.toLowerCase();
    let reply = "Your message has been acknowledged by the Executive Desk. We are processing your request.";

    if (q.includes('lab') || q.includes('extend') || q.includes('terminal')) {
        reply = "Session extended by 45 minutes on your current terminal. Please remember to scan your NFC smartcard upon check-out.";
    } else if (q.includes('book') || q.includes('renew')) {
        reply = "Your book loan has been renewed for an additional 14 days. No overdue penalty applied.";
    } else if (q.includes('card') || q.includes('nfc') || q.includes('lost')) {
        reply = "A replacement NFC Smartcard request has been logged. Please collect your new printed ID from the Chief Librarian counter.";
    } else if (q.includes('hall') || q.includes('event') || q.includes('symposium')) {
        reply = "Auditorium booking schedule reviewed. Your request is queued for Dean authorization in the Campus Portal.";
    }

    erp.sendChatMessage(activeChatChannelId, 'ADM-001', 'Helpdesk Administrator', 'ADMIN', reply, false);
    playSynthSound('success');
    renderChatMessages();
}

// Explicit named exports for ES module interoperability
export function showToast(message, type = 'info', title = '', duration = 4000) {
    window.app.toast(message, type, title, duration);
}

export function playAudioChime(type = 'success') {
    playSynthSound(type.toLowerCase());
}

export function printIdCard(opts = {}) {
    window.printLibraryCard(opts.name || 'Member', opts.id || 'ID-001', opts.role || 'Patron', opts.nfc || '', opts.barcode || opts.id);
}

/**
 * Universal Floating Bulk Actions Controller for Data Tables
 */
window.initUniversalBulkBar = function() {
    let bar = document.getElementById('global-bulk-actions-bar');
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'global-bulk-actions-bar';
        bar.className = 'bulk-actions-bar';
        document.body.appendChild(bar);
    }

    const update = (selectedCount, handlers = {}) => {
        if (!selectedCount || selectedCount <= 0) {
            bar.classList.remove('active');
            return;
        }

        const canExport = typeof handlers.onExport === 'function';
        const canDuplicate = typeof handlers.onDuplicate === 'function';
        const canMove = typeof handlers.onMove === 'function';
        const canDelete = typeof handlers.onDelete === 'function';

        bar.innerHTML = `
            <div class="bulk-count-badge">
                <i data-lucide="check-square" style="width: 14px; height: 14px;"></i>
                <span id="bulk-bar-count-text">${selectedCount} Selected</span>
            </div>

            ${canDuplicate ? `
                <button type="button" class="bulk-btn bulk-btn-primary" id="btn-bulk-bar-duplicate">
                    <i data-lucide="copy" style="width: 14px; height: 14px;"></i>
                    <span>Duplicate (${selectedCount})</span>
                </button>
            ` : ''}

            ${canMove ? `
                <button type="button" class="bulk-btn" id="btn-bulk-bar-move" style="background: rgba(139,92,246,0.15); color: var(--brand-accent); border: 1px solid rgba(139,92,246,0.3);">
                    <i data-lucide="arrow-right-left" style="width: 14px; height: 14px;"></i>
                    <span>Move / Copy (${selectedCount})</span>
                </button>
            ` : ''}

            ${canExport ? `
                <button type="button" class="bulk-btn" id="btn-bulk-bar-export">
                    <i data-lucide="download" style="width: 14px; height: 14px;"></i>
                    <span>Export</span>
                </button>
            ` : ''}

            ${canDelete ? `
                <button type="button" class="bulk-btn bulk-btn-danger" id="btn-bulk-bar-delete">
                    <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                    <span>Delete (${selectedCount})</span>
                </button>
            ` : ''}

            <button type="button" class="bulk-btn" id="btn-bulk-bar-clear" title="Deselect All" style="padding: 0.4rem 0.6rem;">
                <i data-lucide="x" style="width: 14px; height: 14px;"></i>
            </button>
        `;

        bar.classList.add('active');
        if (window.lucide) lucide.createIcons();

        document.getElementById('btn-bulk-bar-duplicate')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (handlers.onDuplicate) handlers.onDuplicate();
        });

        document.getElementById('btn-bulk-bar-move')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (handlers.onMove) handlers.onMove();
        });

        document.getElementById('btn-bulk-bar-export')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (handlers.onExport) handlers.onExport();
        });

        document.getElementById('btn-bulk-bar-delete')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (handlers.onDelete) handlers.onDelete();
        });

        document.getElementById('btn-bulk-bar-clear')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (handlers.onClear) handlers.onClear();
            bar.classList.remove('active');
        });
    };

    const hide = () => {
        bar.classList.remove('active');
    };

    return { bar, update, hide };
};

export const initUniversalBulkBar = window.initUniversalBulkBar;
