import { supabase } from './supabaseClient.js';
import { ai } from './ai_service.js';

// --- UI Elements ---
const tbody = document.getElementById('books-table-body');
const searchInput = document.getElementById('search-books');
const filterCategory = document.getElementById('filter-category');
const filterStatus = document.getElementById('filter-status');
const selectAllCb = document.getElementById('select-all');
const selectionCountBadge = document.getElementById('selection-count');
const btnBatchDelete = document.getElementById('btn-batch-delete');
const rowsPerPageSelect = document.getElementById('rows-per-page');
const btnPrev = document.getElementById('btn-prev-page');
const btnNext = document.getElementById('btn-next-page');
const paginationInfo = document.getElementById('pagination-info');
const pageDisplay = document.getElementById('current-page-display');
const totalCounter = document.getElementById('total-books-counter');

// --- Modal Elements ---
const modalAddBook = document.getElementById('modal-add-book');
const btnOpenModal = document.getElementById('btn-add-book');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnCancelAdd = document.getElementById('btn-cancel-add');
const formAddBook = document.getElementById('form-add-book');
const modalTitle = document.getElementById('modal-book-title');
const addCategorySelect = document.getElementById('add-category');
const addPublisherSelect = document.getElementById('add-publisher');
const addShelfSelect = document.getElementById('add-shelf');
const addRackSelect = document.getElementById('add-rack');
const copiesSection = document.getElementById('copies-section');

let currentEditBookId = null;

// --- Data State ---
let state = {
    allData: [],
    filteredData: [],
    selectedIds: new Set(),
    page: 1,
    limit: 25
};

// --- 1. MASTER DATA LOADER ---
async function loadMasterData() {
    try {
        const [catsRes, pubsRes, shelvesRes] = await Promise.all([
            supabase.from('categories').select('id, name').order('name'),
            supabase.from('publishers').select('id, name').order('name'),
            supabase.from('shelves').select('id, name').order('name')
        ]);

        if (catsRes.data) {
            const options = catsRes.data.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
            if (filterCategory) filterCategory.innerHTML = '<option value="">All Categories</option>' + options;
            if (addCategorySelect) addCategorySelect.innerHTML = '<option value="">Select Category...</option>' + options;
        }

        if (pubsRes.data && addPublisherSelect) {
            addPublisherSelect.innerHTML = '<option value="">Select Publisher...</option>' + pubsRes.data.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
        }

        if (shelvesRes.data && addShelfSelect) {
            addShelfSelect.innerHTML = '<option value="">Select Shelf...</option>' + shelvesRes.data.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
        }
    } catch (error) {
        console.error("Error loading master data:", error);
    }
}

window.loadRacksForShelf = async function(shelfId) {
    if (!addRackSelect) return;
    addRackSelect.innerHTML = '<option value="">Select Rack...</option>';
    if (!shelfId) return;

    const { data: racks } = await supabase.from('racks').select('id, name').eq('shelf_id', shelfId).order('name');
    if (racks) {
        addRackSelect.innerHTML += racks.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
    }
};

window.promptNewEntity = function(type, selectId) {
    window.app.prompt(`Enter new ${type} name:`, `Add New ${type}`, (name) => {
        if (name && name.trim()) {
            const select = document.getElementById(selectId);
            const opt = document.createElement('option');
            opt.value = 'NEW_' + name.trim();
            opt.text = name.trim() + ' (New)';
            opt.selected = true;
            select.add(opt);
        }
    });
};

// --- 2. FETCH BOOKS ---
async function fetchBooks() {
    if (!tbody) return;
    tbody.innerHTML = `
        <tr>
            <td colspan="6" style="padding: 3rem; text-align: center; color: var(--text-muted);">
                <i data-lucide="loader-2" class="animate-spin" style="width: 28px; height: 28px; margin-bottom: 0.5rem;"></i>
                <div>Fetching book catalogue...</div>
            </td>
        </tr>
    `;
    if (window.lucide) lucide.createIcons();

    try {
        const { data, error } = await supabase
            .from('books')
            .select(`
                id, title, author, isbn, price, edition, category_id, publisher_id,
                categories(name),
                publishers(name),
                book_copies(id, barcode, status, shelf_id, rack_id, shelves(name), racks(name))
            `)
            .order('created_at', { ascending: false })
            .limit(2000);

        if (error) throw error;

        state.allData = data || [];
        if (totalCounter) totalCounter.innerText = `${state.allData.length} Titles`;

        // Check for URL search parameter
        const urlParams = new URLSearchParams(window.location.search);
        const searchParam = urlParams.get('search');
        if (searchParam && searchInput) {
            searchInput.value = searchParam;
        }

        applyFilters();
    } catch (err) {
        console.error("Failed to fetch books:", err);
        tbody.innerHTML = `<tr><td colspan="6" style="padding: 3rem; text-align: center; color: var(--danger);">Failed to load books. Please check database connection.</td></tr>`;
    }
}

function applyFilters() {
    const query = searchInput?.value?.toLowerCase().trim() || '';
    const catId = filterCategory?.value || '';
    const statusFilter = filterStatus?.value || '';

    state.filteredData = state.allData.filter(book => {
        const matchesSearch = !query || 
            (book.title && book.title.toLowerCase().includes(query)) || 
            (book.author && book.author.toLowerCase().includes(query)) || 
            (book.isbn && book.isbn.toLowerCase().includes(query));

        const matchesCat = !catId || book.category_id === catId;

        let matchesStatus = true;
        const totalCopies = book.book_copies?.length || 0;
        const availCopies = book.book_copies?.filter(c => c.status === 'AVAILABLE').length || 0;

        if (statusFilter === 'available') {
            matchesStatus = availCopies > 0;
        } else if (statusFilter === 'checked_out') {
            matchesStatus = totalCopies > 0 && availCopies === 0;
        }

        return matchesSearch && matchesCat && matchesStatus;
    });

    state.page = 1;
    updateTable();
}

