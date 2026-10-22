// shortcuts.js - Enterprise Keyboard Shortcut & Hardware Hotkey Engine

const STORAGE_KEY = 'erp_keyboard_shortcuts';

export const DEFAULT_SHORTCUTS = [
    // --- GLOBAL NAVIGATION & CONTROLS ---
    { id: 'global_search', name: 'Global ERP Search / Command Palette', category: 'Navigation', defaultKey: 'Ctrl+K', currentKey: 'Ctrl+K', description: 'Open omni-search for books, students, computers & events' },
    { id: 'shortcuts_help', name: 'Keyboard Shortcuts Guide', category: 'General', defaultKey: '?', currentKey: '?', description: 'Display interactive keyboard shortcuts cheat sheet' },
    { id: 'toggle_notifications', name: 'Toggle Notification Drawer', category: 'General', defaultKey: 'Alt+N', currentKey: 'Alt+N', description: 'Open or close real-time ERP alerts & approvals' },
    { id: 'toggle_messenger', name: 'Toggle Admin Messenger', category: 'General', defaultKey: 'Alt+M', currentKey: 'Alt+M', description: 'Open executive helpdesk & live admin chat' },
    { id: 'toggle_theme', name: 'Toggle Dark / Light Theme', category: 'General', defaultKey: 'Alt+T', currentKey: 'Alt+T', description: 'Switch UI appearance between day and night mode' },
    { id: 'universal_inspect', name: 'Universal Scanner & Quick Inspector', category: 'Hardware', defaultKey: 'F4', currentKey: 'F4', description: 'Open hardware scanner & instant entity inspector' },

    // --- CIRCULATION & WORKFLOWS ---
    { id: 'quick_issue', name: 'Fast Book Issue Desk', category: 'Circulation', defaultKey: 'F2', currentKey: 'F2', description: 'Navigate directly to issue book counter' },
    { id: 'quick_return', name: 'Fast Book Return Desk', category: 'Circulation', defaultKey: 'F3', currentKey: 'F3', description: 'Navigate directly to book return counter' },
    { id: 'open_kiosk', name: 'Self-Service Student Kiosk', category: 'Circulation', defaultKey: 'Ctrl+Shift+K', currentKey: 'Ctrl+Shift+K', description: 'Launch student self-checkout drop-box terminal' },
    { id: 'focus_search', name: 'Focus Active Search Box', category: 'Navigation', defaultKey: '/', currentKey: '/', description: 'Focus the primary search bar on the current page' },

    // --- QUICK JUMP MODULES ---
    { id: 'nav_dashboard', name: 'Jump: ERP Dashboard', category: 'Modules', defaultKey: 'Alt+1', currentKey: 'Alt+1', description: 'Navigate to Multi-Campus Analytics Overview' },
    { id: 'nav_circulation', name: 'Jump: Circulation Desk', category: 'Modules', defaultKey: 'Alt+2', currentKey: 'Alt+2', description: 'Navigate to Check-Out & Check-In Desk' },
    { id: 'nav_computers', name: 'Jump: Workstation Lab Tracker', category: 'Modules', defaultKey: 'Alt+3', currentKey: 'Alt+3', description: 'Navigate to Computer Lab Monitoring & Timer' },
    { id: 'nav_attendance', name: 'Jump: Class Attendance', category: 'Modules', defaultKey: 'Alt+4', currentKey: 'Alt+4', description: 'Navigate to Period & Lab Attendance Register' },
    { id: 'nav_hallpass', name: 'Jump: Hall Pass & Gate Entrance', category: 'Modules', defaultKey: 'Alt+5', currentKey: 'Alt+5', description: 'Navigate to Hall Pass Scanner & Wander Prevention' },
    { id: 'nav_events', name: 'Jump: Event Halls & Auditorium', category: 'Modules', defaultKey: 'Alt+6', currentKey: 'Alt+6', description: 'Navigate to Auditorium Booking & Ticket Scanner' },
    { id: 'nav_audio', name: 'Jump: Read-Aloud TTS Audio Station', category: 'Modules', defaultKey: 'Alt+7', currentKey: 'Alt+7', description: 'Navigate to Text-to-Speech Accessibility Reader' },
    { id: 'nav_campus', name: 'Jump: Campus Heads & Dean Portal', category: 'Modules', defaultKey: 'Alt+8', currentKey: 'Alt+8', description: 'Navigate to Executive Approval & Request Hub' },
    { id: 'nav_access', name: 'Jump: Access Control RBAC', category: 'Modules', defaultKey: 'Alt+9', currentKey: 'Alt+9', description: 'Navigate to Permissions & Security Governance' },
    { id: 'nav_settings', name: 'Jump: System Settings', category: 'Modules', defaultKey: 'Alt+S', currentKey: 'Alt+S', description: 'Navigate to Configuration & Shortcut Customizer' }
];

