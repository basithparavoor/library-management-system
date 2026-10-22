import { supabase } from './supabaseClient.js';

export async function issueBook(barcode, studentId) {
    try {
        if (!barcode || !studentId) throw new Error("Please enter both Student ID and Book Barcode.");

        // 1. Fetch Loan Settings
        let loanDays = 14;
        let maxBooks = 3;
        try {
            const { data: settings } = await supabase.from('library_settings').select('*');
            if (settings) {
                settings.forEach(s => {
                    if (s.setting_key === 'loan_days') loanDays = parseInt(s.setting_value) || 14;
                    if (s.setting_key === 'max_books') maxBooks = parseInt(s.setting_value) || 3;
                });
            }
        } catch (e) {
            console.warn("Could not load library settings, using defaults.", e);
        }

        // 2. Verify Student Member
        const { data: student, error: studentErr } = await supabase
            .from('students')
            .select('id, name, student_id, status, borrow_limit')
            .eq('student_id', studentId)
            .maybeSingle();
        
        if (studentErr || !student) throw new Error(`Student ID "${studentId}" not found in members directory.`);
        if (student.status !== 'ACTIVE') throw new Error(`Student account "${student.name}" is currently ${student.status}.`);

        // 3. Verify Book Copy
        const { data: copy, error: copyErr } = await supabase
            .from('book_copies')
            .select(`
                id, barcode, status,
                books(id, title, author)
            `)
            .eq('barcode', barcode)
            .maybeSingle();

        if (copyErr || !copy) throw new Error(`Book barcode "${barcode}" not found in inventory.`);
        if (copy.status !== 'AVAILABLE') throw new Error(`Book "${copy.books?.title || barcode}" is currently marked as ${copy.status}.`);

        // 4. Check Member Borrowing Limits
        const studentLimit = student.borrow_limit || maxBooks;
        const { count: activeLoanCount } = await supabase
            .from('loans')
            .select('id', { count: 'exact', head: true })
            .eq('student_id', student.id)
            .eq('status', 'ACTIVE');
            
        if (activeLoanCount >= studentLimit) {
            throw new Error(`Member has reached borrowing limit (${activeLoanCount}/${studentLimit} books active).`);
        }

        // 5. Calculate Due Date
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + loanDays);

        // 6. Insert Loan Record
        const { data: loan, error: insertErr } = await supabase
            .from('loans')
            .insert([{
                copy_id: copy.id,
                student_id: student.id,
                due_date: dueDate.toISOString(),
                status: 'ACTIVE'
            }])
            .select()
            .single();

        if (insertErr) throw insertErr;

        // 7. Update Copy Status to ISSUED
        await supabase
            .from('book_copies')
            .update({ status: 'ISSUED' })
            .eq('id', copy.id);

        return { 
            success: true, 
            message: `Successfully issued "${copy.books?.title || 'Book'}" to ${student.name}. Due on ${dueDate.toLocaleDateString()}.`,
            loan,
            studentName: student.name,
            bookTitle: copy.books?.title || 'Book',
            dueDate: dueDate.toLocaleDateString()
        };

    } catch (error) {
        console.error("Circulation Issue Error:", error);
        return { success: false, message: error.message };
    }
}

export async function returnBook(barcode) {
    try {
        if (!barcode) throw new Error("Please enter a book barcode to return.");

        // 1. Fetch Fine Settings
        let finePerDay = 2.00;
        try {
            const { data: settings } = await supabase.from('library_settings').select('*');
            if (settings) {
                settings.forEach(s => {
                    if (s.setting_key === 'fine_amount') finePerDay = parseFloat(s.setting_value) || 2.00;
                });
            }
        } catch (e) {
            console.warn("Could not load library settings, using defaults.", e);
        }

        // 2. Find the active loan for this book copy
        const { data: copyData, error: copyErr } = await supabase
            .from('book_copies')
            .select(`
                id, barcode, status,
                books(id, title, author)
            `)
            .eq('barcode', barcode)
            .maybeSingle();

        if (copyErr || !copyData) throw new Error(`Barcode "${barcode}" not found in inventory.`);

        const { data: loanData, error: loanErr } = await supabase
            .from('loans')
            .select(`
                id, due_date, student_id,
                students(id, name, student_id)
            `)
            .eq('copy_id', copyData.id)
            .eq('status', 'ACTIVE')
            .maybeSingle();

        if (loanErr || !loanData) {
            if (copyData.status === 'AVAILABLE') {
                throw new Error(`This book copy "${copyData.books?.title}" is already marked as AVAILABLE on shelf.`);
            }
            throw new Error(`No active loan record found for barcode "${barcode}".`);
        }

        // 3. Compute Overdue & Fine
        const now = new Date();
        const dueDate = new Date(loanData.due_date);
        let fineAmount = 0;
        let daysOverdue = 0;

        if (now > dueDate) {
            const diffTime = Math.abs(now - dueDate);
            daysOverdue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            fineAmount = daysOverdue * finePerDay;
        }

        // 4. Mark Loan as Returned
        const { error: updateLoanErr } = await supabase
            .from('loans')
            .update({ 
                status: 'RETURNED', 
                returned_at: now.toISOString() 
            })
            .eq('id', loanData.id);

        if (updateLoanErr) throw updateLoanErr;

        // 5. Mark Copy as AVAILABLE
        await supabase
            .from('book_copies')
            .update({ status: 'AVAILABLE' })
            .eq('id', copyData.id);

        // 6. Record Fine if applicable
        if (fineAmount > 0) {
            try {
                await supabase.from('fines').insert([{
                    loan_id: loanData.id,
                    student_id: loanData.student_id,
                    amount: fineAmount,
                    status: 'UNPAID'
                }]);
            } catch (fErr) {
                console.warn("Fines table insert warning:", fErr);
            }
        }

        return { 
            success: true, 
            message: `"${copyData.books?.title || 'Book'}" returned from ${loanData.students?.name}.`,
            fine: fineAmount,
            daysOverdue,
            studentName: loanData.students?.name,
            bookTitle: copyData.books?.title
        };

    } catch (error) {
        console.error("Circulation Return Error:", error);
        return { success: false, message: error.message };
    }
}