// --- 3. RENDER TABLE ---
function updateTable() {
    if (!tbody) return;

    const start = (state.page - 1) * state.limit;
    const end = start + state.limit;
    const paginatedItems = state.filteredData.slice(start, end);

    if (paginatedItems.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="padding: 3.5rem 1rem; text-align: center; color: var(--text-muted);">
                    <i data-lucide="book-x" style="width: 36px; height: 36px; margin-bottom: 0.5rem; opacity: 0.5;"></i>
                    <div style="font-weight: 600; font-size: 1rem; color: var(--text-primary);">No books match your filters</div>
                    <p style="font-size: 0.85rem; margin-top: 0.25rem;">Try adjusting your search query or reset the category filters.</p>
                </td>
            </tr>
        `;
    } else {
        tbody.innerHTML = paginatedItems.map(book => {
            const isSelected = state.selectedIds.has(book.id);
            const totalCopies = book.book_copies?.length || 0;
            const availCopies = book.book_copies?.filter(c => c.status === 'AVAILABLE').length || 0;
            const categoryName = book.categories?.name || 'General';
            const publisherName = book.publishers?.name || '';

            return `
                <tr style="${isSelected ? 'background: rgba(59,130,246,0.06);' : ''}">
                    <td class="checkbox-cell" data-label="Select">
                        <input type="checkbox" class="custom-checkbox row-checkbox" data-id="${book.id}" ${isSelected ? 'checked' : ''}>
                    </td>
                    <td data-label="Book Details">
                        <div style="display: flex; align-items: center; gap: 0.75rem;">
                            <div style="width: 36px; height: 36px; border-radius: 8px; background: rgba(59,130,246,0.1); color: var(--brand-primary); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                <i data-lucide="book" style="width: 18px; height: 18px;"></i>
                            </div>
                            <div>
                                <div style="font-weight: 700; color: var(--text-primary); font-size: 0.95rem;">${escapeHtml(book.title)}</div>
                                <div style="font-size: 0.8rem; color: var(--text-secondary);">${escapeHtml(book.author)} ${publisherName ? '• ' + escapeHtml(publisherName) : ''}</div>
                            </div>
                        </div>
                    </td>
                    <td data-label="ISBN / Edition">
                        <div style="font-family: var(--font-mono); font-size: 0.85rem; color: var(--text-primary); font-weight: 500;">${book.isbn || '—'}</div>
                        <div style="font-size: 0.75rem; color: var(--text-muted);">${book.edition || 'Standard Ed.'}</div>
                    </td>
                    <td data-label="Category">
                        <span class="badge badge-brand" style="font-size: 0.7rem;">${escapeHtml(categoryName)}</span>
                    </td>
                    <td data-label="Copies & Availability">
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <span class="badge ${availCopies > 0 ? 'badge-success' : 'badge-danger'}" style="font-size: 0.75rem;">
                                <span class="badge-dot"></span> ${availCopies} / ${totalCopies} Available
                            </span>
                            <button class="btn btn-ghost btn-sm" onclick="window.viewBookCopies('${book.id}')" title="View Physical Barcodes" style="padding: 0.2rem 0.4rem; font-size: 0.75rem; color: var(--brand-primary);">
                                <i data-lucide="qr-code" style="width: 14px;"></i> Barcodes
                            </button>
                        </div>
                    </td>
                    <td data-label="Actions" style="text-align: right;">
                        <div style="display: flex; gap: 0.4rem; justify-content: flex-end;">
                            <button class="btn btn-sm btn-outline" onclick="window.duplicateBook('${book.id}')" title="Duplicate Book">
                                <i data-lucide="copy" style="width: 14px;"></i>
                            </button>
                            <button class="btn btn-sm btn-outline" onclick="window.editBook('${book.id}')" title="Edit Metadata">
                                <i data-lucide="edit-3" style="width: 14px;"></i>
                            </button>
                            <button class="btn btn-sm btn-ghost" style="color: var(--danger);" onclick="window.deleteBook('${book.id}', '${escapeHtml(book.title).replace(/'/g, "\\'")}')" title="Delete Title">
                                <i data-lucide="trash-2" style="width: 14px;"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    if (window.lucide) lucide.createIcons();
    updatePaginationUI();
    attachCheckboxListeners();
    
    // Refresh mobile card view
    if (window.initMobileCardTables) window.initMobileCardTables();
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function updatePaginationUI() {
    const total = state.filteredData.length;
    const start = total === 0 ? 0 : ((state.page - 1) * state.limit) + 1;
    const end = Math.min(state.page * state.limit, total);

    if (paginationInfo) paginationInfo.innerText = `Showing ${start}-${end} of ${total}`;
    if (pageDisplay) pageDisplay.innerText = `Page ${state.page}`;

    if (btnPrev) btnPrev.disabled = state.page === 1;
    if (btnNext) btnNext.disabled = end >= total;

    if (selectAllCb) {
        const currentViewIds = state.filteredData.slice((state.page - 1) * state.limit, state.page * state.limit).map(b => b.id);
        selectAllCb.checked = currentViewIds.length > 0 && currentViewIds.every(id => state.selectedIds.has(id));
    }
}

// --- 4. CHECKBOXES & BATCH ACTIONS ---
function attachCheckboxListeners() {
    document.querySelectorAll('.row-checkbox').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const id = e.target.getAttribute('data-id');
            if (e.target.checked) state.selectedIds.add(id);
            else state.selectedIds.delete(id);
            updateSelectionBadge();

            if (selectAllCb) {
                const currentViewIds = state.filteredData.slice((state.page - 1) * state.limit, state.page * state.limit).map(b => b.id);
                selectAllCb.checked = currentViewIds.every(cid => state.selectedIds.has(cid));
            }
        });
    });
}