export class ShortcutEngine {
    constructor() {
        this.shortcuts = this.loadShortcuts();
        this.recordingCallback = null;
        this.contextHandlers = new Map();
        this.initKeyListener();
    }

    loadShortcuts() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                return DEFAULT_SHORTCUTS.map(def => {
                    const match = parsed.find(p => p.id === def.id);
                    return { ...def, currentKey: match ? match.currentKey : def.defaultKey };
                });
            }
        } catch (e) {
            console.warn('Failed to load shortcuts from storage', e);
        }
        return JSON.parse(JSON.stringify(DEFAULT_SHORTCUTS));
    }

    saveShortcuts() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.shortcuts));
            window.dispatchEvent(new CustomEvent('shortcutsUpdated', { detail: this.shortcuts }));
        } catch (e) {
            console.error('Failed to save shortcuts', e);
        }
    }

    getShortcuts() {
        return this.shortcuts;
    }

    rebind(actionId, newKeyCombo) {
        const normalized = this.normalizeKeyCombo(newKeyCombo);
        
        // Conflict detection (ignore if rebound to same action)
        const conflict = this.shortcuts.find(s => s.id !== actionId && s.currentKey.toLowerCase() === normalized.toLowerCase());
        if (conflict) {
            return { success: false, conflict: conflict.name };
        }

        const target = this.shortcuts.find(s => s.id === actionId);
        if (target) {
            target.currentKey = normalized;
            this.saveShortcuts();
            return { success: true };
        }
        return { success: false, error: 'Action not found' };
    }

    resetDefaults() {
        this.shortcuts = JSON.parse(JSON.stringify(DEFAULT_SHORTCUTS));
        this.saveShortcuts();
    }

    normalizeKeyCombo(str) {
        if (!str) return '';
        const parts = str.split('+').map(p => p.trim());
        const modifiers = [];
        let mainKey = '';

        parts.forEach(part => {
            const lower = part.toLowerCase();
            if (lower === 'ctrl' || lower === 'control') modifiers.push('Ctrl');
            else if (lower === 'alt') modifiers.push('Alt');
            else if (lower === 'shift') modifiers.push('Shift');
            else if (lower === 'meta' || lower === 'cmd' || lower === 'command') modifiers.push('Meta');
            else {
                mainKey = part.length === 1 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1);
            }
        });

        const sortedMods = [];
        if (modifiers.includes('Ctrl')) sortedMods.push('Ctrl');
        if (modifiers.includes('Alt')) sortedMods.push('Alt');
        if (modifiers.includes('Shift')) sortedMods.push('Shift');
        if (modifiers.includes('Meta')) sortedMods.push('Meta');

        if (mainKey) sortedMods.push(mainKey);
        return sortedMods.join('+');
    }

    eventToKeyCombo(e) {
        const parts = [];
        if (e.ctrlKey) parts.push('Ctrl');
        if (e.altKey) parts.push('Alt');
        if (e.shiftKey && e.key !== 'Shift') parts.push('Shift');
        if (e.metaKey) parts.push('Meta');

        let key = e.key;
        if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
            return parts.join('+');
        }

        if (key === ' ') key = 'Space';
        else if (key === 'Escape') key = 'Esc';
        else if (key.length === 1) key = key.toUpperCase();

        parts.push(key);
        return parts.join('+');
    }

    initKeyListener() {
        document.addEventListener('keydown', (e) => {
            // 1. If currently in interactive recording mode (in settings panel)
            if (this.recordingCallback) {
                e.preventDefault();
                e.stopPropagation();
                const combo = this.eventToKeyCombo(e);
                if (combo && !['Ctrl', 'Alt', 'Shift', 'Meta'].includes(combo)) {
                    const cb = this.recordingCallback;
                    this.recordingCallback = null;
                    cb(combo);
                }
                return;
            }

            const targetTag = e.target.tagName;
            const isInputField = targetTag === 'INPUT' || targetTag === 'TEXTAREA' || targetTag === 'SELECT' || e.target.isContentEditable;
            const combo = this.eventToKeyCombo(e);

            // Handle Help Modal (? or F1)
            if (!isInputField && (e.key === '?' || e.key === 'F1')) {
                e.preventDefault();
                this.showHelpModal();
                return;
            }

            // Quick focus on search box if '/' pressed outside inputs
            if (!isInputField && e.key === '/') {
                const searchInput = document.querySelector('input[type="search"], input[type="text"][placeholder*="Search" i], #search-box, #global-search-input');
                if (searchInput) {
                    e.preventDefault();
                    searchInput.focus();
                    searchInput.select();
                    return;
                }
            }

            // If inside input, allow Ctrl+K, F-keys, Alt-shortcuts, Escape, but ignore plain letters
            if (isInputField && !e.ctrlKey && !e.altKey && !e.metaKey && !e.key.startsWith('F') && e.key !== 'Escape') {
                return;
            }

            // Find matching shortcut
            const matched = this.shortcuts.find(s => s.currentKey.toLowerCase() === combo.toLowerCase());
            if (matched) {
                e.preventDefault();
                this.dispatchAction(matched.id);
            }
        });
    }

    dispatchAction(actionId) {
        if (window.app?.playBeep) window.app.playBeep('scan');

        switch (actionId) {
            case 'global_search':
                if (window.toggleCommandPalette) window.toggleCommandPalette();
                break;
            case 'shortcuts_help':
                this.showHelpModal();
                break;
            case 'toggle_notifications':
                if (window.toggleNotifications) window.toggleNotifications();
                break;
            case 'toggle_messenger':
                if (window.toggleMessenger) window.toggleMessenger();
                break;
            case 'toggle_theme':
                document.getElementById('theme-toggle')?.click();
                break;
            case 'universal_inspect':
                if (window.hardware?.openUniversalInspector) {
                    window.hardware.openUniversalInspector();
                } else {
                    window.location.href = 'circulation.html';
                }
                break;
            case 'quick_issue':
                window.location.href = 'circulation.html?action=issue';
                break;
            case 'quick_return':
                window.location.href = 'circulation.html?action=return';
                break;
            case 'open_kiosk':
                window.location.href = 'kiosk.html';
                break;
            case 'focus_search': {
                const searchInput = document.querySelector('input[type="search"], input[type="text"][placeholder*="Search" i], #search-box, #global-search-input');
                if (searchInput) {
                    searchInput.focus();
                    searchInput.select();
                } else if (window.toggleCommandPalette) {
                    window.toggleCommandPalette();
                }
                break;
            }
            case 'nav_dashboard': window.location.href = 'index.html'; break;
            case 'nav_circulation': window.location.href = 'circulation.html'; break;
            case 'nav_computers': window.location.href = 'computers.html'; break;
            case 'nav_attendance': window.location.href = 'attendance.html'; break;
            case 'nav_hallpass': window.location.href = 'hallpass.html'; break;
            case 'nav_events': window.location.href = 'events.html'; break;
            case 'nav_audio': window.location.href = 'audio_station.html'; break;
            case 'nav_campus': window.location.href = 'campus_portal.html'; break;
            case 'nav_access': window.location.href = 'access_control.html'; break;
            case 'nav_settings': window.location.href = 'settings.html'; break;
            default:
                console.log(`Action ${actionId} executed`);
        }
    }

    startRecording(callback) {
        this.recordingCallback = callback;
    }

    cancelRecording() {
        this.recordingCallback = null;
    }

    showHelpModal() {
        let modal = document.getElementById('modal-shortcuts-cheat-sheet');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'modal-shortcuts-cheat-sheet';
            modal.className = 'app-dialog-overlay';
            document.body.appendChild(modal);
        }

        const categories = ['Navigation', 'Circulation', 'Hardware', 'General', 'Modules'];
        
        let groupsHtml = '';
        categories.forEach(cat => {
            const items = this.shortcuts.filter(s => s.category === cat);
            if (items.length === 0) return;

            groupsHtml += `
                <div style="margin-bottom: 1.25rem;">
                    <div style="font-size: 0.75rem; font-weight: 800; color: var(--brand-primary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.35rem;">
                        <span style="width: 8px; height: 8px; border-radius: 50%; background: var(--brand-primary);"></span>
                        ${cat} Shortcuts
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 0.6rem;">
                        ${items.map(s => `
                            <div class="shortcut-item-row" style="display: flex; justify-content: space-between; align-items: center; padding: 0.6rem 0.85rem; background: var(--bg-muted); border-radius: var(--radius-sm); border: 1px solid var(--border-color); cursor: pointer; transition: all var(--transition-fast);" onclick="window.shortcuts.dispatchAction('${s.id}'); document.getElementById('modal-shortcuts-cheat-sheet').classList.remove('active');">
                                <div>
                                    <div style="font-weight: 700; font-size: 0.85rem; color: var(--text-primary);">${s.name}</div>
                                    <div style="font-size: 0.72rem; color: var(--text-secondary);">${s.description}</div>
                                </div>
                                <div style="display: flex; gap: 0.25rem; flex-shrink: 0; margin-left: 0.5rem;">
                                    ${this.renderKbdBadges(s.currentKey)}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        });

        modal.innerHTML = `
            <div class="app-dialog" style="max-width: 780px; width: 95%; max-height: 85vh; display: flex; flex-direction: column; padding: 0; overflow: hidden;">
                <!-- Header -->
                <div style="padding: 1.25rem 1.5rem; background: var(--brand-gradient); color: white; display: flex; justify-content: space-between; align-items: center;">
                    <div style="display: flex; align-items: center; gap: 0.65rem;">
                        <div style="width: 36px; height: 36px; border-radius: 10px; background: rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: center;">
                            <i data-lucide="keyboard" style="width: 20px; height: 20px;"></i>
                        </div>
                        <div>
                            <h3 style="font-size: 1.15rem; font-weight: 800; margin: 0; line-height: 1.2;">Keyboard Shortcuts Cheat Sheet</h3>
                            <div style="font-size: 0.75rem; opacity: 0.9;">Universal productivity hotkeys across all tabs</div>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <a href="settings.html" class="btn btn-ghost btn-sm" style="color: white; border: 1px solid rgba(255,255,255,0.3); font-size: 0.75rem;">
                            <i data-lucide="sliders" style="width: 14px;"></i> Customize Keys
                        </a>
                        <button class="btn btn-ghost btn-icon close-modal-shortcuts" style="color: white; padding: 0.25rem;">
                            <i data-lucide="x" style="width: 20px; height: 20px;"></i>
                        </button>
                    </div>
                </div>

                <!-- Body -->
                <div style="padding: 1.25rem 1.5rem; overflow-y: auto; flex: 1;">
                    ${groupsHtml}
                </div>

                <!-- Footer -->
                <div style="padding: 0.75rem 1.5rem; background: var(--bg-surface); border-top: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; color: var(--text-muted);">
                    <span>Tip: Press <kbd style="background: var(--bg-muted); padding: 0.1rem 0.35rem; border-radius: 4px; border: 1px solid var(--border-color); font-weight: 700;">?</kbd> anywhere to open this sheet</span>
                    <button class="btn btn-primary btn-sm close-modal-shortcuts">Done</button>
                </div>
            </div>
        `;

        modal.classList.add('active');
        if (window.lucide) lucide.createIcons();

        modal.querySelectorAll('.close-modal-shortcuts').forEach(b => {
            b.addEventListener('click', () => modal.classList.remove('active'));
        });
    }

    renderKbdBadges(keyCombo) {
        if (!keyCombo) return '<kbd class="kbd-badge">None</kbd>';
        return keyCombo.split('+').map(k => `<kbd style="background: var(--bg-card); border: 1px solid var(--border-color); box-shadow: 0 2px 0 var(--border-color); color: var(--text-primary); padding: 0.2rem 0.45rem; border-radius: 5px; font-size: 0.72rem; font-weight: 700; font-family: var(--font-mono);">${k}</kbd>`).join('<span style="color: var(--text-muted); font-size: 0.7rem; align-self: center;">+</span>');
    }
}

export const shortcuts = new ShortcutEngine();
window.shortcuts = shortcuts;
