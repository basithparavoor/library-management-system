// hardware.js - Multi-Modal Hardware Engine (NFC, QR, Barcode, Biometrics & Universal Auto-Detection)

import { supabase } from './supabaseClient.js';
import { erp } from './erp_service.js';

export class HardwareEngine {
    constructor() {
        this.nfcReader = null;
        this.isNfcScanning = false;
        this.barcodeBuffer = '';
        this.lastKeyTime = 0;
        this.barcodeListeners = [];
        this.nfcListeners = [];
        this.customAutoHandlers = new Map();

        this.initBarcodeWedgeListener();
        this.initGlobalScanHandler();
    }

    // --- 1. WEB NFC INTEGRATION (ISO/IEC 14443 & NTAG) ---
    async isNfcSupported() {
        return 'NDEFReader' in window;
    }

    async startNfcScan(onTagRead, onError) {
        if (!('NDEFReader' in window)) {
            const msg = "Web NFC is supported on Android Chrome or NFC-enabled hardware terminals. For desktop, use USB NFC reader, Barcode scanner, or Camera QR.";
            if (onError) onError(new Error(msg));
            return false;
        }

        try {
            this.nfcReader = new window.NDEFReader();
            await this.nfcReader.scan();
            this.isNfcScanning = true;

            this.nfcReader.addEventListener("reading", ({ serialNumber, message }) => {
                let tagPayload = serialNumber || '';
                
                // Read text/URI records if present
                for (const record of message.records) {
                    if (record.recordType === "text") {
                        const textDecoder = new TextDecoder(record.encoding);
                        tagPayload = textDecoder.decode(record.data);
                    }
                }

                if (window.app?.playBeep) window.app.playBeep('scan');
                if (window.app?.toast) window.app.toast(`NFC Smartcard detected: ${tagPayload}`, "info", "NFC Read", 2500);

                if (onTagRead) onTagRead(tagPayload, serialNumber);
                this.nfcListeners.forEach(listener => listener(tagPayload, serialNumber));

                // Process through Universal Auto-Detection
                this.handleAutoDetectedScan(tagPayload, 'NFC', serialNumber);
            });

            this.nfcReader.addEventListener("readingerror", () => {
                if (window.app?.playBeep) window.app.playBeep('error');
                if (onError) onError(new Error("Cannot read NFC tag. Tag might be corrupted or unformatted."));
            });

            return true;
        } catch (error) {
            this.isNfcScanning = false;
            if (onError) onError(error);
            return false;
        }
    }

    async writeNfcTag(textPayload) {
        if (!('NDEFReader' in window)) {
            throw new Error("Web NFC writing not supported on this device.");
        }
        const writer = new window.NDEFReader();
        await writer.write({
            records: [{ recordType: "text", data: textPayload }]
        });
        if (window.app?.playBeep) window.app.playBeep('success');
        return true;
    }

    // --- 2. BARCODE & KEYBOARD WEDGE SCANNER LISTENER ---
    initBarcodeWedgeListener() {
        document.addEventListener('keydown', (e) => {
            const currentTime = Date.now();
            const timeDiff = currentTime - this.lastKeyTime;

            // Hardware scanners send characters rapidly (< 80ms gap)
            if (timeDiff > 90) {
                this.barcodeBuffer = '';
            }
            this.lastKeyTime = currentTime;

            if (e.key === 'Enter') {
                if (this.barcodeBuffer.length >= 3) {
                    const scannedCode = this.barcodeBuffer.trim();
                    this.barcodeBuffer = '';
                    
                    if (window.app?.playBeep) window.app.playBeep('scan');
                    
                    // Trigger registered listeners
                    this.barcodeListeners.forEach(cb => cb(scannedCode));
                    
                    // Trigger Universal Auto-Detector
                    this.handleAutoDetectedScan(scannedCode, 'BARCODE');
                }
            } else if (e.key.length === 1) {
                this.barcodeBuffer += e.key;
            }
        });
    }

    onBarcodeScan(callback) {
        this.barcodeListeners.push(callback);
    }

    onNfcScan(callback) {
        this.nfcListeners.push(callback);
    }

    registerAutoHandler(type, callback) {
        this.customAutoHandlers.set(type, callback);
    }