selectAllCb?.addEventListener('change', (e) => {
    const currentViewIds = state.filteredData.slice((state.page - 1) * state.limit, state.page * state.limit).map(b => b.id);
    if (e.target.checked) currentViewIds.forEach(id => state.selectedIds.add(id));
    else currentViewIds.forEach(id => state.selectedIds.delete(id));
    updateTable();
    updateSelectionBadge();
});

const bulkBar = window.initUniversalBulkBar ? window.initUniversalBulkBar() : null;

function updateSelectionBadge() {
    const count = state.selectedIds.size;
    if (selectionCountBadge) {
        if (count > 0) {
            selectionCountBadge.style.display = 'inline-block';
            selectionCountBadge.innerText = `${count} Selected`;
            if (btnBatchDelete) btnBatchDelete.style.display = 'inline-flex';
        } else {
            selectionCountBadge.style.display = 'none';
            if (btnBatchDelete) btnBatchDelete.style.display = 'none';
        }
    }

    if (bulkBar) {
        bulkBar.update(count, {
            onDuplicate: async () => {
                const ids = Array.from(state.selectedIds);
                if (ids.length === 0) return;
                window.app.confirm(`Duplicate ${ids.length} selected book(s)? Each record will be cloned with unique ISBNs and barcodes.`, "Bulk Duplicate Books", async () => {
                    for (const id of ids) {
                        await duplicateBookInternal(id, false);
                    }
                    state.selectedIds.clear();
                    bulkBar.hide();
                    window.app.toast(`Duplicated ${ids.length} books successfully!`, 'success', 'Bulk Duplicated');
                    fetchBooks();
                });
            },
            onDelete: () => btnBatchDelete?.click(),
            onExport: () => btnExportCsv?.click(),
            onClear: () => {
                state.selectedIds.clear();
                if (selectAllCb) selectAllCb.checked = false;
                updateTable();
                bulkBar.hide();
            }
        });
    }
}

async function duplicateBookInternal(id, notify = true) {
    const book = state.allData.find(b => b.id === id);
    if (!book) return;

    const copySuffix = Math.floor(100 + Math.random() * 900);
    const newIsbn = `${book.isbn || 'ISBN'}-CP${copySuffix}`;
    const newBookId = `book-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const cloned = {
        id: newBookId,
        title: `${book.title} (Copy)`,
        author: book.author || 'Unknown',
        isbn: newIsbn,
        category: book.category || 'General',
        rack_location: book.rack_location || '',
        total_copies: parseInt(book.total_copies) || 1,
        available_copies: parseInt(book.available_copies) || 1,
        cover_image_url: book.cover_image_url || ''
    };

    try {
        await supabase.from('books').insert([cloned]);
        await supabase.from('book_copies').insert([{
            id: `copy-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            book_id: newBookId,
            barcode: `${newIsbn}-C1`,
            status: 'AVAILABLE',
            condition: 'EXCELLENT'
        }]);
    } catch(e) {
        console.warn("Supabase duplicate book notice:", e);
    }

    if (notify) {
        window.app.toast(`Book "${cloned.title}" duplicated!`, 'success', 'Book Duplicated');
        fetchBooks();
    }
}

window.duplicateBook = function(id) {
    const book = state.books.find(b => b.id === id);
    const title = book ? book.title : 'this book';
    const msg = `Duplicate book "${title}"? A cloned record with a new identifier will be created.`;
    if (window.app?.confirm) {
        window.app.confirm(msg, "Duplicate Book", () => duplicateBookInternal(id, true));
    } else if (confirm(msg)) {
        duplicateBookInternal(id, true);
    }
};

btnBatchDelete?.addEventListener('click', () => {
    const count = state.selectedIds.size;
    if (count === 0) return;

    window.app.confirm(`Permanently delete ${count} selected books and all their associated copies?`, "Batch Delete Books", async () => {
        const ids = Array.from(state.selectedIds);
        await supabase.from('book_copies').delete().in('book_id', ids);
        await supabase.from('books').delete().in('id', ids);
        state.selectedIds.clear();
        updateSelectionBadge();
        window.app.toast(`Deleted ${count} books successfully.`, 'success', 'Batch Deleted');
        fetchBooks();
    });
});

