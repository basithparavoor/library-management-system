import { supabase } from './supabaseClient.js';
import { issueBook, returnBook } from './circulation.js';

let html5Scanner = null;
let currentScannerTargetId = null;

// --- CAMERA SCANNER CONTROLS ---
window.openScannerFor = function(targetInputId) {
    currentScannerTargetId = targetInputId;
    const modal = document.getElementById('scanner-modal');
    if (!modal) return;
    modal.classList.add('active');

    if (!html5Scanner) {
        html5Scanner = new Html5QrcodeScanner("reader", { 
            fps: 10, 
            qrbox: { width: 250, height: 120 },
            aspectRatio: 1.0,
            showTorchButtonIfSupported: true
        }, false);
    }

    html5Scanner.render(
        (decodedText) => {
            if (window.app?.playBeep) window.app.playBeep('scan');
            const targetEl = document.getElementById(currentScannerTargetId);
            if (targetEl) {
                targetEl.value = decodedText;
                targetEl.dispatchEvent(new Event('input', { bubbles: true }));
            }
            window.closeCameraScanner();
        },
        (error) => {
            // Ignore frame scan errors
        }
    );
};

window.closeCameraScanner = function() {
    const modal = document.getElementById('scanner-modal');
    if (modal) modal.classList.remove('active');
    if (html5Scanner) {
        html5Scanner.clear().catch(e => {});
    }
};

// --- LIVE LOOKUP PREVIEWS ---
const studentIdInput = document.getElementById('issue-student-id');
const bookBarcodeInput = document.getElementById('issue-book-barcode');
const returnBarcodeInput = document.getElementById('return-book-barcode');

const studentPreview = document.getElementById('issue-student-preview');
const bookPreview = document.getElementById('issue-book-preview');
const returnPreview = document.getElementById('return-loan-preview');

let studentLookupTimeout = null;
studentIdInput?.addEventListener('input', (e) => {
    clearTimeout(studentLookupTimeout);
    const val = e.target.value.trim();
    if (val.length < 2) {
        if (studentPreview) studentPreview.style.display = 'none';
        return;
    }
    studentLookupTimeout = setTimeout(() => lookupStudentPreview(val), 250);
});