    // --- 3. ENTITY TYPE CLASSIFIER ---
    classifyCode(code) {
        if (!code) return { type: 'UNKNOWN', id: '' };
        const clean = code.trim();
        const upper = clean.toUpperCase();

        if (upper.startsWith('BK-') || upper.startsWith('LIB-') || upper.startsWith('ATH-B-') || upper.startsWith('B-') || upper.startsWith('ISBN-') || (/^\d{10,13}$/.test(clean))) {
            return { type: 'BOOK', id: clean, prefix: 'BK' };
        }
        if (upper.startsWith('REG-') || upper.startsWith('STU-') || upper.startsWith('PAT-')) {
            return { type: 'STUDENT', id: clean, prefix: 'REG' };
        }
        if (upper.startsWith('FAC-') || upper.startsWith('ADM-') || upper.startsWith('STF-')) {
            return { type: 'STAFF', id: clean, prefix: 'FAC' };
        }
        if (upper.startsWith('PASS-') || upper.startsWith('HP-')) {
            return { type: 'HALLPASS', id: clean, prefix: 'PASS' };
        }
        if (upper.startsWith('TKT-') || upper.startsWith('EVT-') || upper.startsWith('AUD-')) {
            return { type: 'TICKET', id: clean, prefix: 'TKT' };
        }
        if (upper.startsWith('DL-PC-') || upper.startsWith('HPC-') || upper.startsWith('PC-') || upper.startsWith('LAB-')) {
            return { type: 'WORKSTATION', id: clean, prefix: 'PC' };
        }

        // Check if matching hex NFC UID format (e.g. 04:A2:3B...)
        if (/^([0-9A-Fa-f]{2}[:-]){3,7}[0-9A-Fa-f]{2}$/.test(clean) || /^[0-9A-Fa-f]{8,14}$/.test(clean)) {
            return { type: 'NFC_SMARTCARD', id: clean, prefix: 'NFC' };
        }

        return { type: 'GENERIC', id: clean, prefix: '' };
    }

    // --- 4. UNIVERSAL AUTO-DETECTING SCAN DISPATCHER ---
    async handleAutoDetectedScan(rawCode, source = 'BARCODE', extraMeta = null) {
        const entity = this.classifyCode(rawCode);
        const currentPath = window.location.pathname.split('/').pop() || 'index.html';

        console.log(`[Hardware Auto-Detect] Scanned: ${rawCode} | Identified as: ${entity.type} | Origin: ${source}`);

        // 1. Dispatch custom event for pages that want to listen
        window.dispatchEvent(new CustomEvent('hardwareScanned', {
            detail: { raw: rawCode, type: entity.type, id: entity.id, source, extraMeta }
        }));

        // 2. If a custom handler is registered on current page, invoke it
        if (this.customAutoHandlers.has(entity.type)) {
            const consumed = this.customAutoHandlers.get(entity.type)(entity.id, entity);
            if (consumed) return;
        }

        // 3. Contextual auto-fill based on active tab / page
        const handledLocally = this.routeToPageFields(currentPath, entity);
        if (handledLocally) return;

        // 4. If not consumed locally, open Universal Smart Inspector Modal
        await this.showUniversalInspectorModal(entity, source);
    }