// --- 5. VIEW PHYSICAL COPIES & BARCODES MODAL ---
window.viewBookCopies = function(bookId) {
    const book = state.allData.find(b => b.id === bookId);
    if (!book) return;

    const modal = document.getElementById('modal-view-copies');
    const titleEl = document.getElementById('copies-modal-title');
    const subtitleEl = document.getElementById('copies-modal-subtitle');
    const listEl = document.getElementById('copies-list-container');

    titleEl.innerText = book.title;
    subtitleEl.innerText = `Author: ${book.author} • ${book.book_copies?.length || 0} Physical Copies`;

    if (!book.book_copies || book.book_copies.length === 0) {
        listEl.innerHTML = `<div style="padding: 2rem; text-align: center; color: var(--text-muted);">No physical copies found for this book.</div>`;
    } else {
        listEl.innerHTML = book.book_copies.map((copy, index) => {
            const isAvail = copy.status === 'AVAILABLE';
            const location = copy.shelves?.name ? `${copy.shelves.name}${copy.racks?.name ? ' / ' + copy.racks.name : ''}` : 'General Shelves';

            return `
                <div style="background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 1rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem;">
                    <div>
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <span style="font-weight: 700; font-size: 0.95rem;">Copy #${index + 1}</span>
                            <span class="badge ${isAvail ? 'badge-success' : 'badge-warning'}" style="font-size: 0.7rem;">${copy.status}</span>
                        </div>
                        <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 2px;">
                            Barcode: <span style="font-family: var(--font-mono); font-weight: 600; color: var(--text-primary);">${copy.barcode}</span>
                        </div>
                        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">
                            Location: ${location}
                        </div>
                    </div>
                    <div>
                        <svg id="barcode-copy-svg-${copy.id}" style="height: 32px;"></svg>
                    </div>
                </div>
            `;
        }).join('');

        // Generate barcodes
        setTimeout(() => {
            if (window.JsBarcode) {
                book.book_copies.forEach(copy => {
                    JsBarcode(`#barcode-copy-svg-${copy.id}`, copy.barcode, {
                        format: "CODE128",
                        width: 1.4,
                        height: 28,
                        displayValue: false,
                        margin: 0
                    });
                });
            }
        }, 50);
    }

    modal.classList.add('active');
    if (window.lucide) lucide.createIcons();
};