async function lookupStudentPreview(studentId) {
    if (!studentPreview) return;
    try {
        const { data: student } = await supabase
            .from('students')
            .select('id, name, student_id, status, class_id, departments(name)')
            .eq('student_id', studentId)
            .maybeSingle();

        if (student) {
            const { count: loanCount } = await supabase
                .from('loans')
                .select('id', { count: 'exact', head: true })
                .eq('student_id', student.id)
                .eq('status', 'ACTIVE');

            const isOk = student.status === 'ACTIVE';
            studentPreview.style.display = 'block';
            studentPreview.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <div style="display: flex; align-items: center; gap: 0.6rem;">
                        <div style="width: 32px; height: 32px; border-radius: 50%; background: var(--brand-primary); color: white; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.8rem;">
                            ${student.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <div style="font-weight: 700; font-size: 0.85rem; color: var(--text-primary);">${student.name}</div>
                            <div style="font-size: 0.75rem; color: var(--text-secondary);">${student.class_id || 'Class'} • ${student.departments?.name || 'Dept'}</div>
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <span class="badge ${isOk ? 'badge-success' : 'badge-danger'}" style="font-size: 0.65rem;">${student.status}</span>
                        <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 2px;">${loanCount || 0} active loans</div>
                    </div>
                </div>
            `;
            if (window.lucide) lucide.createIcons();
        } else {
            studentPreview.style.display = 'block';
            studentPreview.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; background: rgba(239,68,68,0.08); padding: 0.65rem 0.85rem; border-radius: var(--radius-sm); border: 1px solid rgba(239,68,68,0.25);">
                    <div>
                        <div style="font-weight: 700; font-size: 0.82rem; color: var(--danger, #ef4444); display: flex; align-items: center; gap: 0.35rem;">
                            <i data-lucide="user-x" style="width: 14px; height: 14px;"></i> Student Not Found
                        </div>
                        <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 2px;">Student ID "${studentId}" is not registered.</div>
                    </div>
                    <a href="students.html?action=add&student_id=${encodeURIComponent(studentId)}" class="btn btn-outline btn-sm" style="font-size: 0.72rem; padding: 0.25rem 0.6rem; color: var(--brand-primary); white-space: nowrap;">
                        + Register Student
                    </a>
                </div>
            `;
            if (window.lucide) lucide.createIcons();
        }
    } catch (e) {
        studentPreview.style.display = 'none';
    }
}

let bookLookupTimeout = null;
bookBarcodeInput?.addEventListener('input', (e) => {
    clearTimeout(bookLookupTimeout);
    const val = e.target.value.trim();
    if (val.length < 3) {
        if (bookPreview) bookPreview.style.display = 'none';
        return;
    }
    bookLookupTimeout = setTimeout(() => lookupBookPreview(val), 250);
});

async function lookupBookPreview(barcode) {
    if (!bookPreview) return;
    try {
        const { data: copy } = await supabase
            .from('book_copies')
            .select(`
                id, barcode, status,
                books(title, author, categories(name)),
                shelves(name), racks(name)
            `)
            .eq('barcode', barcode)
            .maybeSingle();

        if (copy && copy.books) {
            const isAvail = copy.status === 'AVAILABLE';
            const loc = copy.shelves?.name ? `${copy.shelves.name}${copy.racks?.name ? ' / ' + copy.racks.name : ''}` : 'General Stock';
            
            bookPreview.style.display = 'block';
            bookPreview.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <div>
                        <div style="font-weight: 700; font-size: 0.85rem; color: var(--text-primary);">${copy.books?.title || 'Book'}</div>
                        <div style="font-size: 0.75rem; color: var(--text-secondary);">${copy.books?.author || 'Unknown'} • Shelf: ${loc}</div>
                    </div>
                    <span class="badge ${isAvail ? 'badge-success' : 'badge-danger'}" style="font-size: 0.65rem;">${copy.status}</span>
                </div>
            `;
            if (window.lucide) lucide.createIcons();
        } else {
            if (window.app?.playBeep) window.app.playBeep('error');
            bookPreview.style.display = 'block';
            bookPreview.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; background: rgba(239,68,68,0.08); padding: 0.65rem 0.85rem; border-radius: var(--radius-sm); border: 1px solid rgba(239,68,68,0.25);">
                    <div>
                        <div style="font-weight: 700; font-size: 0.82rem; color: var(--danger, #ef4444); display: flex; align-items: center; gap: 0.35rem;">
                            <i data-lucide="alert-circle" style="width: 14px; height: 14px;"></i> Not in Catalog
                        </div>
                        <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 2px;">No copy found with barcode "${barcode}".</div>
                    </div>
                    <a href="books.html?action=add&barcode=${encodeURIComponent(barcode)}" class="btn btn-outline btn-sm" style="font-size: 0.72rem; padding: 0.25rem 0.6rem; color: var(--brand-primary); white-space: nowrap;">
                        + Register Book
                    </a>
                </div>
            `;
            if (window.lucide) lucide.createIcons();
        }
    } catch (e) {
        bookPreview.style.display = 'none';
    }
}

let returnLookupTimeout = null;
returnBarcodeInput?.addEventListener('input', (e) => {
    clearTimeout(returnLookupTimeout);
    const val = e.target.value.trim();
    if (val.length < 3) {
        if (returnPreview) returnPreview.style.display = 'none';
        return;
    }
    returnLookupTimeout = setTimeout(() => lookupReturnPreview(val), 250);
});

async function lookupReturnPreview(barcode) {
    if (!returnPreview) return;
    try {
        const { data: copy } = await supabase
            .from('book_copies')
            .select('id, barcode, status, books(title)')
            .eq('barcode', barcode)
            .maybeSingle();

        if (copy) {
            const { data: loan } = await supabase
                .from('loans')
                .select('id, due_date, created_at, students(name, student_id)')
                .eq('copy_id', copy.id)
                .eq('status', 'ACTIVE')
                .maybeSingle();

            if (loan) {
                const isOverdue = new Date() > new Date(loan.due_date);
                returnPreview.style.display = 'block';
                returnPreview.innerHTML = `
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <div>
                            <div style="font-weight: 700; font-size: 0.85rem; color: var(--text-primary);">${copy.books?.title || 'Book'}</div>
                            <div style="font-size: 0.75rem; color: var(--text-secondary);">Borrower: <strong>${loan.students?.name}</strong> (${loan.students?.student_id})</div>
                        </div>
                        <div style="text-align: right;">
                            <span class="badge ${isOverdue ? 'badge-danger' : 'badge-success'}" style="font-size: 0.65rem;">
                                ${isOverdue ? 'Overdue' : 'On Time'}
                            </span>
                            <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 2px;">Due: ${new Date(loan.due_date).toLocaleDateString()}</div>
                        </div>
                    </div>
                `;
                if (window.lucide) lucide.createIcons();
            } else {
                returnPreview.style.display = 'block';
                returnPreview.innerHTML = `
                    <div style="background: rgba(245,158,11,0.08); border: 1px solid rgba(245,158,11,0.25); border-radius: var(--radius-sm); padding: 0.65rem 0.85rem; color: var(--warning, #f59e0b);">
                        <div style="font-weight: 700; font-size: 0.82rem; display: flex; align-items: center; gap: 0.35rem;">
                            <i data-lucide="info" style="width: 14px; height: 14px;"></i> No Active Borrowing Record
                        </div>
                        <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 2px;">"${copy.books?.title || barcode}" is not currently loaned (Status: <strong>${copy.status}</strong>).</div>
                    </div>
                `;
                if (window.lucide) lucide.createIcons();
            }
        } else {
            if (window.app?.playBeep) window.app.playBeep('error');
            returnPreview.style.display = 'block';
            returnPreview.innerHTML = `
                <div style="background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.25); border-radius: var(--radius-sm); padding: 0.65rem 0.85rem; color: var(--danger, #ef4444);">
                    <div style="font-weight: 700; font-size: 0.82rem; display: flex; align-items: center; gap: 0.35rem;">
                        <i data-lucide="alert-circle" style="width: 14px; height: 14px;"></i> Uncatalogued Barcode
                    </div>
                    <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 2px;">No book copy found with barcode "${barcode}".</div>
                </div>
            `;
            if (window.lucide) lucide.createIcons();
        }
    } catch (e) {
        returnPreview.style.display = 'none';
    }
}

// --- FORM SUBMISSIONS ---
const formIssue = document.getElementById('form-issue');
const formReturn = document.getElementById('form-return');

formIssue?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const studentId = studentIdInput.value.trim();
    const barcode = bookBarcodeInput.value.trim();
    const btn = document.getElementById('btn-submit-issue');
    const originalText = btn.innerHTML;

    btn.innerText = 'Processing...';
    btn.disabled = true;

    const result = await issueBook(barcode, studentId);

    if (result.success) {
        window.app.toast(result.message, "success", "Book Checked Out");
        formIssue.reset();
        if (studentPreview) studentPreview.style.display = 'none';
        if (bookPreview) bookPreview.style.display = 'none';
        studentIdInput.focus();
        loadDeskHistory();
    } else {
        window.app.toast(result.message, "error", "Check Out Failed");
    }

    btn.innerHTML = originalText;
    btn.disabled = false;
});

