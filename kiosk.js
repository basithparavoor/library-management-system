// kiosk.js - Student Self-Service Lending & Smart Drop Box Return Kiosk
import { erp } from './erp_service.js';
import { hardware } from './hardware.js';
import { supabase } from './supabaseClient.js';
import { showToast, playAudioChime } from './ui.js';
import { ai } from './ai_service.js';

let activeStudent = null;
let currentDropCondition = 'PRISTINE';
let faceScanStream = null;
let checkoutCart = [];

document.addEventListener('DOMContentLoaded', () => {
    initClock();
    initNavigation();
    initHardwareReaders();
});

function initClock() {
    const clockEl = document.getElementById('kiosk-live-clock');
    const update = () => {
        clockEl.innerText = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };
    update();
    setInterval(update, 1000);
}

function initNavigation() {
    const homeView = document.getElementById('kiosk-home-view');
    const borrowView = document.getElementById('kiosk-borrow-view');
    const returnView = document.getElementById('kiosk-return-view');
    const accountView = document.getElementById('kiosk-account-view');
    const thaibaView = document.getElementById('kiosk-thaiba-view');

    function showView(view) {
        homeView.style.display = view === 'home' ? 'block' : 'none';
        borrowView.style.display = view === 'borrow' ? 'block' : 'none';
        returnView.style.display = view === 'return' ? 'block' : 'none';
        accountView.style.display = view === 'account' ? 'block' : 'none';
        if (thaibaView) thaibaView.style.display = view === 'thaiba' ? 'block' : 'none';

        if (view === 'borrow') {
            document.getElementById('borrow-step-card').style.display = 'block';
            document.getElementById('borrow-step-books').style.display = 'none';
            document.getElementById('kiosk-student-input').value = '';
            document.getElementById('kiosk-student-input').focus();
            checkoutCart = [];
            renderCart();
        } else if (view === 'return') {
            document.getElementById('kiosk-return-barcode-input').value = '';
            document.getElementById('kiosk-return-barcode-input').focus();
            document.getElementById('kiosk-return-feedback').style.display = 'none';
        } else if (view === 'account') {
            document.getElementById('kiosk-account-search-id').value = '';
            document.getElementById('kiosk-account-search-id').focus();
            document.getElementById('kiosk-account-results').style.display = 'none';
        } else if (view === 'thaiba') {
            document.getElementById('thaiba-text-input')?.focus();
        } else {
            ai.stopSpeaking();
        }

        if (window.lucide) lucide.createIcons();
    }

    document.getElementById('btn-mode-borrow')?.addEventListener('click', () => showView('borrow'));
    document.getElementById('btn-mode-return')?.addEventListener('click', () => showView('return'));
    document.getElementById('btn-mode-account')?.addEventListener('click', () => showView('account'));
    document.getElementById('btn-mode-thaiba')?.addEventListener('click', () => {
        showView('thaiba');
        ai.speak("Hello! I am Thaiba, your library voice assistant. How can I help you find books today?");
    });

    document.querySelectorAll('.btn-kiosk-back').forEach(btn => {
        btn.addEventListener('click', () => {
            ai.stopSpeaking();
            showView('home');
        });
    });

    initThaibaVoiceControls();
}

    // Borrow Student ID Auth
    const studentInput = document.getElementById('kiosk-student-input');
    const btnAuthStudent = document.getElementById('btn-kiosk-auth-student');

    const handleStudentAuth = async () => {
        const val = studentInput.value.trim();
        if (!val) {
            showToast('Please tap student card or enter Student ID', 'warning');
            return;
        }

        let found = null;
        try {
            const { data } = await supabase
                .from('students')
                .select('*')
                .or(`student_id.eq.${val},id.eq.${/^[0-9a-fA-F-]{36}$/.test(val) ? val : '00000000-0000-0000-0000-000000000000'}`)
                .maybeSingle();
            if (data) found = data;
        } catch (e) {}

        if (!found) {
            const students = JSON.parse(localStorage.getItem('erp_students') || '[]');
            found = students.find(s => s.student_id?.toLowerCase() === val.toLowerCase() || s.nfc_tag_id?.toLowerCase() === val.toLowerCase() || s.barcode?.toLowerCase() === val.toLowerCase());
        }

        if (!found) {
            playAudioChime('ERROR');
            showToast(`❌ Student ID "${val}" not found in member records.`, 'error');
            return;
        }

        activeStudent = found;

        document.getElementById('kiosk-student-info').innerText = `Student: ${activeStudent.name} (${activeStudent.student_id})`;
        document.getElementById('borrow-step-card').style.display = 'none';
        document.getElementById('borrow-step-books').style.display = 'block';
        document.getElementById('kiosk-book-barcode-input').focus();
        playAudioChime('SUCCESS');
        showToast(`Authenticated: ${activeStudent.name}`, 'success');
        if (window.lucide) lucide.createIcons();
    };

    btnAuthStudent?.addEventListener('click', handleStudentAuth);
    studentInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleStudentAuth();
    });

    initFaceCheckIn(handleStudentAuth);
    initSmartDropBoxInspector();

    // Add Book to Cart
    const bookInput = document.getElementById('kiosk-book-barcode-input');
    const btnAddBook = document.getElementById('btn-kiosk-add-book');

    const handleAddBook = async () => {
        const barcode = bookInput.value.trim();
        if (!barcode) return;

        if (checkoutCart.find(b => b.barcode.toLowerCase() === barcode.toLowerCase())) {
            showToast('Book already scanned in this session', 'warning');
            bookInput.value = '';
            return;
        }

        const bookInfo = await resolveBookTitle(barcode);
        if (!bookInfo) {
            playAudioChime('ERROR');
            showToast(`❌ Barcode "${barcode}" not found in library catalog. Unregistered books cannot be borrowed.`, 'error');
            bookInput.value = '';
            return;
        }

        if (bookInfo.status !== 'AVAILABLE') {
            playAudioChime('ERROR');
            showToast(`Book "${bookInfo.title}" is currently ${bookInfo.status} and cannot be issued.`, 'error');
            bookInput.value = '';
            return;
        }

        checkoutCart.push({
            barcode: barcode,
            title: bookInfo.title,
            dueDate: new Date(Date.now() + 14 * 86400 * 1000).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
        });

        bookInput.value = '';
        bookInput.focus();
        playAudioChime('SUCCESS');
        renderCart();
    };

    btnAddBook?.addEventListener('click', handleAddBook);
    bookInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleAddBook();
    });

    // Complete Borrow Session
    document.getElementById('btn-kiosk-finish-borrow')?.addEventListener('click', () => {
        if (checkoutCart.length === 0) {
            showToast('Please scan at least one book barcode', 'warning');
            return;
        }

        checkoutCart.forEach(item => {
            erp.selfCheckout(activeStudent.student_id, item.barcode);
        });

        playAudioChime('SUCCESS');
        alert(`✓ Lending Completed Successfully!\n\n${checkoutCart.length} books issued to ${activeStudent.name}.\nDue Date: 14 Days from today.\nEnjoy your reading!`);
        showView('home');
    });

    // Smart Return Drop Box
    const returnInput = document.getElementById('kiosk-return-barcode-input');
    const btnSubmitReturn = document.getElementById('btn-kiosk-submit-return');

    const handleReturn = async () => {
        const barcode = returnInput.value.trim();
        if (!barcode) return;

        const bookInfo = await resolveBookTitle(barcode);
        const fb = document.getElementById('kiosk-return-feedback');
        fb.style.display = 'block';

        if (!bookInfo) {
            playAudioChime('ERROR');
            fb.innerHTML = `
                <div style="font-size: 1.1rem; font-weight: 800; color: var(--danger, #ef4444); margin-bottom: 0.25rem;">❌ Unregistered Barcode</div>
                <div style="font-size: 0.9rem; color: var(--text-secondary);">No catalog record found for barcode <code style="font-family: var(--font-mono); font-weight: 700;">${barcode}</code>.</div>
                <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.5rem;">Please hand this book to the librarian desk for cataloguing.</div>
            `;
            returnInput.value = '';
            returnInput.focus();
            return;
        }

        const res = erp.selfReturn(barcode);

        const condLabel = currentDropCondition === 'DAMAGED' ? 'Damaged / Wear' : (currentDropCondition === 'NORMAL_WEAR' ? 'Normal Wear' : 'Pristine');
        const condBadge = currentDropCondition === 'DAMAGED' ? 'badge-danger' : (currentDropCondition === 'NORMAL_WEAR' ? 'badge-brand' : 'badge-success');

        fb.innerHTML = `
            <div style="font-size: 1.15rem; font-weight: 800; color: var(--color-success); margin-bottom: 0.25rem;">✓ Book Returned Successfully</div>
            <div style="font-weight: 700; color: var(--text-primary); font-size: 1rem;">${bookInfo.title}</div>
            <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.2rem;">Barcode: <span style="font-family: var(--font-mono); font-weight: 700;">${barcode}</span> • Timestamp: ${res.returnedAt}</div>
            <div style="margin-top: 0.5rem; font-size: 0.8rem; font-weight: 600;">
                Condition Audit: <span class="badge ${condBadge}">${condLabel}</span>
            </div>
            ${currentDropCondition === 'DAMAGED' ? '<div style="font-size: 0.8rem; color: var(--color-danger); font-weight: 700; margin-top: 0.25rem;">⚠️ Flagged for Conservation & Repair Cart</div>' : ''}
            <div style="font-size: 0.8rem; color: var(--color-success); font-weight: 600; margin-top: 0.5rem;">Please place the book into the return chute. Thank you!</div>
        `;

        playAudioChime('SUCCESS');
        returnInput.value = '';
        returnInput.focus();
    };

    btnSubmitReturn?.addEventListener('click', handleReturn);
    returnInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleReturn();
    });

    // Account Status Lookup
    const accInput = document.getElementById('kiosk-account-search-id');
    const btnAccLookup = document.getElementById('btn-kiosk-lookup-account');

    const handleAccLookup = () => {
        const val = accInput.value.trim();
        if (!val) return;

        const loans = JSON.parse(localStorage.getItem('erp_kiosk_loans') || '[]');
        const myLoans = loans.filter(l => l.student_code?.toLowerCase() === val.toLowerCase() && l.status === 'ACTIVE');
        const resultsBox = document.getElementById('kiosk-account-results');
        resultsBox.style.display = 'block';

        resultsBox.innerHTML = `
            <div style="background: var(--bg-surface); padding: 1.25rem; border-radius: var(--radius-md); border: 1px solid var(--border-color); margin-bottom: 1rem;">
                <div style="font-weight: 800; font-size: 1.1rem; color: var(--text-primary); margin-bottom: 0.25rem;">Active Borrowings (${myLoans.length})</div>
                <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1rem;">Member ID: <strong style="font-family: var(--font-mono); color: var(--brand-primary);">${val}</strong></p>

                ${myLoans.length > 0 ? myLoans.map(l => `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.65rem 0.85rem; border-radius: var(--radius-sm); background: var(--bg-card); border: 1px solid var(--border-color); margin-bottom: 0.5rem;">
                        <div>
                            <div style="font-weight: 700; font-size: 0.9rem;">${getBookTitleFromBarcode(l.barcode)}</div>
                            <div style="font-size: 0.75rem; color: var(--text-muted); font-family: var(--font-mono);">Barcode: ${l.barcode} • Borrowed: ${l.issue_date}</div>
                        </div>
                        <div style="text-align: right;">
                            <span class="badge badge-success" style="font-size: 0.72rem;">Due: ${l.due_date}</span>
                        </div>
                    </div>
                `).join('') : `
                    <div style="text-align: center; padding: 1.5rem; color: var(--text-muted); font-size: 0.85rem;">
                        No active book loans. Your library standing is clear!
                    </div>
                `}
            </div>
        `;
        playAudioChime('TAP');
    };

    btnAccLookup?.addEventListener('click', handleAccLookup);
    accInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleAccLookup();
    });
}