    routeToPageFields(page, entity) {
        // Circulation Desk
        if (page === 'circulation.html') {
            if (entity.type === 'BOOK') {
                const bookInput = document.getElementById('issue-book-barcode') || document.getElementById('return-book-barcode') || document.getElementById('return-barcode') || document.getElementById('circulation-book-input');
                if (bookInput) {
                    bookInput.value = entity.id;
                    bookInput.dispatchEvent(new Event('input', { bubbles: true }));
                    bookInput.dispatchEvent(new Event('change', { bubbles: true }));
                    window.app?.toast(`Book barcode ${entity.id} populated.`, 'info', 'Auto-Detected');
                    return true;
                }
            } else if (entity.type === 'STUDENT' || entity.type === 'STAFF') {
                const studentInput = document.getElementById('issue-student-id') || document.getElementById('circulation-member-input');
                if (studentInput) {
                    studentInput.value = entity.id;
                    studentInput.dispatchEvent(new Event('input', { bubbles: true }));
                    studentInput.dispatchEvent(new Event('change', { bubbles: true }));
                    window.app?.toast(`Member ID ${entity.id} populated.`, 'info', 'Auto-Detected');
                    return true;
                }
            }
        }

        // Attendance Register
        if (page === 'attendance.html') {
            if (entity.type === 'STUDENT' || entity.type === 'NFC_SMARTCARD') {
                const scanInput = document.getElementById('attendance-scan-input') || document.getElementById('student-search-input');
                if (scanInput) {
                    scanInput.value = entity.id;
                    scanInput.dispatchEvent(new Event('input', { bubbles: true }));
                    const markBtn = document.getElementById('btn-smart-mark');
                    if (markBtn) markBtn.click();
                    return true;
                }
            }
        }

        // Hallpass Gate Scanner
        if (page === 'hallpass.html') {
            const passInput = document.getElementById('input-pass-id') || document.getElementById('hallpass-barcode');
            if (passInput) {
                passInput.value = entity.id;
                passInput.dispatchEvent(new Event('input', { bubbles: true }));
                const verifyBtn = document.getElementById('btn-verify-arrival');
                if (verifyBtn) verifyBtn.click();
                return true;
            }
        }

        // Event Hall Tickets
        if (page === 'events.html') {
            const ticketInput = document.getElementById('input-ticket-barcode') || document.getElementById('ticket-search');
            if (ticketInput) {
                ticketInput.value = entity.id;
                ticketInput.dispatchEvent(new Event('input', { bubbles: true }));
                const checkInBtn = document.getElementById('btn-admit-ticket');
                if (checkInBtn) checkInBtn.click();
                return true;
            }
        }

        // Workstation Locker
        if (page === 'workstation_agent.html' || page === 'computers.html') {
            if (entity.type === 'STUDENT') {
                const userInput = document.getElementById('login-student-id') || document.getElementById('workstation-student-input');
                if (userInput) {
                    userInput.value = entity.id;
                    userInput.dispatchEvent(new Event('input', { bubbles: true }));
                    return true;
                }
            }
        }

        // Books Search Tab
        if (page === 'books.html' && entity.type === 'BOOK') {
            const searchInput = document.getElementById('book-search') || document.getElementById('search-input');
            if (searchInput) {
                searchInput.value = entity.id;
                searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                return true;
            }
        }

        // Students Search Tab
        if (page === 'students.html' && (entity.type === 'STUDENT' || entity.type === 'STAFF')) {
            const searchInput = document.getElementById('student-search') || document.getElementById('search-input');
            if (searchInput) {
                searchInput.value = entity.id;
                searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                return true;
            }
        }

        // Kiosk Tab
        if (page === 'kiosk.html') {
            const kioskInput = document.getElementById('kiosk-scanner-input') || document.getElementById('kiosk-id-input');
            if (kioskInput) {
                kioskInput.value = entity.id;
                kioskInput.dispatchEvent(new Event('input', { bubbles: true }));
                const submitBtn = document.getElementById('btn-kiosk-submit');
                if (submitBtn) submitBtn.click();
                return true;
            }
        }

        return false;
    }

    // --- 5. UNIVERSAL SMART QUICK INSPECTOR MODAL ---
    async showUniversalInspectorModal(entity, source = 'BARCODE') {
        let modal = document.getElementById('modal-universal-scan-inspector');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'modal-universal-scan-inspector';
            modal.className = 'app-dialog-overlay';
            document.body.appendChild(modal);
        }

        // Initial loading template
        modal.innerHTML = `
            <div class="app-dialog" style="max-width: 520px; width: 95%; padding: 1.5rem; text-align: left;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.75rem;">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <span class="badge badge-brand" style="font-size: 0.7rem;">HARDWARE AUTO-DETECT</span>
                        <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600;">${source}</span>
                    </div>
                    <button class="btn btn-ghost btn-icon close-inspector" style="padding: 0.2rem;"><i data-lucide="x" style="width: 18px; height: 18px;"></i></button>
                </div>
                <div id="inspector-content" style="padding: 1.5rem 0; text-align: center;">
                    <i data-lucide="loader-2" class="animate-spin" style="width: 32px; height: 32px; color: var(--brand-primary); margin-bottom: 0.75rem;"></i>
                    <div style="font-weight: 700; color: var(--text-primary);">Resolving ${entity.type} record...</div>
                    <div style="font-family: var(--font-mono); font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.25rem;">${entity.id}</div>
                </div>
            </div>
        `;

        modal.classList.add('active');
        if (window.lucide) lucide.createIcons();