// --- 6. EXPORT FUNCTIONS ---
window.exportData = function(format) {
    const exportDataset = state.selectedIds.size > 0 
        ? state.allData.filter(b => state.selectedIds.has(b.id)) 
        : state.filteredData;
        
    if (exportDataset.length === 0) return window.app?.toast("No books available to export.", "warning", "Export");

    if (format === 'csv') {
        const headers = ["Title", "Author", "ISBN", "Category", "Publisher", "Price", "Edition", "Total Copies", "Available Copies"];
        const csvRows = exportDataset.map(b => {
            const totalCopies = b.book_copies?.length || 0;
            const availCopies = b.book_copies?.filter(c => c.status === 'AVAILABLE').length || 0;
            return `"${(b.title || '').replace(/"/g, '""')}","${(b.author || '').replace(/"/g, '""')}","${b.isbn || ''}","${b.categories?.name || ''}","${b.publishers?.name || ''}","${b.price || 0}","${b.edition || ''}","${totalCopies}","${availCopies}"`;
        });
        
        const csvContent = [headers.join(','), ...csvRows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `Book_Catalogue_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        window.app.toast("CSV file downloaded successfully.", "success", "Export Ready");
    } else if (format === 'pdf') {
        window.print();
    }
};

// --- 7. EDIT & DELETE BOOK ---
window.editBook = async function(id) {
    currentEditBookId = id;
    document.getElementById('btn-submit-book').innerHTML = '<i data-lucide="save" style="width: 16px;"></i> Update Book';
    if (modalTitle) modalTitle.innerText = 'Edit Book Metadata';
    if (copiesSection) copiesSection.style.display = 'none';

    const { data: book, error } = await supabase.from('books').select('*').eq('id', id).single();
    if (error) return window.app?.toast("Could not fetch book details.", "error", "Error");

    document.getElementById('add-title').value = book.title;
    document.getElementById('add-author').value = book.author;
    document.getElementById('add-isbn').value = book.isbn || '';
    document.getElementById('add-price').value = book.price || '';
    document.getElementById('add-edition').value = book.edition || '';
    if (book.category_id) document.getElementById('add-category').value = book.category_id;
    if (book.publisher_id) document.getElementById('add-publisher').value = book.publisher_id;

    if (modalAddBook) {
        modalAddBook.classList.add('active');
        if (window.lucide) lucide.createIcons();
    }
};

window.deleteBook = function(id, title) {
    window.app.confirm(`Delete "${title}"? All associated physical copies and barcode labels will be removed.`, "Delete Book", async () => {
        await supabase.from('book_copies').delete().eq('book_id', id);
        await supabase.from('books').delete().eq('id', id);
        window.app.toast(`"${title}" deleted successfully.`, "success", "Deleted");
        fetchBooks();
    });
};

// --- 8. MODAL CONTROLS & SUBMISSION ---
const toggleModal = (show) => {
    if (!modalAddBook) return;
    if (show) {
        modalAddBook.classList.add('active');
    } else {
        modalAddBook.classList.remove('active');
        formAddBook?.reset();
        currentEditBookId = null;
        if (modalTitle) modalTitle.innerText = 'Add New Book to Catalogue';
        if (copiesSection) copiesSection.style.display = 'block';
        const submitBtn = document.getElementById('btn-submit-book');
        if (submitBtn) submitBtn.innerHTML = '<i data-lucide="save" style="width: 16px;"></i> Save Book & Generate Copies';
    }
    if (window.lucide) lucide.createIcons();
};

btnOpenModal?.addEventListener('click', () => toggleModal(true));
btnCloseModal?.addEventListener('click', () => toggleModal(false));
btnCancelAdd?.addEventListener('click', () => toggleModal(false));

formAddBook?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btnSubmit = document.getElementById('btn-submit-book');
    const originalText = btnSubmit.innerHTML;
    btnSubmit.innerText = 'Saving...';
    btnSubmit.disabled = true;

    try {
        let categoryId = document.getElementById('add-category').value;
        let publisherId = document.getElementById('add-publisher').value;

        // Auto-create category if new
        if (categoryId.startsWith('NEW_')) {
            const catName = categoryId.replace('NEW_', '');
            const { data: newCat } = await supabase.from('categories').insert([{ name: catName }]).select().single();
            if (newCat) categoryId = newCat.id;
        }

        // Auto-create publisher if new
        if (publisherId.startsWith('NEW_')) {
            const pubName = publisherId.replace('NEW_', '');
            const { data: newPub } = await supabase.from('publishers').insert([{ name: pubName }]).select().single();
            if (newPub) publisherId = newPub.id;
        }

        const bookPayload = {
            title: document.getElementById('add-title').value.trim(),
            author: document.getElementById('add-author').value.trim(),
            isbn: document.getElementById('add-isbn').value.trim() || null,
            category_id: categoryId || null,
            publisher_id: publisherId || null,
            price: parseFloat(document.getElementById('add-price').value) || 0.00,
            edition: document.getElementById('add-edition').value.trim() || null
        };

        if (currentEditBookId) {
            await supabase.from('books').update(bookPayload).eq('id', currentEditBookId);
            window.app.toast(`"${bookPayload.title}" updated successfully.`, "success", "Book Updated");
        } else {
            const { data: bookData, error } = await supabase.from('books').insert([bookPayload]).select().single();
            if (error) throw error;

            const numCopies = parseInt(document.getElementById('add-copies').value) || 1;
            const customBarcode = document.getElementById('add-custom-barcode')?.value.trim();
            const shelfId = document.getElementById('add-shelf').value || null;
            const rackId = document.getElementById('add-rack').value || null;

            const copiesToInsert = [];
            const timestamp = Date.now().toString().slice(-6);

            for (let i = 0; i < numCopies; i++) {
                copiesToInsert.push({
                    book_id: bookData.id,
                    barcode: (i === 0 && customBarcode) ? customBarcode : `ATH-B-${timestamp}-${i + 1}`,
                    status: 'AVAILABLE',
                    shelf_id: shelfId,
                    rack_id: rackId
                });
            }

            await supabase.from('book_copies').insert(copiesToInsert);
            window.app.toast(`Added "${bookPayload.title}" and generated ${numCopies} copy barcode(s).`, "success", "Book Added");
        }

        toggleModal(false);
        fetchBooks();
    } catch (err) {
        console.error(err);
        window.app.toast(err.message || "Failed to save book.", "error", "Save Failed");
    } finally {
        btnSubmit.innerHTML = originalText;
        btnSubmit.disabled = false;
        currentEditBookId = null;
    }
});

// --- 9. BULK IMPORT MODAL & PROCESSOR ---
function initBulkImportBooks() {
    const btnBulk = document.getElementById('btn-bulk-import');
    if (!btnBulk) return;

    let modal = document.getElementById('modal-bulk-books');
    if (!modal) {
        const modalHTML = `
            <div id="modal-bulk-books" class="app-dialog-overlay">
                <div class="app-dialog" style="max-width: 580px; text-align: left;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
                        <h2 style="font-size: 1.25rem; font-weight: 800; margin: 0;">Bulk Import Catalogue</h2>
                        <button class="btn btn-ghost btn-icon close-bulk"><i data-lucide="x" style="width: 18px;"></i></button>
                    </div>
                    <p style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 1.25rem;">Upload a CSV file. Categories and publishers will be matched or auto-created.</p>
                    
                    <button class="btn btn-outline" id="btn-download-template-books" style="margin-bottom: 1.5rem; width: 100%; justify-content: center;">
                        <i data-lucide="download" style="width: 16px;"></i> Download CSV Template
                    </button>

                    <div class="input-group">
                        <label>Upload Completed CSV</label>
                        <input type="file" id="file-upload-books" accept=".csv" style="padding: 0.6rem 0.8rem; width: 100%;">
                    </div>

                    <div style="margin-top: 1.5rem; display: flex; justify-content: flex-end; gap: 0.75rem;">
                        <button class="btn btn-outline close-bulk">Cancel</button>
                        <button class="btn btn-primary" id="btn-process-bulk-books"><i data-lucide="upload-cloud" style="width: 16px;"></i> Process Import</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        modal = document.getElementById('modal-bulk-books');
        if (window.lucide) lucide.createIcons();

        modal.querySelectorAll('.close-bulk').forEach(btn => {
            btn.addEventListener('click', () => modal.classList.remove('active'));
        });
    }

    btnBulk.addEventListener('click', () => {
        document.getElementById('file-upload-books').value = '';
        modal.classList.add('active');
    });

    document.getElementById('btn-download-template-books')?.addEventListener('click', () => {
        const csvContent = "Title,Author,ISBN,Price,Edition,Category,Publisher,Copies\nSample Book Title 1,Author Name,9780000000001,500,1st Ed,Science,Academic Press,3\nSample Book Title 2,Author Name,9780000000002,750,2nd Ed,General,University Press,2\n";
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "Books_Catalogue_Template.csv";
        link.click();
    });

    document.getElementById('btn-process-bulk-books')?.addEventListener('click', async (e) => {
        const fileInput = document.getElementById('file-upload-books');
        if (!fileInput.files.length) return window.app?.toast("Please select a CSV file first.", "warning", "File Required");

        const btn = e.target;
        btn.innerText = "Processing...";
        btn.disabled = true;

        try {
            const [catsRes, pubsRes] = await Promise.all([
                supabase.from('categories').select('id, name'),
                supabase.from('publishers').select('id, name')
            ]);

            const catMap = {}; if (catsRes.data) catsRes.data.forEach(c => catMap[c.name.toLowerCase()] = c.id);
            const pubMap = {}; if (pubsRes.data) pubsRes.data.forEach(p => pubMap[p.name.toLowerCase()] = p.id);

            const reader = new FileReader();
            reader.onload = async (event) => {
                const lines = event.target.result.split('\n').filter(l => l.trim() !== '');
                if (lines.length < 2) throw new Error("The CSV file is empty.");

                const headers = lines[0].split(',').map(h => h.trim());
                let importedCount = 0;

                for (let i = 1; i < lines.length; i++) {
                    const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
                    const row = headers.reduce((obj, header, idx) => { obj[header] = values[idx]; return obj; }, {});

                    if (row.Title) {
                        let catId = row.Category ? catMap[row.Category.toLowerCase()] : null;
                        if (row.Category && !catId) {
                            const { data: newCat } = await supabase.from('categories').insert([{ name: row.Category }]).select().single();
                            if (newCat) { catId = newCat.id; catMap[row.Category.toLowerCase()] = catId; }
                        }

                        let pubId = row.Publisher ? pubMap[row.Publisher.toLowerCase()] : null;
                        if (row.Publisher && !pubId) {
                            const { data: newPub } = await supabase.from('publishers').insert([{ name: row.Publisher }]).select().single();
                            if (newPub) { pubId = newPub.id; pubMap[row.Publisher.toLowerCase()] = pubId; }
                        }

                        const { data: newBook } = await supabase.from('books').insert([{
                            title: row.Title,
                            author: row.Author || 'Unknown',
                            isbn: row.ISBN || null,
                            price: parseFloat(row.Price) || 0,
                            edition: row.Edition || null,
                            category_id: catId,
                            publisher_id: pubId
                        }]).select().single();

                        if (newBook) {
                            const copiesCount = parseInt(row.Copies) || 1;
                            const copies = [];
                            const ts = Date.now().toString().slice(-6);
                            for (let c = 0; c < copiesCount; c++) {
                                copies.push({
                                    book_id: newBook.id,
                                    barcode: `ATH-B-${ts}-${i}-${c + 1}`,
                                    status: 'AVAILABLE'
                                });
                            }
                            await supabase.from('book_copies').insert(copies);
                            importedCount++;
                        }
                    }
                }

                modal.classList.remove('active');
                window.app.toast(`Successfully imported ${importedCount} books with barcode copies.`, "success", "Import Complete");
                fetchBooks();
            };
            reader.readAsText(fileInput.files[0]);
        } catch (err) {
            window.app.toast(err.message || "Bulk import failed.", "error", "Import Error");
        } finally {
            btn.innerHTML = '<i data-lucide="upload-cloud" style="width: 16px;"></i> Process Import';
            btn.disabled = false;
        }
    });
}

// --- 11. AI-POWERED CATALOGING & ZERO-DATA ENTRY ---
let snapStream = null;
let currentSnapFacingMode = 'environment';
let isContrastBoosted = false;
let snapBarcodeInterval = null;

function initAICataloging() {
    const btnSnapCatalog = document.getElementById('btn-snap-catalog');
    const btnModalSnap = document.getElementById('btn-modal-snap');
    const btnAutoIsbn = document.getElementById('btn-auto-isbn');
    const isbnInput = document.getElementById('add-isbn');
    const isbnStatus = document.getElementById('isbn-status-indicator');
    const titleInput = document.getElementById('add-title');
    const deweyBadge = document.getElementById('dewey-badge');
    const modalSnap = document.getElementById('modal-snap-camera');
    const video = document.getElementById('snap-video');
    const canvas = document.getElementById('snap-canvas');
    const placeholder = document.getElementById('snap-placeholder');
    const reticle = document.getElementById('snap-reticle');
    const btnStartCam = document.getElementById('btn-snap-start-cam');
    const btnCapture = document.getElementById('btn-snap-capture');
    const btnSwitchLens = document.getElementById('btn-snap-switch-lens');
    const btnContrast = document.getElementById('btn-snap-filter-contrast');
    const fileInput = document.getElementById('snap-file-input');
    const liveIsbnIndicator = document.getElementById('snap-live-isbn-indicator');

    const openSnapModal = () => {
        if (!modalSnap) return;
        modalSnap.classList.add('active');
        if (window.lucide) lucide.createIcons();
    };

    const closeSnapModal = () => {
        if (!modalSnap) return;
        modalSnap.classList.remove('active');
        stopCamera();
    };

    function stopCamera() {
        if (snapBarcodeInterval) {
            clearInterval(snapBarcodeInterval);
            snapBarcodeInterval = null;
        }
        if (snapStream) {
            snapStream.getTracks().forEach(t => t.stop());
            snapStream = null;
        }
        if (video) video.style.display = 'none';
        if (reticle) reticle.style.display = 'none';
        if (placeholder) placeholder.style.display = 'block';
        if (btnCapture) btnCapture.disabled = true;
    }

    async function startCamera() {
        stopCamera();
        try {
            snapStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: currentSnapFacingMode,
                    width: { ideal: 1920, min: 1280 },
                    height: { ideal: 1080, min: 720 }
                }
            });
            if (video) {
                video.srcObject = snapStream;
                video.style.display = 'block';
                video.style.filter = isContrastBoosted ? 'contrast(1.5) saturate(1.2) brightness(1.05)' : 'none';
                if (placeholder) placeholder.style.display = 'none';
                if (reticle) reticle.style.display = 'flex';
                if (btnCapture) btnCapture.disabled = false;
                startContinuousBarcodeScanner();
            }
        } catch (err) {
            console.error("Camera access error:", err);
            window.app?.toast("Could not access camera. Try uploading an image file instead.", "error", "Camera Error");
        }
    }

    btnSnapCatalog?.addEventListener('click', openSnapModal);
    btnModalSnap?.addEventListener('click', openSnapModal);
    modalSnap?.querySelectorAll('.close-snap-modal').forEach(b => b.addEventListener('click', closeSnapModal));

    btnStartCam?.addEventListener('click', startCamera);

    btnSwitchLens?.addEventListener('click', () => {
        currentSnapFacingMode = (currentSnapFacingMode === 'environment') ? 'user' : 'environment';
        if (snapStream) startCamera();
        window.app?.toast(`Switched lens to ${currentSnapFacingMode === 'environment' ? 'back' : 'front'} camera`, "info");
    });

    btnContrast?.addEventListener('click', () => {
        isContrastBoosted = !isContrastBoosted;
        if (video) {
            video.style.filter = isContrastBoosted ? 'contrast(1.5) saturate(1.2) brightness(1.05)' : 'none';
        }
        btnContrast.style.background = isContrastBoosted ? 'var(--bg-muted)' : '';
        btnContrast.style.borderColor = isContrastBoosted ? 'var(--color-primary)' : '';
        window.app?.toast(isContrastBoosted ? "Contrast boost active (optimized for calligraphy & faint fonts)" : "Normal contrast restored", "info");
    });

    // Real-time Barcode detection while aiming camera
    function startContinuousBarcodeScanner() {
        if (!('BarcodeDetector' in window)) return;
        try {
            const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'qr_code'] });
            snapBarcodeInterval = setInterval(async () => {
                if (!video || video.readyState < 2) return;
                try {
                    const barcodes = await detector.detect(video);
                    if (barcodes && barcodes.length > 0) {
                        const raw = barcodes[0].rawValue;
                        if (liveIsbnIndicator) {
                            liveIsbnIndicator.style.display = 'inline-block';
                            liveIsbnIndicator.innerText = `✓ ISBN: ${raw}`;
                        }
                    } else if (liveIsbnIndicator) {
                        liveIsbnIndicator.style.display = 'none';
                    }
                } catch (e) {}
            }, 600);
        } catch (e) {}
    }

    btnCapture?.addEventListener('click', async () => {
        if (!video || !canvas) return;
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
        const ctx = canvas.getContext('2d');

        if (isContrastBoosted) {
            ctx.filter = 'contrast(1.4) saturate(1.15) brightness(1.03)';
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        ctx.filter = 'none';

        const base64 = canvas.toDataURL('image/jpeg', 0.92);

        closeSnapModal();
        await processAIImageMetadata(base64);
    });

    fileInput?.addEventListener('change', async (e) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = async (evt) => {
                closeSnapModal();
                await processAIImageMetadata(evt.target.result);
            };
            reader.readAsDataURL(file);
        }
    });

    async function detectBarcodeFromImage(base64Image) {
        if ('BarcodeDetector' in window) {
            try {
                const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'qr_code'] });
                const img = new Image();
                img.src = base64Image;
                await img.decode();
                const barcodes = await detector.detect(img);
                if (barcodes && barcodes.length > 0) {
                    return barcodes[0].rawValue;
                }
            } catch (e) {
                console.warn('Image barcode detector error:', e);
            }
        }
        return null;
    }

    async function processAIImageMetadata(base64Image) {
        window.app?.toast("AI Vision is reading typography, language & metadata...", "info", "AI Parsing", 4000);
        toggleModal(true);

        // 1. Multimodal Gemini Vision Universal OCR
        const extracted = await ai.snapToCatalogOCR(base64Image);
        if (extracted && (extracted.title || extracted.author || extracted.isbn)) {
            applyMetadataToForm(extracted);
            const langLabel = extracted.language ? ` [${extracted.language}]` : '';
            window.app?.toast(`Auto-filled: "${extracted.title}"${langLabel}`, "success", "AI Snap Complete");
            return;
        }

        // 2. Client-side Barcode Detection fallback
        const detectedBarcode = await detectBarcodeFromImage(base64Image);
        if (detectedBarcode) {
            window.app?.toast(`Detected ISBN: ${detectedBarcode}. Pulling online metadata...`, "info", "ISBN Detected");
            const onlineMeta = await ai.fetchBookMetadataByISBN(detectedBarcode);
            if (onlineMeta && onlineMeta.title) {
                applyMetadataToForm(onlineMeta);
                window.app?.toast(`Auto-filled: "${onlineMeta.title}" via ISBN database`, "success", "Catalog Enriched");
                return;
            }
        }

        // 3. Fallback: Friendly notice
        window.app?.toast("Could not automatically extract text from this angle. Please ensure lighting is bright or enter details manually.", "warning", "OCR Notice", 5000);
    }

    const fetchMetadata = async () => {
        const isbn = isbnInput?.value.trim();
        if (!isbn || isbn.length < 9) {
            window.app?.toast("Please enter a valid 10 or 13-digit ISBN", "warning", "ISBN Required");
            return;
        }

        if (isbnStatus) isbnStatus.innerText = "⏳ Fetching metadata...";
        const data = await ai.fetchBookMetadataByISBN(isbn);

        if (data) {
            applyMetadataToForm(data);
            if (isbnStatus) isbnStatus.innerHTML = `<span style="color: var(--color-success); font-weight: 700;">✓ Found Online</span>`;
            window.app?.toast(`Found "${data.title}" by ${data.author}`, "success", "Enriched via ISBN");
        } else {
            if (isbnStatus) isbnStatus.innerHTML = `<span style="color: var(--text-muted);">No online record found</span>`;
            window.app?.toast("No metadata found for this ISBN. You can enter details manually.", "info", "ISBN Lookup");
        }
    };

    btnAutoIsbn?.addEventListener('click', fetchMetadata);

    let isbnDebounce = null;
    isbnInput?.addEventListener('input', () => {
        clearTimeout(isbnDebounce);
        const val = isbnInput.value.trim().replace(/[^0-9X]/gi, '');
        if (val.length === 10 || val.length === 13) {
            isbnDebounce = setTimeout(fetchMetadata, 600);
        }
    });

    titleInput?.addEventListener('input', () => {
        const title = titleInput.value.trim();
        if (title.length >= 3) {
            const dewey = ai.estimateDeweyDecimal(title, addCategorySelect?.value || '');
            if (deweyBadge) {
                deweyBadge.style.display = 'inline-block';
                deweyBadge.innerText = `Dewey: ${dewey}`;
            }
        }
    });

    function applyMetadataToForm(meta) {
        let fullTitle = meta.title || '';
        if (meta.translated_title && meta.translated_title.trim() && !fullTitle.toLowerCase().includes(meta.translated_title.toLowerCase())) {
            fullTitle = `${meta.title} (${meta.translated_title})`;
        }
        if (fullTitle && document.getElementById('add-title')) {
            document.getElementById('add-title').value = fullTitle;
        }
        if (meta.author && document.getElementById('add-author')) {
            document.getElementById('add-author').value = meta.author;
        }
        if (meta.isbn && document.getElementById('add-isbn')) {
            document.getElementById('add-isbn').value = meta.isbn;
        }
        if (meta.publishYear || meta.edition) {
            const edField = document.getElementById('add-edition');
            if (edField && !edField.value) edField.value = meta.edition || meta.publishYear;
        }

        if (meta.category && addCategorySelect) {
            let matched = false;
            for (let opt of addCategorySelect.options) {
                if (opt.text.toLowerCase().includes(meta.category.toLowerCase()) || meta.category.toLowerCase().includes(opt.text.toLowerCase())) {
                    addCategorySelect.value = opt.value;
                    matched = true;
                    break;
                }
            }
            if (!matched && meta.category.length > 2) {
                const newOpt = new Option(meta.category, `NEW_${meta.category}`, true, true);
                addCategorySelect.add(newOpt);
            }
        }

        if (meta.publisher && addPublisherSelect) {
            let matched = false;
            for (let opt of addPublisherSelect.options) {
                if (opt.text.toLowerCase().includes(meta.publisher.toLowerCase())) {
                    addPublisherSelect.value = opt.value;
                    matched = true;
                    break;
                }
            }
            if (!matched && meta.publisher.length > 2) {
                const newOpt = new Option(meta.publisher, `NEW_${meta.publisher}`, true, true);
                addPublisherSelect.add(newOpt);
            }
        }

        const dewey = meta.deweyDecimal || meta.dewey_decimal || ai.estimateDeweyDecimal(meta.title || '', meta.category || '');
        if (deweyBadge && dewey) {
            deweyBadge.style.display = 'inline-block';
            deweyBadge.innerText = `Dewey: ${dewey}`;
        }
    }
}