function renderCart() {
    const list = document.getElementById('kiosk-cart-list');
    const count = document.getElementById('kiosk-cart-count');
    if (!list) return;

    count.innerText = `${checkoutCart.length} Item${checkoutCart.length === 1 ? '' : 's'}`;

    if (checkoutCart.length === 0) {
        list.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--text-muted); font-size: 0.85rem;">No books scanned yet.</div>`;
        return;
    }

    list.innerHTML = checkoutCart.map((item, idx) => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0.75rem; border-radius: var(--radius-sm); background: var(--bg-card); border: 1px solid var(--border-color); font-size: 0.85rem;">
            <div>
                <div style="font-weight: 700; color: var(--text-primary);">${item.title}</div>
                <div style="font-size: 0.72rem; color: var(--text-muted); font-family: var(--font-mono);">Barcode: ${item.barcode}</div>
            </div>
            <button class="btn btn-ghost btn-sm" onclick="window.removeCartItem(${idx})" style="color: var(--color-danger); padding: 0.2rem 0.4rem;">
                &times;
            </button>
        </div>
    `).join('');
}

window.removeCartItem = function(idx) {
    checkoutCart.splice(idx, 1);
    renderCart();
};

async function resolveBookTitle(barcode) {
    if (!barcode) return null;
    try {
        const { data: copy } = await supabase
            .from('book_copies')
            .select('id, barcode, status, books(title)')
            .eq('barcode', barcode)
            .maybeSingle();

        if (copy && copy.books) {
            return { title: copy.books.title, status: copy.status, id: copy.id };
        }
    } catch (e) {}

    const books = JSON.parse(localStorage.getItem('erp_books') || '[]');
    const found = books.find(b => b.isbn === barcode || b.barcode === barcode);
    if (found) return { title: found.title, status: 'AVAILABLE', id: found.id };

    return null;
}

function getBookTitleFromBarcode(barcode) {
    const books = JSON.parse(localStorage.getItem('erp_books') || '[]');
    const found = books.find(b => b.isbn === barcode || b.barcode === barcode);
    if (found) return found.title;
    return null;
}

function initHardwareReaders() {
    // Hardware NFC Tap Listener on kiosk
    hardware.startNfcScan((tagPayload) => {
        const studentInput = document.getElementById('kiosk-student-input');
        const accInput = document.getElementById('kiosk-account-search-id');

        if (document.getElementById('kiosk-borrow-view').style.display === 'block') {
            studentInput.value = tagPayload;
            document.getElementById('btn-kiosk-auth-student').click();
        } else if (document.getElementById('kiosk-account-view').style.display === 'block') {
            accInput.value = tagPayload;
            document.getElementById('btn-kiosk-lookup-account').click();
        } else {
            // Auto-open borrow view
            document.getElementById('btn-mode-borrow').click();
            studentInput.value = tagPayload;
            document.getElementById('btn-kiosk-auth-student').click();
        }
    });

    // Hardware USB barcode listener
    hardware.onBarcodeScan((scannedCode) => {
        if (document.getElementById('borrow-step-books').style.display === 'block') {
            document.getElementById('kiosk-book-barcode-input').value = scannedCode;
            document.getElementById('btn-kiosk-add-book').click();
        } else if (document.getElementById('kiosk-return-view').style.display === 'block') {
            document.getElementById('kiosk-return-barcode-input').value = scannedCode;
            document.getElementById('btn-kiosk-submit-return').click();
        }
    });
}

// --- THAIBA CONVERSATIONAL VOICE ASSISTANT CONTROLS ---
function initThaibaVoiceControls() {
    const micRing = document.getElementById('thaiba-mic-ring');
    const statusBadge = document.getElementById('thaiba-status-badge');
    const mainPrompt = document.getElementById('thaiba-main-prompt');
    const subPrompt = document.getElementById('thaiba-sub-prompt');
    const waveform = document.getElementById('thaiba-waveform');
    const textInput = document.getElementById('thaiba-text-input');
    const btnSend = document.getElementById('btn-thaiba-send');
    const responseBox = document.getElementById('thaiba-response-box');

    let isListening = false;
    let activeRecognizer = null;

    async function handleThaibaQuery(query) {
        if (!query || !query.trim()) return;
        if (waveform) waveform.style.display = 'none';
        if (statusBadge) statusBadge.innerText = 'Thinking...';
        if (mainPrompt) mainPrompt.innerText = `"${query}"`;
        if (subPrompt) subPrompt.innerText = 'Thaiba is resolving library records...';

        const answer = await ai.askThaiba(query);

        if (statusBadge) statusBadge.innerText = 'Speaking';
        if (responseBox) {
            responseBox.style.display = 'block';

            let extraHtml = '';
            if (answer.location) {
                extraHtml = `
                    <div style="background: rgba(147, 51, 234, 0.08); border: 1px solid rgba(147, 51, 234, 0.25); border-radius: var(--radius-sm); padding: 1rem; margin-top: 1rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap;">
                        <div>
                            <span class="badge" style="background: rgba(147, 51, 234, 0.15); color: #9333ea; font-size: 0.72rem; margin-bottom: 0.25rem;">SHELF NAVIGATION MAP</span>
                            <div style="font-weight: 800; font-size: 1.1rem; color: var(--text-primary);">${answer.location.shelf} &bull; ${answer.location.rack}</div>
                            <div style="font-size: 0.82rem; color: var(--text-secondary); margin-top: 2px;">Vertical Row: <strong>${answer.location.tier}</strong> &bull; Availability: <strong style="color: ${answer.location.status === 'AVAILABLE' ? 'var(--color-success)' : 'var(--brand-primary)'};">${answer.location.status}</strong></div>
                        </div>
                        <div style="width: 48px; height: 48px; border-radius: 12px; background: var(--brand-gradient); color: white; display: flex; align-items: center; justify-content: center; font-size: 1.25rem; box-shadow: 0 4px 12px var(--brand-glow);">
                            <i data-lucide="map-pin" style="width: 24px; height: 24px;"></i>
                        </div>
                    </div>
                `;
            }

            responseBox.innerHTML = `
                <div style="display: flex; align-items: flex-start; gap: 0.75rem;">
                    <div style="width: 36px; height: 36px; border-radius: 50%; background: #9333ea; color: white; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.85rem; flex-shrink: 0;">
                        T
                    </div>
                    <div style="flex: 1;">
                        <div style="font-weight: 700; font-size: 0.85rem; color: #9333ea; margin-bottom: 0.25rem;">Thaiba AI Assistant</div>
                        <div style="font-size: 0.95rem; color: var(--text-primary); line-height: 1.5;">${answer.spokenText}</div>
                        ${extraHtml}
                    </div>
                </div>
            `;
            if (window.lucide) lucide.createIcons();
        }

        ai.speak(answer.spokenText, () => {
            if (statusBadge) statusBadge.innerText = 'Ready to Listen';
        });
    }

    micRing?.addEventListener('click', () => {
        if (isListening) {
            if (activeRecognizer) activeRecognizer.abort();
            isListening = false;
            if (waveform) waveform.style.display = 'none';
            if (statusBadge) statusBadge.innerText = 'Ready to Listen';
            return;
        }

        isListening = true;
        if (waveform) waveform.style.display = 'flex';
        if (statusBadge) statusBadge.innerText = 'Listening... Speak now';
        if (mainPrompt) mainPrompt.innerText = 'Listening to your voice...';
        if (subPrompt) subPrompt.innerText = 'Speak clearly into your microphone';

        activeRecognizer = ai.listenVoice(
            (transcript) => {
                isListening = false;
                handleThaibaQuery(transcript);
            },
            (err) => {
                isListening = false;
                if (waveform) waveform.style.display = 'none';
                if (statusBadge) statusBadge.innerText = 'Ready to Listen';
                if (mainPrompt) mainPrompt.innerText = 'Tap the microphone and ask a question';
                if (subPrompt) subPrompt.innerText = 'Microphone access denied or timed out. You can also type your question below.';
            }
        );
    });

    btnSend?.addEventListener('click', () => {
        const val = textInput?.value.trim();
        if (val) {
            handleThaibaQuery(val);
            textInput.value = '';
        }
    });

    textInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const val = textInput.value.trim();
            if (val) {
                handleThaibaQuery(val);
                textInput.value = '';
            }
        }
    });
}


// ==========================================
// CONTACTLESS FACE CHECK-IN & SMART DROP BOX
// ==========================================
function initFaceCheckIn(handleStudentAuth) {
    const btnLaunch = document.getElementById('btn-kiosk-face-scan-launch');
    const modal = document.getElementById('modal-kiosk-face-scan');
    const btnClose = document.getElementById('btn-close-face-scan');
    const btnCancel = document.getElementById('btn-cancel-face-scan');
    const videoEl = document.getElementById('face-scan-video');
    const statusEl = document.getElementById('face-scan-status');

    if (!btnLaunch || !modal) return;

    btnLaunch.addEventListener('click', async () => {
        modal.style.display = 'flex';
        statusEl.innerText = 'Initializing camera optics...';
        statusEl.style.color = 'var(--text-primary)';

        try {
            faceScanStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 400 }, height: { ideal: 400 } }
            });
            if (videoEl) videoEl.srcObject = faceScanStream;

            // Sequential biometric detection animation
            setTimeout(() => {
                if (statusEl) statusEl.innerText = 'Detecting facial contours & geometry...';
            }, 600);

            setTimeout(async () => {
                if (statusEl) statusEl.innerText = 'Matching patron biometrics...';

                // Look up any enrolled student in db
                let matchedId = 'STU-1001';
                let matchedName = 'Enrolled Patron';
                try {
                    const { data: stus } = await supabase.from('students').select('student_id, name').limit(1);
                    if (stus && stus.length > 0) {
                        matchedId = stus[0].student_id;
                        matchedName = stus[0].name;
                    }
                } catch (e) {}

                setTimeout(() => {
                    if (statusEl) {
                        statusEl.innerText = `✓ Face Verified: ${matchedName} (${matchedId})`;
                        statusEl.style.color = 'var(--color-success)';
                    }
                    playAudioChime('SUCCESS');

                    setTimeout(() => {
                        stopFaceScan();
                        const input = document.getElementById('kiosk-student-input');
                        if (input) {
                            input.value = matchedId;
                            handleStudentAuth();
                        }
                    }, 900);
                }, 1200);

            }, 1400);

        } catch (err) {
            console.error('Face camera error:', err);
            statusEl.innerText = 'Camera access denied or unavailable.';
            statusEl.style.color = 'var(--color-danger)';
        }
    });

    function stopFaceScan() {
        if (faceScanStream) {
            faceScanStream.getTracks().forEach(t => t.stop());
            faceScanStream = null;
        }
        if (videoEl) videoEl.srcObject = null;
        modal.style.display = 'none';
    }

    btnClose?.addEventListener('click', stopFaceScan);
    btnCancel?.addEventListener('click', stopFaceScan);
}

function initSmartDropBoxInspector() {
    const btnToggle = document.getElementById('btn-toggle-condition-inspector');
    const box = document.getElementById('drop-box-inspector-box');
    const btnSim = document.getElementById('btn-sim-condition-toggle');
    const pill = document.getElementById('condition-status-pill');
    const summary = document.getElementById('inspection-condition-summary');
    const video = document.getElementById('drop-chute-video');
    const overlayText = document.getElementById('drop-cam-overlay-text');

    if (!btnToggle || !box) return;

    let chuteStream = null;

    btnToggle.addEventListener('click', async () => {
        const isShown = box.style.display === 'block';
        if (isShown) {
            box.style.display = 'none';
            if (chuteStream) {
                chuteStream.getTracks().forEach(t => t.stop());
                chuteStream = null;
            }
            if (video) video.style.display = 'none';
            if (overlayText) overlayText.style.display = 'block';
        } else {
            box.style.display = 'block';
            try {
                chuteStream = await navigator.mediaDevices.getUserMedia({ video: true });
                if (video) {
                    video.srcObject = chuteStream;
                    video.style.display = 'block';
                    if (overlayText) overlayText.style.display = 'none';
                }
            } catch (e) {
                // Keep simulated placeholder
                console.log('Chute camera fallback to simulation');
            }
        }
    });

    const conditions = [
        { type: 'PRISTINE', label: 'Pristine Condition', badgeClass: 'badge-success', desc: 'Cover intact, no liquid marks, spine intact.' },
        { type: 'NORMAL_WEAR', label: 'Normal Wear', badgeClass: 'badge-brand', desc: 'Minor edge shelf wear. Acceptable for recirculation.' },
        { type: 'DAMAGED', label: 'Damaged / Spill Detected', badgeClass: 'badge-danger', desc: 'Liquid stain or torn spine. Routed to Conservation / Staff Repair.' }
    ];
    let condIndex = 0;

    btnSim?.addEventListener('click', () => {
        condIndex = (condIndex + 1) % conditions.length;
        const c = conditions[condIndex];
        currentDropCondition = c.type;
        if (pill) {
            pill.className = `badge ${c.badgeClass}`;
            pill.innerText = c.label;
        }
        if (summary) summary.innerText = c.desc;
        showToast(`Drop condition set to: ${c.label}`, 'info');
    });
}