        modal.querySelector('.close-inspector')?.addEventListener('click', () => {
            modal.classList.remove('active');
        });

        const contentEl = document.getElementById('inspector-content');

        try {
            // Resolve data by entity type
            let recordData = null;
            let title = entity.id;
            let subtitle = 'Institutional Record';
            let badgeHtml = `<span class="badge badge-brand">${entity.type}</span>`;
            let detailsHtml = '';
            let actionButtonsHtml = '';

            if (entity.type === 'BOOK') {
                const { data: copyData } = await supabase
                    .from('book_copies')
                    .select(`
                        id, barcode, status,
                        books(id, title, author, isbn, price, edition, categories(name), publishers(name)),
                        shelves(name),
                        racks(name)
                    `)
                    .eq('barcode', entity.id)
                    .maybeSingle();

                let foundBook = null;
                let foundCopy = null;

                if (copyData && copyData.books) {
                    foundCopy = copyData;
                    foundBook = copyData.books;
                } else {
                    const isUuid = /^[0-9a-fA-F-]{36}$/.test(entity.id);
                    const { data: bData } = await supabase
                        .from('books')
                        .select(`
                            id, title, author, isbn, price, edition,
                            categories(name),
                            publishers(name)
                        `)
                        .or(`isbn.eq.${entity.id}${isUuid ? `,id.eq.${entity.id}` : ''}`)
                        .maybeSingle();

                    if (bData) {
                        foundBook = bData;
                    }
                }

                if (!foundBook && !foundCopy) {
                    const localBooks = JSON.parse(localStorage.getItem('erp_books') || '[]');
                    const found = localBooks.find(b => b.barcode === entity.id || b.isbn === entity.id);
                    if (found) {
                        foundBook = found;
                    }
                }

                if (!foundBook && !foundCopy) {
                    // BOOK IS NOT IN CATALOG - Reject dummy fallback
                    if (window.app?.playBeep) window.app.playBeep('error');
                    title = `Unregistered Book Barcode`;
                    subtitle = `Barcode: ${entity.id}`;
                    badgeHtml = `<span class="badge badge-danger"><span class="badge-dot"></span> Not in Catalog</span>`;
                    detailsHtml = `
                        <div style="background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.25); border-radius: var(--radius-sm); padding: 1.15rem; margin-top: 1rem; text-align: left;">
                            <div style="display: flex; align-items: center; gap: 0.5rem; color: var(--danger, #ef4444); font-weight: 700; margin-bottom: 0.4rem; font-size: 0.9rem;">
                                <i data-lucide="alert-circle" style="width: 18px; height: 18px;"></i>
                                <span>No Matching Book in Catalog</span>
                            </div>
                            <p style="font-size: 0.82rem; color: var(--text-secondary); margin: 0; line-height: 1.5;">
                                The scanned barcode <strong style="color: var(--text-primary); font-family: var(--font-mono);">${entity.id}</strong> is not registered in the library inventory.
                            </p>
                            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.6rem;">
                                Issue, return, and shelf actions are disabled until this title is catalogued.
                            </div>
                        </div>
                    `;
                    actionButtonsHtml = `
                        <a href="books.html?action=add&barcode=${encodeURIComponent(entity.id)}" class="btn btn-primary" style="flex: 1;">
                            <i data-lucide="plus-circle" style="width: 16px;"></i> Register Book to Catalog
                        </a>
                        <button class="btn btn-outline" style="flex: 1;" onclick="document.getElementById('modal-universal-scan-inspector').classList.remove('active')">
                            <i data-lucide="x" style="width: 16px;"></i> Dismiss
                        </button>
                    `;
                } else {
                    const isAvail = foundCopy ? (foundCopy.status === 'AVAILABLE') : true;
                    title = foundBook.title;
                    subtitle = `By ${foundBook.author || 'Unknown Author'}`;
                    badgeHtml = `<span class="badge ${isAvail ? 'badge-success' : 'badge-brand'}"><span class="badge-dot"></span> ${foundCopy ? foundCopy.status : 'Catalog Title'}</span>`;
                    const locationStr = foundCopy?.shelves?.name ? `${foundCopy.shelves.name}${foundCopy.racks?.name ? ' / ' + foundCopy.racks.name : ''}` : 'General Stock';

                    detailsHtml = `
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; background: var(--bg-muted); padding: 1rem; border-radius: var(--radius-sm); font-size: 0.85rem; margin-top: 1rem; text-align: left;">
                            <div><strong style="color: var(--text-muted); font-size: 0.75rem; display: block;">ACCESSION / BARCODE</strong><span style="font-family: var(--font-mono); font-weight: 700;">${foundCopy?.barcode || foundBook.isbn || entity.id}</span></div>
                            <div><strong style="color: var(--text-muted); font-size: 0.75rem; display: block;">CATEGORY</strong><span>${foundBook.categories?.name || foundBook.category || 'General'}</span></div>
                            <div><strong style="color: var(--text-muted); font-size: 0.75rem; display: block;">LOCATION</strong><span>${locationStr}</span></div>
                            <div><strong style="color: var(--text-muted); font-size: 0.75rem; display: block;">STATUS</strong><span style="color: ${isAvail ? 'var(--color-success)' : 'var(--brand-primary)'}; font-weight: 700;">${foundCopy ? foundCopy.status : 'Available'}</span></div>
                        </div>
                    `;
                    actionButtonsHtml = `
                        <a href="circulation.html?action=issue&code=${encodeURIComponent(foundCopy?.barcode || entity.id)}" class="btn btn-primary" style="flex: 1;">
                            <i data-lucide="arrow-right-circle" style="width: 16px;"></i> Check Out
                        </a>
                        <a href="circulation.html?action=return&code=${encodeURIComponent(foundCopy?.barcode || entity.id)}" class="btn btn-outline" style="flex: 1;">
                            <i data-lucide="corner-left-down" style="width: 16px;"></i> Return Book
                        </a>
                    `;
                }
            } else if (entity.type === 'STUDENT' || entity.type === 'STAFF' || entity.type === 'NFC_SMARTCARD') {
                const { data } = await supabase.from('students').select(`
                    id, name, student_id, place, status, borrow_limit, class_id,
                    departments(name)
                `).eq('student_id', entity.id).limit(1);

                let member = data && data[0] ? data[0] : null;
                if (!member) {
                    const localStudents = JSON.parse(localStorage.getItem('erp_students') || '[]');
                    member = localStudents.find(s => s.student_id?.toLowerCase() === entity.id.toLowerCase() || s.nfc_tag_id?.toLowerCase() === entity.id.toLowerCase() || s.barcode?.toLowerCase() === entity.id.toLowerCase()) || null;
                }

                if (!member) {
                    // MEMBER NOT FOUND - Reject dummy fallback
                    if (window.app?.playBeep) window.app.playBeep('error');
                    title = `Unregistered Member ID`;
                    subtitle = `Identifier: ${entity.id}`;
                    badgeHtml = `<span class="badge badge-danger"><span class="badge-dot"></span> Not Registered</span>`;
                    detailsHtml = `
                        <div style="background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.25); border-radius: var(--radius-sm); padding: 1.15rem; margin-top: 1rem; text-align: left;">
                            <div style="display: flex; align-items: center; gap: 0.5rem; color: var(--danger, #ef4444); font-weight: 700; margin-bottom: 0.4rem; font-size: 0.9rem;">
                                <i data-lucide="user-x" style="width: 18px; height: 18px;"></i>
                                <span>Member Profile Not Found</span>
                            </div>
                            <p style="font-size: 0.82rem; color: var(--text-secondary); margin: 0; line-height: 1.5;">
                                The scanned ID <strong style="color: var(--text-primary); font-family: var(--font-mono);">${entity.id}</strong> is not associated with any active student or staff member.
                            </p>
                            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.6rem;">
                                Please register the student in the directory before issuing books or assigning credentials.
                            </div>
                        </div>
                    `;
                    actionButtonsHtml = `
                        <a href="students.html?action=add&student_id=${encodeURIComponent(entity.id)}" class="btn btn-primary" style="flex: 1;">
                            <i data-lucide="user-plus" style="width: 16px;"></i> Register Member
                        </a>
                        <button class="btn btn-outline" style="flex: 1;" onclick="document.getElementById('modal-universal-scan-inspector').classList.remove('active')">
                            <i data-lucide="x" style="width: 16px;"></i> Dismiss
                        </button>
                    `;
                } else {
                    title = member.name;
                    subtitle = `ID: ${member.student_id}`;
                    badgeHtml = `<span class="badge badge-brand">${entity.type === 'STAFF' ? 'Faculty / Staff' : 'Student Member'}</span>`;
                    detailsHtml = `
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; background: var(--bg-muted); padding: 1rem; border-radius: var(--radius-sm); font-size: 0.85rem; margin-top: 1rem; text-align: left;">
                            <div><strong style="color: var(--text-muted); font-size: 0.75rem; display: block;">STUDENT ID</strong><span style="font-family: var(--font-mono); font-weight: 700;">${member.student_id}</span></div>
                            <div><strong style="color: var(--text-muted); font-size: 0.75rem; display: block;">CLASS / DEPT</strong><span>${member.class_id || member.departments?.name || 'General'}</span></div>
                            <div><strong style="color: var(--text-muted); font-size: 0.75rem; display: block;">CAMPUS / PLACE</strong><span>${member.place || 'Main Campus'}</span></div>
                            <div><strong style="color: var(--text-muted); font-size: 0.75rem; display: block;">BORROW LIMIT</strong><span style="font-weight: 700;">${member.borrow_limit || 3} Books</span></div>
                        </div>
                    `;
                    actionButtonsHtml = `
                        <a href="circulation.html?member=${encodeURIComponent(member.student_id)}" class="btn btn-primary" style="flex: 1;">
                            <i data-lucide="repeat" style="width: 16px;"></i> Circulation Desk
                        </a>
                        <button class="btn btn-outline" style="flex: 1;" onclick="window.printLibraryCard('${member.name.replace(/'/g, "\\'")}', '${member.student_id}', 'Student')">
                            <i data-lucide="printer" style="width: 16px;"></i> Print Card
                        </button>
                    `;
                }
            } else if (entity.type === 'HALLPASS') {
                title = `Classroom Hall Pass`;
                subtitle = `Code: ${entity.id}`;
                badgeHtml = `<span class="badge badge-warning">Hall Transit</span>`;
                detailsHtml = `
                    <div style="background: var(--bg-muted); padding: 1rem; border-radius: var(--radius-sm); font-size: 0.85rem; margin-top: 1rem; text-align: left;">
                        <div style="font-weight: 700; color: var(--text-primary); margin-bottom: 0.25rem;">Authorized Library Transit Pass</div>
                        <div style="color: var(--text-secondary); font-size: 0.8rem;">Issued by Teacher for Period 3 Library Research. Scan at Gate 1 Scanner Desk to prevent hallway wandering alert.</div>
                    </div>
                `;
                actionButtonsHtml = `
                    <a href="hallpass.html" class="btn btn-primary" style="width: 100%;">
                        <i data-lucide="shield-check" style="width: 16px;"></i> Verify at Gate Desk
                    </a>
                `;
            } else if (entity.type === 'WORKSTATION') {
                title = `Computer Workstation`;
                subtitle = `Machine: ${entity.id}`;
                badgeHtml = `<span class="badge badge-success">Lab Terminal</span>`;
                detailsHtml = `
                    <div style="background: var(--bg-muted); padding: 1rem; border-radius: var(--radius-sm); font-size: 0.85rem; margin-top: 1rem; text-align: left;">
                        <div style="font-weight: 700; color: var(--text-primary);">Tech Lab 1 - Intel Core i7 / 16GB RAM</div>
                        <div style="color: var(--text-secondary); font-size: 0.8rem; margin-top: 0.25rem;">Policy: Single Student Assigned Access Only • Focus Mode Active</div>
                    </div>
                `;
                actionButtonsHtml = `
                    <a href="computers.html" class="btn btn-primary" style="width: 100%;">
                        <i data-lucide="monitor" style="width: 16px;"></i> View Workstation Stats
                    </a>
                `;
            } else {
                // Check if it matches a book copy or student despite GENERIC classification
                const { data: copyCheck } = await supabase.from('book_copies').select('id, barcode, books(title, author)').eq('barcode', entity.id).maybeSingle();
                if (copyCheck && copyCheck.books) {
                    entity.type = 'BOOK';
                    return this.showUniversalInspectorModal(entity, source);
                }
                const { data: memberCheck } = await supabase.from('students').select('id, name, student_id').eq('student_id', entity.id).maybeSingle();
                if (memberCheck) {
                    entity.type = 'STUDENT';
                    return this.showUniversalInspectorModal(entity, source);
                }

                if (window.app?.playBeep) window.app.playBeep('error');
                title = `Unrecognized Barcode`;
                subtitle = `Code: ${entity.id}`;
                badgeHtml = `<span class="badge badge-warning">Uncatalogued Item</span>`;
                detailsHtml = `
                    <div style="background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.25); border-radius: var(--radius-sm); padding: 1.15rem; margin-top: 1rem; text-align: left;">
                        <div style="display: flex; align-items: center; gap: 0.5rem; color: var(--warning, #f59e0b); font-weight: 700; margin-bottom: 0.4rem; font-size: 0.9rem;">
                            <i data-lucide="help-circle" style="width: 18px; height: 18px;"></i>
                            <span>No Matching Record Found</span>
                        </div>
                        <p style="font-size: 0.82rem; color: var(--text-secondary); margin: 0; line-height: 1.5;">
                            The scanned code <strong style="color: var(--text-primary); font-family: var(--font-mono);">${entity.id}</strong> is not associated with any catalogued book, patron member, or asset in the system.
                        </p>
                    </div>
                `;
                actionButtonsHtml = `
                    <a href="books.html?action=add&barcode=${encodeURIComponent(entity.id)}" class="btn btn-primary" style="flex: 1;">
                        <i data-lucide="plus-circle" style="width: 16px;"></i> Register as Book
                    </a>
                    <button class="btn btn-outline" style="flex: 1;" onclick="document.getElementById('modal-universal-scan-inspector').classList.remove('active')">
                        <i data-lucide="x" style="width: 16px;"></i> Dismiss
                    </button>
                `;
            }

            contentEl.innerHTML = `
                <div style="display: flex; align-items: center; gap: 1rem; text-align: left; margin-bottom: 0.75rem;">
                    <div style="width: 52px; height: 52px; border-radius: 12px; background: var(--brand-gradient); color: white; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; flex-shrink: 0; box-shadow: 0 4px 12px var(--brand-glow);">
                        <i data-lucide="${entity.type === 'BOOK' ? 'book' : entity.type === 'STUDENT' ? 'user' : entity.type === 'HALLPASS' ? 'footprints' : 'scan'}" style="width: 28px; height: 28px;"></i>
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.2rem;">
                            ${badgeHtml}
                        </div>
                        <h3 style="margin: 0; font-size: 1.15rem; font-weight: 800; color: var(--text-primary); line-height: 1.2;">${title}</h3>
                        <p style="margin: 0; font-size: 0.8rem; color: var(--text-secondary);">${subtitle}</p>
                    </div>
                </div>

                ${detailsHtml}

                <div style="display: flex; gap: 0.75rem; margin-top: 1.5rem;">
                    ${actionButtonsHtml}
                </div>
            `;

            if (window.lucide) lucide.createIcons();

        } catch (err) {
            contentEl.innerHTML = `
                <div style="color: var(--danger); font-size: 0.9rem;">
                    <i data-lucide="alert-triangle" style="width: 28px; height: 28px; margin-bottom: 0.5rem;"></i>
                    <div>Could not resolve record for ${entity.id}</div>
                </div>
            `;
            if (window.lucide) lucide.createIcons();
        }
    }

    openUniversalInspector() {
        const input = prompt('Enter Barcode, Student Register ID, or NFC UID to Inspect:');
        if (input && input.trim()) {
            this.handleAutoDetectedScan(input.trim(), 'MANUAL');
        }
    }

    initGlobalScanHandler() {
        // Expose global inspector trigger
        window.openUniversalInspector = () => this.openUniversalInspector();
    }

    // --- 6. QR CODE SVG GENERATOR ---
    generateQrSvg(text, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        container.innerHTML = `
            <div style="background: white; padding: 8px; border-radius: 8px; display: inline-block; border: 1px solid #e2e8f0; text-align: center;">
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(text)}" alt="QR Code" style="width: 140px; height: 140px; display: block; margin: 0 auto;">
                <div style="font-family: monospace; font-size: 10px; color: #475569; margin-top: 4px; font-weight: 600;">${text}</div>
            </div>
        `;
    }

    async initNFCReader(onTagRead) {
        return this.startNfcScan(onTagRead);
    }
}

export const hardware = new HardwareEngine();
export const hardwareService = hardware;
window.hardware = hardware;
window.hardwareService = hardware;