formReturn?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const barcode = returnBarcodeInput.value.trim();
    const btn = document.getElementById('btn-submit-return');
    const originalText = btn.innerHTML;

    btn.innerText = 'Processing...';
    btn.disabled = true;

    const result = await returnBook(barcode);

    if (result.success) {
        let title = "Book Returned";
        let message = result.message;
        if (result.fine > 0) {
            message += ` Overdue fine recorded: ₹${result.fine.toFixed(2)}`;
        }
        window.app.toast(message, "success", title);
        formReturn.reset();
        if (returnPreview) returnPreview.style.display = 'none';
        returnBarcodeInput.focus();
        loadDeskHistory();
    } else {
        window.app.toast(result.message, "error", "Return Failed");
    }

    btn.innerHTML = originalText;
    btn.disabled = false;
});

// --- DESK SESSION HISTORY TABLE ---
async function loadDeskHistory() {
    const tbody = document.getElementById('desk-history-tbody');
    if (!tbody) return;

    try {
        const { data: loans, error } = await supabase
            .from('loans')
            .select(`
                id, status, created_at, returned_at, due_date,
                students(name, student_id),
                book_copies(barcode, books(title))
            `)
            .order('created_at', { ascending: false })
            .limit(10);

        if (error || !loans || loans.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="padding: 2.5rem; text-align: center; color: var(--text-muted);">No recent desk transactions.</td></tr>`;
            return;
        }

        tbody.innerHTML = loans.map(loan => {
            const isReturned = loan.status === 'RETURNED';
            const studentName = loan.students?.name || 'Member';
            const studentId = loan.students?.student_id || '';
            const bookTitle = loan.book_copies?.books?.title || 'Book Title';
            const barcode = loan.book_copies?.barcode || '—';
            const dateStr = isReturned ? new Date(loan.returned_at || loan.created_at).toLocaleDateString() : new Date(loan.due_date).toLocaleDateString();

            return `
                <tr>
                    <td data-label="Type">
                        <span class="badge ${isReturned ? 'badge-success' : 'badge-brand'}" style="font-size: 0.7rem;">
                            <i data-lucide="${isReturned ? 'book-down' : 'book-up'}" style="width: 12px; height: 12px;"></i>
                            ${isReturned ? 'Return' : 'Check Out'}
                        </span>
                    </td>
                    <td data-label="Student Member">
                        <div style="font-weight: 600; color: var(--text-primary); font-size: 0.9rem;">${studentName}</div>
                        <div style="font-size: 0.75rem; color: var(--text-muted); font-family: var(--font-mono);">${studentId}</div>
                    </td>
                    <td data-label="Book Title">
                        <div style="font-weight: 600; color: var(--text-primary); font-size: 0.9rem;">${bookTitle}</div>
                    </td>
                    <td data-label="Barcode">
                        <span style="font-family: var(--font-mono); font-size: 0.85rem; color: var(--text-secondary);">${barcode}</span>
                    </td>
                    <td data-label="Date">
                        <span style="font-size: 0.85rem;">${dateStr}</span>
                    </td>
                    <td data-label="Status">
                        <span class="badge ${isReturned ? 'badge-success' : 'badge-warning'}" style="font-size: 0.7rem;">
                            ${loan.status}
                        </span>
                    </td>
                </tr>
            `;
        }).join('');

        if (window.lucide) lucide.createIcons();
    
    // Refresh mobile card view
    if (window.initMobileCardTables) window.initMobileCardTables();
} catch (e) {
        tbody.innerHTML = `<tr><td colspan="6" style="padding: 1.5rem; text-align: center; color: var(--danger);">Failed to load history.</td></tr>`;
    }
}

document.getElementById('btn-refresh-history')?.addEventListener('click', loadDeskHistory);

document.addEventListener('DOMContentLoaded', () => {
    loadDeskHistory();
});