// --- 10. EVENT LISTENERS & INIT ---
searchInput?.addEventListener('input', () => { clearTimeout(searchTimeout); searchTimeout = setTimeout(applyFilters, 250); });
filterCategory?.addEventListener('change', applyFilters);
filterStatus?.addEventListener('change', applyFilters);

btnPrev?.addEventListener('click', () => { if (state.page > 1) { state.page--; updateTable(); } });
btnNext?.addEventListener('click', () => { if (state.page * state.limit < state.filteredData.length) { state.page++; updateTable(); } });
rowsPerPageSelect?.addEventListener('change', (e) => { state.limit = parseInt(e.target.value); state.page = 1; updateTable(); });

document.addEventListener('DOMContentLoaded', async () => {
    await loadMasterData();
    await fetchBooks();
    initBulkImportBooks();
    initAICataloging();

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('action') === 'add' || urlParams.get('barcode')) {
        const barcode = urlParams.get('barcode');
        toggleModal(true);
        if (barcode) {
            const isbnInput = document.getElementById('add-isbn');
            const customBarcodeInput = document.getElementById('add-custom-barcode');
            if (isbnInput) isbnInput.value = barcode;
            if (customBarcodeInput) customBarcodeInput.value = barcode;
            window.app?.toast(`Pre-filled scanned barcode: ${barcode}. Enter book details to register.`, "info", "Register Scanned Book", 4000);
        }
    }
});