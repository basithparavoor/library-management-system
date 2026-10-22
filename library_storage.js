
let selectedWingIds = new Set();
let selectedShelfIds = new Set();
let selectedRackIds = new Set();
const bulkBar = window.initUniversalBulkBar ? window.initUniversalBulkBar() : null;

function updateStorageBulkBar(type) {
    if (!bulkBar) return;
    let selectedSet, label, onDuplicateAction, onDeleteAction;

    if (type === 'wing') {
        selectedSet = selectedWingIds;
        label = 'Wings';
        onDuplicateAction = async () => {
            const ids = Array.from(selectedWingIds);
            window.app.confirm(`Duplicate ${ids.length} selected storage wing(s)?`, "Bulk Duplicate Wings", async () => {
                for (const id of ids) await duplicateWingInternal(id, false);
                selectedWingIds.clear();
                bulkBar.hide();
                showToast(`Duplicated ${ids.length} wings successfully!`, 'success');
                renderWingsTable();
            });
        };
        onDeleteAction = async () => {
            const ids = Array.from(selectedWingIds);
            window.app.confirm(`Delete ${ids.length} selected storage wings?`, "Bulk Delete Wings", async () => {
                wingsList = wingsList.filter(w => !selectedWingIds.has(w.id));
                saveToLocalStorage();
                updateKpis();
                selectedWingIds.clear();
                bulkBar.hide();
                showToast(`Deleted ${ids.length} wings.`, 'info');
                renderWingsTable();
            });
        };
    } else if (type === 'shelf') {
        selectedSet = selectedShelfIds;
        label = 'Shelves';
        onMoveAction = () => {
            window.openMoveCopyModal('shelf', Array.from(selectedShelfIds));
        };
        onDuplicateAction = async () => {
            const ids = Array.from(selectedShelfIds);
            window.app.confirm(`Duplicate ${ids.length} selected shelf unit(s)?`, "Bulk Duplicate Shelves", async () => {
                for (const id of ids) await duplicateShelfInternal(id, false);
                selectedShelfIds.clear();
                bulkBar.hide();
                showToast(`Duplicated ${ids.length} shelves successfully!`, 'success');
                renderShelvesTable();
            });
        };
        onDeleteAction = async () => {
            const ids = Array.from(selectedShelfIds);
            window.app.confirm(`Delete ${ids.length} selected book shelves?`, "Bulk Delete Shelves", async () => {
                shelvesList = shelvesList.filter(s => !selectedShelfIds.has(s.id));
                saveToLocalStorage();
                updateKpis();
                selectedShelfIds.clear();
                bulkBar.hide();
                showToast(`Deleted ${ids.length} shelves.`, 'info');
                renderShelvesTable();
            });
        };
    } else if (type === 'rack') {
        selectedSet = selectedRackIds;
        label = 'Racks';
        onMoveAction = () => {
            window.openMoveCopyModal('rack', Array.from(selectedRackIds));
        };
        onDuplicateAction = async () => {
            const ids = Array.from(selectedRackIds);
            window.app.confirm(`Duplicate ${ids.length} selected rack compartment(s)?`, "Bulk Duplicate Racks", async () => {
                for (const id of ids) await duplicateRackInternal(id, false);
                selectedRackIds.clear();
                bulkBar.hide();
                showToast(`Duplicated ${ids.length} racks successfully!`, 'success');
                renderRacksTable();
            });
        };
        onDeleteAction = async () => {
            const ids = Array.from(selectedRackIds);
            window.app.confirm(`Delete ${ids.length} selected rack compartments?`, "Bulk Delete Racks", async () => {
                racksList = racksList.filter(r => !selectedRackIds.has(r.id));
                saveToLocalStorage();
                updateKpis();
                selectedRackIds.clear();
                bulkBar.hide();
                showToast(`Deleted ${ids.length} racks.`, 'info');
                renderRacksTable();
            });
        };
    }

    const count = selectedSet.size;
    bulkBar.update(count, {
        onDuplicate: onDuplicateAction,
        onMove: typeof onMoveAction === 'function' ? onMoveAction : undefined,
        onDelete: onDeleteAction,
        onClear: () => {
            selectedWingIds.clear();
            selectedShelfIds.clear();
            selectedRackIds.clear();
            document.querySelectorAll('#select-all-wings, #select-all-shelves, #select-all-racks').forEach(cb => cb.checked = false);
            renderWingsTable();
            renderShelvesTable();
            renderRacksTable();
            bulkBar.hide();
        }
    });
}

async function duplicateWingInternal(id, notify = true) {
    const w = wingsList.find(item => item.id === id);
    if (!w) return;
    const rnd = Math.floor(100 + Math.random() * 900);
    const cloned = {
        ...w,
        id: `wing-${Date.now()}-${rnd}`,
        code: `${w.code}-C${rnd}`,
        name: `${w.name} (Copy)`
    };
    wingsList.push(cloned);
    saveToLocalStorage();
    updateKpis();
    if (notify) {
        showToast(`Storage Wing "${cloned.name}" duplicated!`, 'success');
        renderWingsTable();
    }
}
window.duplicateWing = function(id) { duplicateWingInternal(id, true); };

async function duplicateShelfInternal(id, notify = true) {
    const s = shelvesList.find(item => item.id === id);
    if (!s) return;
    const rnd = Math.floor(100 + Math.random() * 900);
    const cloned = {
        ...s,
        id: `shelf-${Date.now()}-${rnd}`,
        code: `${s.code}-C${rnd}`,
        name: `${s.name} (Copy)`
    };
    shelvesList.push(cloned);
    saveToLocalStorage();
    updateKpis();
    if (notify) {
        showToast(`Book Shelf "${cloned.name}" duplicated!`, 'success');
        renderShelvesTable();
    }
}
window.duplicateShelf = function(id) { duplicateShelfInternal(id, true); };

async function duplicateRackInternal(id, notify = true) {
    const r = racksList.find(item => item.id === id);
    if (!r) return;
    const rnd = Math.floor(100 + Math.random() * 900);
    const cloned = {
        ...r,
        id: `rack-${Date.now()}-${rnd}`,
        code: `${r.code}-C${rnd}`,
        name: `${r.name} (Copy)`,
        row_level: r.row_level || 'Tier 1',
        col_level: r.col_level || 'Col 1'
    };
    racksList.push(cloned);
    saveToLocalStorage();
    updateKpis();
    if (notify) {
        showToast(`Rack Compartment "${cloned.name}" duplicated!`, 'success');
        renderRacksTable();
    }
}
window.duplicateRack = function(id) { duplicateRackInternal(id, true); };

// library_storage.js - Standalone Physical Library Storage, Wings, Shelves & Racks Architecture Suite
import { supabase } from './supabaseClient.js';
import { erp } from './erp_service.js';
import { showToast, playAudioChime } from './ui.js';

let wingsList = [];
let shelvesList = [];
let racksList = [];

// Default Data (Clean Zero State)
const DEFAULT_WINGS = [];
const DEFAULT_SHELVES = [];
const DEFAULT_RACKS = [];

document.addEventListener('DOMContentLoaded', async () => {
    initTabs();
    initModals();
    initBulkStorageModal();
    initMoveCopyModal();
    await loadAllStorageData();
    setupEventListeners();
});

// --- TAB SWITCHING ---
function initTabs() {
    const tabs = document.querySelectorAll('.storage-tab-btn');
    const panels = document.querySelectorAll('.tab-content-panel');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            panels.forEach(p => p.style.display = 'none');

            tab.classList.add('active');
            const target = document.getElementById(tab.dataset.tab);
            if (target) {
                target.style.display = 'block';
                if (tab.dataset.tab === 'tab-wings') {
                    updateStorageBulkBar('wing');
                } else if (tab.dataset.tab === 'tab-shelves') {
                    updateStorageBulkBar('shelf');
                } else if (tab.dataset.tab === 'tab-racks') {
                    updateStorageBulkBar('rack');
                } else {
                    if (bulkBar) bulkBar.hide();
                }
                if (tab.dataset.tab === 'tab-visualizer') renderCapacityVisualizer();
            }
        });
    });
}

// --- DATA LOADING & SUPABASE SYNC ---
async function loadAllStorageData() {
    // 1. Wings
    try {
        const { data: dbWings } = await supabase.from('wings').select('*').order('name');
        if (dbWings && dbWings.length > 0) {
            wingsList = dbWings.map(w => ({
                id: w.id,
                code: w.code || 'WING',
                name: w.name,
                floor: w.floor || '1st Floor',
                primary_focus: w.primary_focus || ''
            }));
        } else {
            wingsList = JSON.parse(localStorage.getItem('erp_storage_wings') || JSON.stringify(DEFAULT_WINGS));
        }
    } catch (e) {
        wingsList = JSON.parse(localStorage.getItem('erp_storage_wings') || JSON.stringify(DEFAULT_WINGS));
    }

    // 2. Shelves
    try {
        const { data: dbShelves } = await supabase.from('shelves').select('*').order('name');
        if (dbShelves && dbShelves.length > 0) {
            shelvesList = dbShelves.map(s => ({
                id: s.id,
                code: s.code || s.name.substring(0, 5).toUpperCase(),
                name: s.name,
                wing_id: s.wing_id || 'wing-north',
                wing_name: s.wing_name || 'North Reference Wing',
                genre: s.genre || 'General Library Collection',
                tiers: s.tiers || 5,
                capacity: s.capacity || 500
            }));
        } else {
            shelvesList = JSON.parse(localStorage.getItem('erp_storage_shelves') || JSON.stringify(DEFAULT_SHELVES));
        }
    } catch (e) {
        shelvesList = JSON.parse(localStorage.getItem('erp_storage_shelves') || JSON.stringify(DEFAULT_SHELVES));
    }

    // 3. Racks
    try {
        const { data: dbRacks } = await supabase.from('racks').select('*, shelves(name)').order('name');
        if (dbRacks && dbRacks.length > 0) {
            racksList = dbRacks.map(r => ({
                id: r.id,
                code: r.code || r.name.split(' ')[0],
                name: r.name,
                shelf_id: r.shelf_id,
                shelf_name: r.shelves?.name || 'General Shelf',
                row_level: r.row_level || 'Tier 1',
                col_level: r.col_level || 'Col 1',
                max_slots: r.max_slots || 80,
                stored_books: r.stored_books || 45
            }));
        } else {
            racksList = JSON.parse(localStorage.getItem('erp_storage_racks') || JSON.stringify(DEFAULT_RACKS));
        }
    } catch (e) {
        racksList = JSON.parse(localStorage.getItem('erp_storage_racks') || JSON.stringify(DEFAULT_RACKS));
    }

    syncStorageHierarchies();
    saveToLocalStorage();
    updateKpis();
    renderWingsTable();
    renderShelvesTable();
    renderRacksTable();
    populateSelectDropdowns();
}


// --- AUTOMATIC HIERARCHICAL CAPACITY & VOLUME SYNCHRONIZATION ---
// Auto-rolls up Rack slots & stored volumes -> Shelves -> Storage Wings
function syncStorageHierarchies() {
    // 1. Rollup Racks to Shelves
    shelvesList.forEach(shelf => {
        const childRacks = racksList.filter(r => r.shelf_id === shelf.id);
        const rackSlotsTotal = childRacks.reduce((sum, r) => sum + (parseInt(r.max_slots) || 0), 0);
        const rackStoredTotal = childRacks.reduce((sum, r) => sum + (parseInt(r.stored_books) || 0), 0);

        if (childRacks.length > 0) {
            shelf.capacity = rackSlotsTotal;
            shelf.stored_books = rackStoredTotal;
            shelf.racks_count = childRacks.length;
        } else {
            shelf.capacity = parseInt(shelf.capacity) || 500;
            shelf.stored_books = shelf.stored_books || 0;
            shelf.racks_count = 0;
        }
    });

    // 2. Rollup Shelves to Wings
    wingsList.forEach(wing => {
        const childShelves = shelvesList.filter(s => s.wing_id === wing.id);
        const shelfIds = new Set(childShelves.map(s => s.id));
        const childRacks = racksList.filter(r => shelfIds.has(r.shelf_id));

        const wingCapacityFromShelves = childShelves.reduce((sum, s) => sum + (parseInt(s.capacity) || 0), 0);
        const wingStoredFromRacks = childRacks.reduce((sum, r) => sum + (parseInt(r.stored_books) || 0), 0);

        if (childShelves.length > 0) {
            wing.max_capacity = wingCapacityFromShelves;
            wing.stored_books = wingStoredFromRacks;
            wing.shelves_count = childShelves.length;
            wing.racks_count = childRacks.length;
        } else {
            wing.max_capacity = parseInt(wing.max_capacity) || 10000;
            wing.stored_books = 0;
            wing.shelves_count = 0;
            wing.racks_count = 0;
        }
    });
}

function saveToLocalStorage() {
    syncStorageHierarchies();
    localStorage.setItem('erp_storage_wings', JSON.stringify(wingsList));
    localStorage.setItem('erp_storage_shelves', JSON.stringify(shelvesList));
    localStorage.setItem('erp_storage_racks', JSON.stringify(racksList));
}

function updateKpis() {
    const totalSlots = racksList.reduce((acc, r) => acc + (parseInt(r.max_slots) || 0), 0);
    const totalStored = racksList.reduce((acc, r) => acc + (parseInt(r.stored_books) || 0), 0);
    const percentage = totalSlots > 0 ? Math.round((totalStored / totalSlots) * 100) : 0;

    document.getElementById('kpi-total-wings').innerText = wingsList.length;
    document.getElementById('kpi-total-shelves').innerText = shelvesList.length;
    document.getElementById('kpi-total-racks').innerText = racksList.length;
    document.getElementById('kpi-storage-utilization').innerText = `${percentage}% (${totalStored.toLocaleString()} / ${totalSlots.toLocaleString()})`;
}

function populateSelectDropdowns() {
    const shelfWingSelect = document.getElementById('shelf-wing-select');
    const rackShelfSelect = document.getElementById('rack-shelf-select');
    const bulkShelfWing = document.getElementById('bulk-shelf-wing');
    const bulkRackShelf = document.getElementById('bulk-rack-shelf');
    const bulkCsvParent = document.getElementById('bulk-csv-parent-select');

    const wingOptions = wingsList.length > 0 
        ? wingsList.map(w => `<option value="${w.id}">${w.name} (${w.code})</option>`).join('')
        : '<option value="">No wings available - Add a wing first</option>';
        
    const shelfOptions = shelvesList.length > 0
        ? shelvesList.map(s => `<option value="${s.id}">${s.name} (${s.code})</option>`).join('')
        : '<option value="">No shelves available - Add a shelf first</option>';

    if (shelfWingSelect) shelfWingSelect.innerHTML = wingOptions;
    if (rackShelfSelect) rackShelfSelect.innerHTML = shelfOptions;
    if (bulkShelfWing) bulkShelfWing.innerHTML = wingOptions;
    if (bulkRackShelf) bulkRackShelf.innerHTML = shelfOptions;

    if (bulkCsvParent) {
        const type = document.getElementById('bulk-csv-type')?.value;
        bulkCsvParent.innerHTML = (type === 'racks') ? shelfOptions : wingOptions;
    }
}

// --- RENDER WINGS TABLE ---
function renderWingsTable() {
    const tbody = document.getElementById('wings-tbody');
    if (!tbody) return;

    if (wingsList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="padding: 2.5rem; text-align: center; color: var(--text-muted);"><i data-lucide="map-pin" style="width: 32px; height: 32px; opacity: 0.4; margin-bottom: 0.5rem;"></i><div style="font-weight: 700;">No storage wings or rooms registered yet.</div></td></tr>`;
        if (window.lucide) lucide.createIcons();
        return;
    }

    tbody.innerHTML = wingsList.map(w => {
        const shelfCount = shelvesList.filter(s => s.wing_id === w.id).length;
        const totalVols = w.max_capacity || 0;
        const storedVols = w.stored_books || 0;
        const pct = totalVols > 0 ? Math.round((storedVols / totalVols) * 100) : 0;
        let barColor = 'var(--color-success)';
        if (pct > 75) barColor = 'var(--color-warning)';
        if (pct > 90) barColor = 'var(--color-danger)';

        return `
            <tr>
                <td class="checkbox-cell" style="text-align: center;"><input type="checkbox" class="custom-checkbox row-wing-cb" data-id="${w.id}" ${selectedWingIds.has(w.id) ? "checked" : ""}></td>
                <td>
                    <span class="badge badge-brand" style="font-family: var(--font-mono); font-weight: 800; font-size: 0.78rem; letter-spacing: 0.04em;">${w.code}</span>
                </td>
                <td>
                    <div style="font-weight: 700; color: var(--text-primary); font-size: 0.92rem;">${w.name}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">${w.primary_focus || 'General Facility Stacks'}</div>
                </td>
                <td>
                    <span class="badge" style="font-weight: 600; font-size: 0.74rem; background: rgba(59,130,246,0.08); color: var(--brand-primary); border: 1px solid rgba(59,130,246,0.2); padding: 3px 8px; border-radius: 6px;">
                        <i data-lucide="map-pin" style="width: 11px; height: 11px; margin-right: 3px;"></i>${w.floor || 'Floor 1'}
                    </span>
                </td>
                <td>
                    <div style="display: flex; gap: 0.35rem; align-items: center; margin-bottom: 4px;">
                        <span class="badge badge-success" style="font-size: 0.68rem; padding: 2px 6px;">${shelfCount} Shelves</span>
                        <span class="badge" style="background: rgba(139,92,246,0.1); color: var(--brand-accent); font-size: 0.68rem; padding: 2px 6px;">${(w.racks_count || 0)} Racks</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: baseline; font-size: 0.76rem; font-family: var(--font-mono); font-weight: 700;">
                        <span>${totalVols.toLocaleString()} vols</span>
                        <span style="font-weight: 600; color: ${barColor}; font-size: 0.72rem;">${storedVols.toLocaleString()} stored (${pct}%)</span>
                    </div>
                    <div class="capacity-bar-bg" style="width: 100%; height: 5px; margin-top: 3px; border-radius: 3px;">
                        <div class="capacity-bar-fill" style="width: ${pct}%; background: ${barColor};"></div>
                    </div>
                </td>
                <td style="text-align: right;">
                    <div style="display: flex; gap: 0.35rem; justify-content: flex-end; align-items: center;">
                        <button class="btn btn-outline btn-sm" onclick="window.duplicateWing('${w.id}')" title="Duplicate Storage Wing" style="padding: 0.3rem 0.5rem;"><i data-lucide="copy" style="width: 13px; height: 13px;"></i></button>
                        <button class="btn btn-outline btn-sm" onclick="window.editWing('${w.id}')" title="Edit Wing" style="padding: 0.3rem 0.5rem;"><i data-lucide="edit-3" style="width: 13px; height: 13px;"></i></button>
                        <button class="btn btn-outline btn-sm" style="color: var(--color-danger); border-color: rgba(239,68,68,0.3); padding: 0.3rem 0.5rem;" onclick="window.deleteWing('${w.id}', '${w.name.replace(/'/g, "\\'")}')" title="Delete Wing"><i data-lucide="trash-2" style="width: 13px; height: 13px;"></i></button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    if (window.lucide) lucide.createIcons();

    // Refresh mobile card view
    if (window.initMobileCardTables) window.initMobileCardTables();
    
    // Wire up wing checkboxes
    const selectAllWings = document.getElementById('select-all-wings');
    if (selectAllWings) {
        selectAllWings.checked = wingsList.length > 0 && wingsList.every(w => selectedWingIds.has(w.id));
        selectAllWings.onchange = (e) => {
            if (e.target.checked) wingsList.forEach(w => selectedWingIds.add(w.id));
            else wingsList.forEach(w => selectedWingIds.delete(w.id));
            renderWingsTable();
            updateStorageBulkBar('wing');
        };
    }
    tbody.querySelectorAll('.row-wing-cb').forEach(cb => {
        cb.addEventListener('change', () => {
            if (cb.checked) selectedWingIds.add(cb.dataset.id);
            else selectedWingIds.delete(cb.dataset.id);
            updateStorageBulkBar('wing');
            if (selectAllWings) selectAllWings.checked = wingsList.every(w => selectedWingIds.has(w.id));
        });
    });
}

// --- RENDER SHELVES TABLE ---
function renderShelvesTable() {
    const tbody = document.getElementById('shelves-tbody');
    if (!tbody) return;

    if (shelvesList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="padding: 2.5rem; text-align: center; color: var(--text-muted);"><i data-lucide="archive" style="width: 32px; height: 32px; opacity: 0.4; margin-bottom: 0.5rem;"></i><div style="font-weight: 700;">No book shelves configured yet.</div></td></tr>`;
        if (window.lucide) lucide.createIcons();
        return;
    }

    tbody.innerHTML = shelvesList.map(s => {
        const wing = wingsList.find(w => w.id === s.wing_id);
        const wingName = wing ? wing.name : (s.wing_name || 'Main Stacks');
        const rackCount = racksList.filter(r => r.shelf_id === s.id).length;
        const totalVols = s.capacity || 0;
        const storedVols = s.stored_books || 0;
        const pct = totalVols > 0 ? Math.round((storedVols / totalVols) * 100) : 0;
        let barColor = 'var(--color-success)';
        if (pct > 75) barColor = 'var(--color-warning)';
        if (pct > 90) barColor = 'var(--color-danger)';

        // Clean up redundant genre if same as name
        const showGenre = s.genre && s.genre.trim().toLowerCase() !== s.name.trim().toLowerCase();

        return `
            <tr>
                <td class="checkbox-cell" style="text-align: center;"><input type="checkbox" class="custom-checkbox row-shelf-cb" data-id="${s.id}" ${selectedShelfIds.has(s.id) ? "checked" : ""}></td>
                <td>
                    <span class="badge badge-brand" style="font-family: var(--font-mono); font-weight: 800; font-size: 0.78rem; letter-spacing: 0.04em;">${s.code}</span>
                </td>
                <td>
                    <div style="font-weight: 700; color: var(--text-primary); font-size: 0.92rem;">${s.name}</div>
                    ${showGenre ? `<div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;"><i data-lucide="book" style="width: 11px; height: 11px; margin-right: 3px;"></i>${s.genre}</div>` : ''}
                </td>
                <td>
                    <span class="badge" style="font-weight: 600; font-size: 0.74rem; background: rgba(59,130,246,0.08); color: var(--brand-primary); border: 1px solid rgba(59,130,246,0.2); padding: 3px 8px; border-radius: 6px;">
                        ${wingName}
                    </span>
                </td>
                <td>
                    <div style="display: flex; gap: 0.35rem; align-items: center; margin-bottom: 4px;">
                        <span class="badge badge-success" style="font-size: 0.68rem; padding: 2px 6px;">${s.tiers || 5} Tiers</span>
                        <span class="badge" style="background: rgba(139,92,246,0.1); color: var(--brand-accent); font-size: 0.68rem; padding: 2px 6px;">${rackCount} Racks</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: baseline; font-size: 0.76rem; font-family: var(--font-mono); font-weight: 700;">
                        <span>${totalVols.toLocaleString()} vols</span>
                        <span style="font-weight: 600; color: ${barColor}; font-size: 0.72rem;">${storedVols.toLocaleString()} stored (${pct}%)</span>
                    </div>
                    <div class="capacity-bar-bg" style="width: 100%; height: 5px; margin-top: 3px; border-radius: 3px;">
                        <div class="capacity-bar-fill" style="width: ${pct}%; background: ${barColor};"></div>
                    </div>
                </td>
                <td style="text-align: right;">
                    <div style="display: flex; gap: 0.35rem; justify-content: flex-end; align-items: center;">
                        <button class="btn btn-outline btn-sm" onclick="window.openMoveCopyModal('shelf', '${s.id}')" title="Move or Copy Shelf to Another Wing" style="padding: 0.3rem 0.5rem; color: var(--brand-accent); border-color: rgba(139,92,246,0.3);"><i data-lucide="arrow-right-left" style="width: 13px; height: 13px;"></i></button>
                        <button class="btn btn-outline btn-sm" onclick="window.duplicateShelf('${s.id}')" title="Duplicate Shelf" style="padding: 0.3rem 0.5rem;"><i data-lucide="copy" style="width: 13px; height: 13px;"></i></button>
                        <button class="btn btn-outline btn-sm" onclick="window.editShelf('${s.id}')" title="Edit Shelf" style="padding: 0.3rem 0.5rem;"><i data-lucide="edit-3" style="width: 13px; height: 13px;"></i></button>
                        <button class="btn btn-outline btn-sm" style="color: var(--color-danger); border-color: rgba(239,68,68,0.3); padding: 0.3rem 0.5rem;" onclick="window.deleteShelf('${s.id}', '${s.name.replace(/'/g, "\\'")}')" title="Delete Shelf"><i data-lucide="trash-2" style="width: 13px; height: 13px;"></i></button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    if (window.lucide) lucide.createIcons();

    // Refresh mobile card view
    if (window.initMobileCardTables) window.initMobileCardTables();
    
    // Wire up shelf checkboxes
    const selectAllShelves = document.getElementById('select-all-shelves');
    if (selectAllShelves) {
        selectAllShelves.checked = shelvesList.length > 0 && shelvesList.every(s => selectedShelfIds.has(s.id));
        selectAllShelves.onchange = (e) => {
            if (e.target.checked) shelvesList.forEach(s => selectedShelfIds.add(s.id));
            else shelvesList.forEach(s => selectedShelfIds.delete(s.id));
            renderShelvesTable();
            updateStorageBulkBar('shelf');
        };
    }
    tbody.querySelectorAll('.row-shelf-cb').forEach(cb => {
        cb.addEventListener('change', () => {
            if (cb.checked) selectedShelfIds.add(cb.dataset.id);
            else selectedShelfIds.delete(cb.dataset.id);
            updateStorageBulkBar('shelf');
            if (selectAllShelves) selectAllShelves.checked = shelvesList.every(s => selectedShelfIds.has(s.id));
        });
    });
}

// --- RENDER RACKS TABLE ---
function renderRacksTable() {
    const tbody = document.getElementById('racks-tbody');
    if (!tbody) return;

    if (racksList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="padding: 2.5rem; text-align: center; color: var(--text-muted);"><i data-lucide="layers" style="width: 32px; height: 32px; opacity: 0.4; margin-bottom: 0.5rem;"></i><div style="font-weight: 700;">No rack compartments registered yet.</div></td></tr>`;
        if (window.lucide) lucide.createIcons();
        return;
    }

    tbody.innerHTML = racksList.map(r => {
        const shelf = shelvesList.find(s => s.id === r.shelf_id);
        const shelfName = shelf ? shelf.name : (r.shelf_name || 'General Shelf');
        const pct = r.max_slots > 0 ? Math.round((r.stored_books / r.max_slots) * 100) : 0;
        let badgeColor = 'var(--color-success)';
        if (pct > 75) badgeColor = 'var(--color-warning)';
        if (pct > 90) badgeColor = 'var(--color-danger)';

        return `
            <tr>
                <td class="checkbox-cell" style="text-align: center;"><input type="checkbox" class="custom-checkbox row-rack-cb" data-id="${r.id}" ${selectedRackIds.has(r.id) ? "checked" : ""}></td>
                <td>
                    <span class="badge badge-brand" style="font-family: var(--font-mono); font-weight: 800; font-size: 0.78rem; letter-spacing: 0.04em; white-space: nowrap;">${r.code}</span>
                </td>
                <td>
                    <div style="font-weight: 700; color: var(--text-primary); font-size: 0.9rem;">${r.name}</div>
                    <div style="margin-top: 2px;">
                        <span class="badge" style="background: rgba(59,130,246,0.08); color: var(--brand-primary); font-size: 0.68rem; padding: 1px 6px; border: 1px solid rgba(59,130,246,0.2);">
                            ${shelfName}
                        </span>
                    </div>
                </td>
                <td style="white-space: nowrap;">
                    <div style="display: flex; gap: 0.35rem; align-items: center;">
                        <span class="badge badge-brand" style="font-size: 0.72rem; padding: 2px 7px; display: inline-flex; align-items: center; gap: 3px;">
                            <i data-lucide="layers" style="width: 11px; height: 11px;"></i> ${r.row_level || 'Tier 1'}
                        </span>
                        <span class="badge" style="background: rgba(139,92,246,0.12); color: var(--brand-accent); font-size: 0.72rem; padding: 2px 7px; display: inline-flex; align-items: center; gap: 3px;">
                            <i data-lucide="columns" style="width: 11px; height: 11px;"></i> ${r.col_level || 'Col 1'}
                        </span>
                    </div>
                </td>
                <td>
                    <div style="display: flex; justify-content: space-between; align-items: baseline; font-size: 0.76rem; font-family: var(--font-mono); font-weight: 700;">
                        <span>${r.stored_books} / ${r.max_slots} vols</span>
                        <span style="font-weight: 800; color: ${badgeColor};">${pct}%</span>
                    </div>
                    <div class="capacity-bar-bg" style="width: 100%; height: 5px; margin-top: 3px; border-radius: 3px;">
                        <div class="capacity-bar-fill" style="width: ${pct}%; background: ${badgeColor};"></div>
                    </div>
                </td>
                <td style="text-align: right;">
                    <div style="display: flex; gap: 0.35rem; justify-content: flex-end; align-items: center;">
                        <button class="btn btn-outline btn-sm" onclick="window.openMoveCopyModal('rack', '${r.id}')" title="Move or Copy Rack to Another Shelf" style="padding: 0.3rem 0.5rem; color: var(--brand-accent); border-color: rgba(139,92,246,0.3);"><i data-lucide="arrow-right-left" style="width: 13px; height: 13px;"></i></button>
                        <button class="btn btn-outline btn-sm" onclick="window.duplicateRack('${r.id}')" title="Duplicate Rack" style="padding: 0.3rem 0.5rem;"><i data-lucide="copy" style="width: 13px; height: 13px;"></i></button>
                        <button class="btn btn-outline btn-sm" onclick="window.editRack('${r.id}')" title="Edit Rack" style="padding: 0.3rem 0.5rem;"><i data-lucide="edit-3" style="width: 13px; height: 13px;"></i></button>
                        <button class="btn btn-outline btn-sm" style="color: var(--color-danger); border-color: rgba(239,68,68,0.3); padding: 0.3rem 0.5rem;" onclick="window.deleteRack('${r.id}', '${r.name.replace(/'/g, "\\'")}')" title="Delete Rack"><i data-lucide="trash-2" style="width: 13px; height: 13px;"></i></button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    if (window.lucide) lucide.createIcons();

    // Refresh mobile card view
    if (window.initMobileCardTables) window.initMobileCardTables();

    // Wire up rack checkboxes
    const selectAllRacks = document.getElementById('select-all-racks');
    if (selectAllRacks) {
        selectAllRacks.checked = racksList.length > 0 && racksList.every(r => selectedRackIds.has(r.id));
        selectAllRacks.onchange = (e) => {
            if (e.target.checked) racksList.forEach(r => selectedRackIds.add(r.id));
            else racksList.forEach(r => selectedRackIds.delete(r.id));
            renderRacksTable();
            updateStorageBulkBar('rack');
        };
    }
    tbody.querySelectorAll('.row-rack-cb').forEach(cb => {
        cb.addEventListener('change', () => {
            if (cb.checked) selectedRackIds.add(cb.dataset.id);
            else selectedRackIds.delete(cb.dataset.id);
            updateStorageBulkBar('rack');
            if (selectAllRacks) selectAllRacks.checked = racksList.every(r => selectedRackIds.has(r.id));
        });
    });
}

// --- RENDER LIVE CAPACITY VISUALIZER ---
function renderCapacityVisualizer() {
    const container = document.getElementById('storage-visualizer-container');
    if (!container) return;

    if (shelvesList.length === 0) {
        container.innerHTML = `<div style="padding: 3rem; text-align: center; color: var(--text-muted);">No shelves configured to visualize.</div>`;
        return;
    }

    container.innerHTML = shelvesList.map(shelf => {
        const racks = racksList.filter(r => r.shelf_id === shelf.id);
        const totalSlots = racks.reduce((acc, r) => acc + (parseInt(r.max_slots) || 0), 0) || shelf.capacity;
        const totalStored = racks.reduce((acc, r) => acc + (parseInt(r.stored_books) || 0), 0);
        const pct = totalSlots > 0 ? Math.round((totalStored / totalSlots) * 100) : 0;

        let statusBadge = '<span class="badge badge-success">Optimal Space</span>';
        let barColor = 'var(--color-success)';
        if (pct >= 75 && pct < 90) {
            statusBadge = '<span class="badge badge-warning">High Occupancy</span>';
            barColor = 'var(--color-warning)';
        } else if (pct >= 90) {
            statusBadge = '<span class="badge badge-danger">Near Full (Reallocate)</span>';
            barColor = 'var(--color-danger)';
        }

        return `
            <div class="storage-card">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem;">
                    <div>
                        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.2rem;">
                            <span class="badge" style="font-family: var(--font-mono); background: rgba(139,92,246,0.1); color: var(--brand-accent);">${shelf.code}</span>
                            <span style="font-size: 0.75rem; color: var(--text-muted);">${shelf.wing_name}</span>
                        </div>
                        <h4 style="margin: 0; font-size: 1.05rem; font-weight: 800; color: var(--text-primary);">${shelf.name}</h4>
                        <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.15rem;">${shelf.genre}</div>
                    </div>
                    ${statusBadge}
                </div>

                <div style="margin: 1rem 0;">
                    <div style="display: flex; justify-content: space-between; font-size: 0.8rem; font-weight: 700;">
                        <span>Capacity Occupancy</span>
                        <span style="color: ${barColor};">${pct}% (${totalStored} / ${totalSlots} vols)</span>
                    </div>
                    <div class="capacity-bar-bg" style="height: 10px;">
                        <div class="capacity-bar-fill" style="width: ${pct}%; background: ${barColor};"></div>
                    </div>
                </div>

                <!-- 2D Physical Bookshelf Matrix (Rows x Columns) -->
                <div style="border-top: 1px solid var(--border-color); padding-top: 0.75rem;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                        <span style="font-size: 0.75rem; font-weight: 800; text-transform: uppercase; color: var(--text-muted);">
                            Physical 2D Bookshelf Matrix (${racks.length} Compartments)
                        </span>
                        <span style="font-size: 0.7rem; color: var(--brand-accent); font-weight: 600;">
                            Stacked Tiers (Rows) ➔ Horizontal Bays (Cols)
                        </span>
                    </div>

                    ${racks.length > 0 ? `
                        <div class="physical-bookshelf-frame">
                            ${(() => {
                                // Group racks by row_level (Tier)
                                const tierMap = new Map();
                                racks.forEach(r => {
                                    const tierKey = r.row_level || 'Tier 1';
                                    if (!tierMap.has(tierKey)) tierMap.set(tierKey, []);
                                    tierMap.get(tierKey).push(r);
                                });

                                // Render each physical tier row from top to bottom
                                return Array.from(tierMap.entries()).map(([tierName, tierRacks]) => {
                                    const tierSlots = tierRacks.reduce((s, r) => s + (parseInt(r.max_slots) || 0), 0);
                                    const tierStored = tierRacks.reduce((s, r) => s + (parseInt(r.stored_books) || 0), 0);
                                    const tierPct = tierSlots > 0 ? Math.round((tierStored / tierSlots) * 100) : 0;

                                    return `
                                        <div class="bookshelf-tier-row">
                                            <div class="tier-header-bar">
                                                <span><i data-lucide="layers" style="width: 12px; vertical-align: middle;"></i> <strong>${tierName}</strong> (${tierRacks.length} Bays)</span>
                                                <span style="font-family: var(--font-mono); font-size: 0.7rem;">${tierStored} / ${tierSlots} vols (${tierPct}%)</span>
                                            </div>
                                            <div class="tier-compartments-grid">
                                                ${tierRacks.map(r => {
                                                    const rPct = r.max_slots > 0 ? Math.round((r.stored_books / r.max_slots) * 100) : 0;
                                                    let statusClass = 'status-optimal';
                                                    let color = 'var(--color-success)';
                                                    if (rPct > 75) { statusClass = 'status-warning'; color = 'var(--color-warning)'; }
                                                    if (rPct > 90) { statusClass = 'status-danger'; color = 'var(--color-danger)'; }

                                                    return `
                                                        <div class="compartment-cell ${statusClass}" title="${r.name}">
                                                            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.68rem;">
                                                                <span style="font-weight: 800; color: var(--brand-primary); font-family: var(--font-mono);">${r.code}</span>
                                                                <span class="badge" style="font-size: 0.6rem; padding: 1px 4px; background: var(--bg-hover);">${r.col_level || 'Col 1'}</span>
                                                            </div>
                                                            <div style="display: flex; justify-content: space-between; align-items: baseline; font-size: 0.72rem; margin-top: 2px;">
                                                                <span style="font-weight: 700; color: ${color};">${rPct}%</span>
                                                                <span style="font-family: var(--font-mono); font-size: 0.68rem; color: var(--text-muted);">${r.stored_books}/${r.max_slots}</span>
                                                            </div>
                                                            <div class="capacity-bar-bg" style="height: 4px; margin-top: 2px;">
                                                                <div class="capacity-bar-fill" style="width: ${rPct}%; background: ${color};"></div>
                                                            </div>
                                                        </div>
                                                    `;
                                                }).join('')}
                                            </div>
                                        </div>
                                    `;
                                }).join('');
                            })()}
                        </div>
                    ` : '<div style="font-size: 0.78rem; padding: 1rem; text-align: center; color: var(--text-muted); background: var(--bg-hover); border-radius: var(--radius-sm);">No rack compartments registered under this shelf yet. Use "Bulk Generate Racks" to create a complete 2D matrix.</div>'}
                </div>
            </div>
        `;
    }).join('');

    if (window.lucide) lucide.createIcons();

    // Refresh mobile card view
    if (window.initMobileCardTables) window.initMobileCardTables();
}

// --- MODAL CONTROLS & CRUD OPERATIONS ---
function initModals() {
    // Select Storage Unit Type Modal
    const modalSelectType = document.getElementById('modal-select-storage-type');
    document.getElementById('btn-add-storage-dropdown')?.addEventListener('click', () => {
        modalSelectType?.classList.add('active');
        if (window.lucide) lucide.createIcons();
    });

    modalSelectType?.querySelectorAll('.close-select-type-modal').forEach(b => {
        b.addEventListener('click', () => modalSelectType.classList.remove('active'));
    });

    modalSelectType?.addEventListener('click', (e) => {
        if (e.target === modalSelectType) modalSelectType.classList.remove('active');
    });

    document.getElementById('btn-choice-wing')?.addEventListener('click', () => {
        modalSelectType?.classList.remove('active');
        document.getElementById('btn-open-wing-modal')?.click();
    });

    document.getElementById('btn-choice-shelf')?.addEventListener('click', () => {
        modalSelectType?.classList.remove('active');
        document.getElementById('btn-open-shelf-modal')?.click();
    });

    document.getElementById('btn-choice-rack')?.addEventListener('click', () => {
        modalSelectType?.classList.remove('active');
        document.getElementById('btn-open-rack-modal')?.click();
    });

    document.getElementById('btn-choice-bulk')?.addEventListener('click', () => {
        modalSelectType?.classList.remove('active');
        window.openBulkStorageModal('shelves');
    });

    document.getElementById('btn-open-bulk-storage')?.addEventListener('click', () => {
        window.openBulkStorageModal('shelves');
    });

    document.getElementById('btn-tab-bulk-shelves')?.addEventListener('click', () => {
        window.openBulkStorageModal('shelves');
    });

    document.getElementById('btn-tab-bulk-racks')?.addEventListener('click', () => {
        window.openBulkStorageModal('racks');
    });

    // Wing Modal
    const modalWing = document.getElementById('modal-wing');
    document.getElementById('btn-open-wing-modal')?.addEventListener('click', () => {
        document.getElementById('modal-wing-title').innerText = 'Add Storage Wing';
        document.getElementById('wing-id').value = '';
        document.getElementById('form-wing').reset();
        modalWing.classList.add('active');
    });
    modalWing?.querySelectorAll('.close-wing-modal').forEach(b => b.addEventListener('click', () => modalWing.classList.remove('active')));
    modalWing?.addEventListener('click', (e) => { if (e.target === modalWing) modalWing.classList.remove('active'); });

    // Shelf Modal
    const modalShelf = document.getElementById('modal-shelf');
    document.getElementById('btn-open-shelf-modal')?.addEventListener('click', () => {
        document.getElementById('modal-shelf-title').innerText = 'Add Book Shelf';
        document.getElementById('shelf-id').value = '';
        document.getElementById('form-shelf').reset();
        populateSelectDropdowns();
        modalShelf.classList.add('active');
    });
    modalShelf?.querySelectorAll('.close-shelf-modal').forEach(b => b.addEventListener('click', () => modalShelf.classList.remove('active')));
    modalShelf?.addEventListener('click', (e) => { if (e.target === modalShelf) modalShelf.classList.remove('active'); });

    // Rack Modal
    const modalRack = document.getElementById('modal-rack');
    document.getElementById('btn-open-rack-modal')?.addEventListener('click', () => {
        document.getElementById('modal-rack-title').innerText = 'Add Rack Compartment';
        document.getElementById('rack-id').value = '';
        document.getElementById('form-rack').reset();
        populateSelectDropdowns();
        modalRack.classList.add('active');
    });
    modalRack?.querySelectorAll('.close-rack-modal').forEach(b => b.addEventListener('click', () => modalRack.classList.remove('active')));
    modalRack?.addEventListener('click', (e) => { if (e.target === modalRack) modalRack.classList.remove('active'); });

    // PDF Preview Modal
    const modalPdf = document.getElementById('modal-storage-pdf-preview');
    modalPdf?.querySelectorAll('.close-pdf-modal').forEach(b => b.addEventListener('click', () => modalPdf.classList.remove('active')));
}

// Wing Form Submit
document.getElementById('form-wing')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('wing-id').value;
    const wingObj = {
        id: id || `wing-${Date.now()}`,
        code: document.getElementById('wing-code').value.trim().toUpperCase(),
        name: document.getElementById('wing-name').value.trim(),
        floor: document.getElementById('wing-floor').value.trim() || 'Ground Floor',
        primary_focus: document.getElementById('wing-focus').value.trim() || 'General Stacks',
        max_capacity: parseInt(document.getElementById('wing-capacity').value) || 5000
    };

    if (id) {
        const idx = wingsList.findIndex(w => w.id === id);
        if (idx !== -1) wingsList[idx] = wingObj;
    } else {
        wingsList.push(wingObj);
    }

    saveToLocalStorage();
    updateKpis();
    renderWingsTable();
    populateSelectDropdowns();
    document.getElementById('modal-wing').classList.remove('active');
    playAudioChime('SUCCESS');
    showToast(`Storage Wing "${wingObj.name}" saved!`, 'success');
});

// Shelf Form Submit
document.getElementById('form-shelf')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('shelf-id').value;
    const wingId = document.getElementById('shelf-wing-select').value;
    const wing = wingsList.find(w => w.id === wingId);

    const shelfObj = {
        id: id || `shelf-${Date.now()}`,
        code: document.getElementById('shelf-code').value.trim().toUpperCase(),
        name: document.getElementById('shelf-name').value.trim(),
        wing_id: wingId,
        wing_name: wing ? wing.name : 'Main Storage Wing',
        genre: document.getElementById('shelf-genre').value.trim() || 'General Literature',
        tiers: parseInt(document.getElementById('shelf-tiers').value) || 5,
        capacity: parseInt(document.getElementById('shelf-capacity').value) || 500
    };

    if (id) {
        const idx = shelvesList.findIndex(s => s.id === id);
        if (idx !== -1) shelvesList[idx] = shelfObj;
    } else {
        shelvesList.push(shelfObj);
    }

    try {
        await supabase.from('shelves').upsert({ id: shelfObj.id, name: shelfObj.name });
    } catch (err) {}

    saveToLocalStorage();
    updateKpis();
    renderShelvesTable();
    populateSelectDropdowns();
    document.getElementById('modal-shelf').classList.remove('active');
    playAudioChime('SUCCESS');
    showToast(`Book Shelf "${shelfObj.name}" saved!`, 'success');
});

// Rack Form Submit
document.getElementById('form-rack')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('rack-id').value;
    const shelfId = document.getElementById('rack-shelf-select').value;
    const shelf = shelvesList.find(s => s.id === shelfId);

    const rackObj = {
        id: id || `rack-${Date.now()}`,
        code: document.getElementById('rack-code').value.trim().toUpperCase(),
        name: document.getElementById('rack-name').value.trim(),
        shelf_id: shelfId,
        shelf_name: shelf ? shelf.name : 'General Shelf',
        row_level: document.getElementById('rack-row').value.trim() || 'Tier 1',
        col_level: document.getElementById('rack-col').value.trim() || 'Col 1',
        max_slots: parseInt(document.getElementById('rack-capacity').value) || 80,
        stored_books: parseInt(document.getElementById('rack-count').value) || 0
    };

    if (id) {
        const idx = racksList.findIndex(r => r.id === id);
        if (idx !== -1) racksList[idx] = rackObj;
    } else {
        racksList.push(rackObj);
    }

    try {
        await supabase.from('racks').upsert({ id: rackObj.id, name: rackObj.name, shelf_id: rackObj.shelf_id });
    } catch (err) {}

    saveToLocalStorage();
    updateKpis();
    renderRacksTable();
    document.getElementById('modal-rack').classList.remove('active');
    playAudioChime('SUCCESS');
    showToast(`Rack compartment "${rackObj.name}" saved!`, 'success');
});

// Global Edit/Delete Functions
window.editWing = function(id) {
    const w = wingsList.find(item => item.id === id);
    if (!w) return;
    document.getElementById('modal-wing-title').innerText = 'Edit Storage Wing';
    document.getElementById('wing-id').value = w.id;
    document.getElementById('wing-code').value = w.code;
    document.getElementById('wing-name').value = w.name;
    document.getElementById('wing-floor').value = w.floor;
    document.getElementById('wing-focus').value = w.primary_focus;
    document.getElementById('wing-capacity').value = w.max_capacity;
    document.getElementById('modal-wing').classList.add('active');
};

window.deleteWing = function(id, name) {
    window.app.confirm(`Delete storage wing "${name}" and unassign child shelves?`, 'Delete Wing', () => {
        wingsList = wingsList.filter(w => w.id !== id);
        saveToLocalStorage();
        updateKpis();
        renderWingsTable();
        populateSelectDropdowns();
        showToast(`Storage Wing "${name}" deleted.`, 'info');
    });
};

window.editShelf = function(id) {
    const s = shelvesList.find(item => item.id === id);
    if (!s) return;
    document.getElementById('modal-shelf-title').innerText = 'Edit Book Shelf';
    document.getElementById('shelf-id').value = s.id;
    document.getElementById('shelf-code').value = s.code;
    document.getElementById('shelf-name').value = s.name;
    document.getElementById('shelf-wing-select').value = s.wing_id;
    document.getElementById('shelf-genre').value = s.genre;
    document.getElementById('shelf-tiers').value = s.tiers;
    document.getElementById('shelf-capacity').value = s.capacity;
    document.getElementById('modal-shelf').classList.add('active');
};

window.deleteShelf = function(id, name) {
    window.app.confirm(`Delete shelf "${name}"?`, 'Delete Shelf', async () => {
        shelvesList = shelvesList.filter(s => s.id !== id);
        try { await supabase.from('shelves').delete().eq('id', id); } catch(e) {}
        saveToLocalStorage();
        updateKpis();
        renderShelvesTable();
        populateSelectDropdowns();
        showToast(`Shelf "${name}" deleted.`, 'info');
    });
};

window.editRack = function(id) {
    const r = racksList.find(item => item.id === id);
    if (!r) return;
    const titleEl = document.getElementById('modal-rack-title');
    if (titleEl) titleEl.innerText = 'Edit Rack Compartment';
    const idEl = document.getElementById('rack-id');
    if (idEl) idEl.value = r.id;
    const codeEl = document.getElementById('rack-code');
    if (codeEl) codeEl.value = r.code;
    const nameEl = document.getElementById('rack-name');
    if (nameEl) nameEl.value = r.name;
    const shelfEl = document.getElementById('rack-shelf-select');
    if (shelfEl) shelfEl.value = r.shelf_id;
    const rowEl = document.getElementById('rack-row');
    if (rowEl) rowEl.value = r.row_level || 'Tier 1';
    const colEl = document.getElementById('rack-col');
    if (colEl) colEl.value = r.col_level || 'Col 1';
    const capEl = document.getElementById('rack-capacity');
    if (capEl) capEl.value = r.max_slots;
    const countEl = document.getElementById('rack-count');
    if (countEl) countEl.value = r.stored_books;
    document.getElementById('modal-rack')?.classList.add('active');
};

window.deleteRack = function(id, name) {
    window.app.confirm(`Delete rack compartment "${name}"?`, 'Delete Rack', async () => {
        racksList = racksList.filter(r => r.id !== id);
        try { await supabase.from('racks').delete().eq('id', id); } catch(e) {}
        saveToLocalStorage();
        updateKpis();
        renderRacksTable();
        showToast(`Rack "${name}" deleted.`, 'info');
    });
};

// --- REPORTS: PDF AUDIT REPORT & CSV EXPORT ---
function setupEventListeners() {
    // Top Entity Dropdown handled in initModals

    // Generate PDF Shelf Audit Report Modal
    document.getElementById('btn-storage-pdf-report')?.addEventListener('click', () => {
        const inst = erp.getInstitutionProfile();
        document.getElementById('pdf-storage-inst-name').innerText = inst.name || 'INSTITUTION';
        document.getElementById('pdf-storage-inst-tagline').innerText = inst.tagline || 'Library Infrastructure & Storage Logistics';
        document.getElementById('pdf-storage-inst-code').innerText = inst.reg_code || 'STR-AUDIT-01';
        document.getElementById('pdf-storage-report-date').innerText = new Date().toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });

        const totalSlots = racksList.reduce((acc, r) => acc + (parseInt(r.max_slots) || 0), 0);
        const totalStored = racksList.reduce((acc, r) => acc + (parseInt(r.stored_books) || 0), 0);
        const pct = totalSlots > 0 ? Math.round((totalStored / totalSlots) * 100) : 0;

        document.getElementById('pdf-summary-wings').innerText = wingsList.length;
        document.getElementById('pdf-summary-shelves').innerText = shelvesList.length;
        document.getElementById('pdf-summary-racks').innerText = racksList.length;
        document.getElementById('pdf-summary-util').innerText = `${pct}% (${totalStored} vols)`;

        // Shelves Table Body
        document.getElementById('pdf-shelves-table-body').innerHTML = shelvesList.map(s => {
            const wing = wingsList.find(w => w.id === s.wing_id);
            const wingName = wing ? wing.name : (s.wing_name || 'Main Stacks');
            return `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 0.5rem; font-family: monospace; font-weight: bold; border: 1px solid #cbd5e1;">${s.code}</td>
                    <td style="padding: 0.5rem; font-weight: bold; border: 1px solid #cbd5e1;">${s.name}</td>
                    <td style="padding: 0.5rem; border: 1px solid #cbd5e1;">${wingName}</td>
                    <td style="padding: 0.5rem; border: 1px solid #cbd5e1;">${s.genre}</td>
                    <td style="padding: 0.5rem; text-align: center; border: 1px solid #cbd5e1;">${s.tiers} Tiers</td>
                    <td style="padding: 0.5rem; text-align: right; font-weight: bold; border: 1px solid #cbd5e1;">${s.capacity} vols</td>
                </tr>
            `;
        }).join('');

        // Racks Table Body
        document.getElementById('pdf-racks-table-body').innerHTML = racksList.map(r => {
            const rPct = r.max_slots > 0 ? Math.round((r.stored_books / r.max_slots) * 100) : 0;
            return `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 0.5rem; font-family: monospace; font-weight: bold; border: 1px solid #cbd5e1;">${r.code}</td>
                    <td style="padding: 0.5rem; font-weight: bold; border: 1px solid #cbd5e1;">${r.name}</td>
                    <td style="padding: 0.5rem; border: 1px solid #cbd5e1;">${r.shelf_name}</td>
                    <td style="padding: 0.5rem; border: 1px solid #cbd5e1;">${r.row_level}</td>
                    <td style="padding: 0.5rem; text-align: right; font-weight: bold; border: 1px solid #cbd5e1;">${r.stored_books} / ${r.max_slots}</td>
                    <td style="padding: 0.5rem; text-align: right; font-weight: bold; border: 1px solid #cbd5e1;">${rPct}%</td>
                </tr>
            `;
        }).join('');

        document.getElementById('modal-storage-pdf-preview').classList.add('active');
        playAudioChime('SUCCESS');
    });

    // CSV Export
    document.getElementById('btn-storage-csv-export')?.addEventListener('click', () => {
        let csv = 'Storage_Level,Code,Name,Location_Parent,Floor_Or_Tiers,Genre_Subject,Stored_Books_Count,Max_Capacity_Slots,Occupancy_Percent\n';

        wingsList.forEach(w => {
            csv += `"Storage_Wing","${w.code}","${w.name}","-","${w.floor}","${w.primary_focus}",-,"${w.max_capacity}",-\n`;
        });

        shelvesList.forEach(s => {
            csv += `"Book_Shelf","${s.code}","${s.name}","${s.wing_name}","${s.tiers} Tiers","${s.genre}",-,"${s.capacity}",-\n`;
        });

        racksList.forEach(r => {
            const pct = r.max_slots > 0 ? Math.round((r.stored_books / r.max_slots) * 100) : 0;
            csv += `"Rack_Compartment","${r.code}","${r.name}","${r.shelf_name}","${r.row_level}","-",${r.stored_books},${r.max_slots},"${pct}%"\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Library_Storage_Matrix_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        playAudioChime('SUCCESS');
        showToast('Library storage matrix exported to CSV!', 'success');
    });
}



// --- BULK STORAGE CREATION WIZARD (SHELVES & RACKS) ---
window.openBulkStorageModal = function(initialTab = 'shelves') {
    const modal = document.getElementById('modal-bulk-storage');
    if (!modal) return;

    // Check if at least 1 wing exists; if not, automatically seed a default primary wing
    if (wingsList.length === 0) {
        const defaultWing = {
            id: 'wing-main-1',
            code: 'WING-A',
            name: 'Main Reading & Storage Wing',
            floor: 'Floor 1',
            primary_focus: 'General Collection',
            max_capacity: 50000
        };
        wingsList.push(defaultWing);
        saveToLocalStorage();
        renderWingsTable();
        updateKpis();
    }

    populateSelectDropdowns();

    // Select tab
    const tabButtons = modal.querySelectorAll('.bulk-tab-btn');
    const formShelves = document.getElementById('form-bulk-shelves');
    const formRacks = document.getElementById('form-bulk-racks');
    const formCsv = document.getElementById('form-bulk-csv');

    tabButtons.forEach(btn => btn.classList.remove('active'));

    if (initialTab === 'racks') {
        tabButtons.forEach(btn => { if (btn.dataset.tab === 'bulk-racks-panel') btn.classList.add('active'); });
        if (formShelves) formShelves.style.display = 'none';
        if (formRacks) formRacks.style.display = 'block';
        if (formCsv) formCsv.style.display = 'none';
    } else if (initialTab === 'csv') {
        tabButtons.forEach(btn => { if (btn.dataset.tab === 'bulk-csv-panel') btn.classList.add('active'); });
        if (formShelves) formShelves.style.display = 'none';
        if (formRacks) formRacks.style.display = 'none';
        if (formCsv) formCsv.style.display = 'block';
    } else {
        tabButtons.forEach(btn => { if (btn.dataset.tab === 'bulk-shelves-panel') btn.classList.add('active'); });
        if (formShelves) formShelves.style.display = 'block';
        if (formRacks) formRacks.style.display = 'none';
        if (formCsv) formCsv.style.display = 'none';
    }

    updateBulkShelvesPreview();
    updateBulkRacksPreview();
    modal.classList.add('active');
    if (window.lucide) lucide.createIcons();
};

function updateBulkShelvesPreview() {
    const previewEl = document.getElementById('bulk-shelf-preview');
    if (!previewEl) return;

    const prefix = document.getElementById('bulk-shelf-prefix')?.value.trim().toUpperCase() || 'SH-';
    const start = parseInt(document.getElementById('bulk-shelf-start')?.value) || 1;
    const count = parseInt(document.getElementById('bulk-shelf-count')?.value) || 1;
    const pad = parseInt(document.getElementById('bulk-shelf-pad')?.value) || 2;
    const capacity = parseInt(document.getElementById('bulk-shelf-capacity')?.value) || 500;
    const tiers = parseInt(document.getElementById('bulk-shelf-tiers')?.value) || 5;
    const autoRacks = document.getElementById('bulk-shelf-auto-racks')?.checked;

    const colsPerTier = parseInt(document.getElementById('bulk-shelf-cols-per-tier')?.value) || 2;
    const slotsPerComp = parseInt(document.getElementById('bulk-shelf-slots-per-comp')?.value) || Math.round(capacity / (tiers * colsPerTier)) || 50;
    const firstCode = `${prefix}${String(start).padStart(pad, '0')}`;
    const lastCode = `${prefix}${String(start + count - 1).padStart(pad, '0')}`;
    const totalRacks = count * tiers * colsPerTier;
    const totalVols = count * tiers * colsPerTier * slotsPerComp;

    previewEl.innerHTML = `
        Will create <strong>${count}</strong> shelves: <code>${firstCode}</code> ${count > 1 ? `to <code>${lastCode}</code>` : ''} 
        (Total Capacity: <strong>${totalVols.toLocaleString()}</strong> vols)
        ${autoRacks ? `<span style="display:block; margin-top: 4px; color: var(--brand-accent);">⚡ + Automatically generates 2D matrix: <strong>${tiers} Rows × ${colsPerTier} Columns</strong> = <strong>${tiers * colsPerTier}</strong> rack compartments per shelf (${totalRacks} total compartments)</span>` : ''}
    `;
}

function updateBulkRacksPreview() {
    const previewEl = document.getElementById('bulk-rack-preview');
    if (!previewEl) return;

    const prefix = document.getElementById('bulk-rack-prefix')?.value.trim().toUpperCase() || 'RK-';
    const rows = parseInt(document.getElementById('bulk-rack-rows-count')?.value) || 4;
    const cols = parseInt(document.getElementById('bulk-rack-cols-count')?.value) || 3;
    const capacity = parseInt(document.getElementById('bulk-rack-capacity')?.value) || 50;
    const pattern = document.getElementById('bulk-rack-naming-pattern')?.value || 'MATRIX';

    const totalComps = rows * cols;
    const totalSlots = totalComps * capacity;
    const sampleFirst = pattern === 'MATRIX' ? `${prefix}R1C1` : `${prefix}01`;
    const sampleLast = pattern === 'MATRIX' ? `${prefix}R${rows}C${cols}` : `${prefix}${String(totalComps).padStart(2, '0')}`;

    previewEl.innerHTML = `
        Will generate a 2D Shelf Matrix: <strong>${rows} Tiers (Rows) × ${cols} Bays (Columns)</strong> = <strong>${totalComps}</strong> rack compartments!
        <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 3px;">
            Coordinate range: <code>${sampleFirst}</code> to <code>${sampleLast}</code> (Total Shelf Capacity: <strong>${totalSlots.toLocaleString()}</strong> slots)
        </div>
    `;
}

function initBulkStorageModal() {
    const modal = document.getElementById('modal-bulk-storage');
    if (!modal) return;

    // Close buttons
    modal.querySelectorAll('.close-bulk-modal').forEach(b => {
        b.addEventListener('click', () => modal.classList.remove('active'));
    });
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
    });

    // Tab switcher
    const tabButtons = modal.querySelectorAll('.bulk-tab-btn');
    const formShelves = document.getElementById('form-bulk-shelves');
    const formRacks = document.getElementById('form-bulk-racks');
    const formCsv = document.getElementById('form-bulk-csv');

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            if (formShelves) formShelves.style.display = 'none';
            if (formRacks) formRacks.style.display = 'none';
            if (formCsv) formCsv.style.display = 'none';

            if (btn.dataset.tab === 'bulk-shelves-panel' && formShelves) {
                formShelves.style.display = 'block';
                updateBulkShelvesPreview();
            } else if (btn.dataset.tab === 'bulk-racks-panel' && formRacks) {
                formRacks.style.display = 'block';
                updateBulkRacksPreview();
            } else if (btn.dataset.tab === 'bulk-csv-panel' && formCsv) {
                formCsv.style.display = 'block';
                populateSelectDropdowns();
            }
        });
    });

    // Live preview inputs for Shelves
    ['bulk-shelf-prefix', 'bulk-shelf-start', 'bulk-shelf-count', 'bulk-shelf-pad', 'bulk-shelf-capacity', 'bulk-shelf-tiers'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', updateBulkShelvesPreview);
    });
    document.getElementById('bulk-shelf-auto-racks')?.addEventListener('change', updateBulkShelvesPreview);

    // Live preview inputs for Racks
    ['bulk-rack-prefix', 'bulk-rack-rows-count', 'bulk-rack-cols-count', 'bulk-rack-capacity', 'bulk-rack-naming-pattern'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', updateBulkRacksPreview);
    });

    // Tier mode switcher
    const tierModeSelect = document.getElementById('bulk-rack-tier-mode');
    const customRowGroup = document.getElementById('bulk-rack-custom-row-group');
    tierModeSelect?.addEventListener('change', () => {
        if (customRowGroup) {
            customRowGroup.style.display = (tierModeSelect.value === 'CUSTOM') ? 'block' : 'none';
        }
    });

    // CSV Type switcher
    const csvTypeSelect = document.getElementById('bulk-csv-type');
    const csvParentLabel = document.getElementById('bulk-csv-parent-label');
    const csvHint = document.getElementById('bulk-csv-hint');
    const csvText = document.getElementById('bulk-csv-text');

    csvTypeSelect?.addEventListener('change', () => {
        populateSelectDropdowns();
        if (csvTypeSelect.value === 'racks') {
            if (csvParentLabel) csvParentLabel.innerText = 'Parent Shelf *';
            if (csvHint) csvHint.innerHTML = 'Format: <code>Code, Name, Row/Tier, Capacity, Stored</code> (One record per line)';
            if (csvText) csvText.placeholder = `RK-01, Upper Tier, Tier 1, 80, 0\nRK-02, Mid Tier, Tier 2, 80, 0`;
        } else {
            if (csvParentLabel) csvParentLabel.innerText = 'Parent Storage Wing *';
            if (csvHint) csvHint.innerHTML = 'Format: <code>Code, Name, Genre, Tiers, Capacity</code> (One record per line)';
            if (csvText) csvText.placeholder = `SH-101, Science & Tech, Technology, 5, 500\nSH-102, Islamic Studies, Religion, 6, 600`;
        }
    });

    // Load CSV Sample button
    document.getElementById('btn-bulk-load-sample')?.addEventListener('click', () => {
        if (csvTypeSelect?.value === 'racks') {
            if (csvText) csvText.value = `RK-01, Upper Tier A, Tier 1, 80, 15\nRK-02, Upper Tier B, Tier 1, 80, 20\nRK-03, Center Tier A, Tier 2, 100, 45\nRK-04, Center Tier B, Tier 2, 100, 30\nRK-05, Bottom Tier, Tier 3, 120, 10`;
        } else {
            if (csvText) csvText.value = `SH-201, Artificial Intelligence & ML, Computer Science, 5, 600\nSH-202, Data Science & Big Data, Computer Science, 5, 600\nSH-203, World History & Archives, History, 6, 750\nSH-204, Islamic Jurisprudence (Fiqh), Theology, 6, 800\nSH-205, Modern Arabic Literature, Languages, 4, 450`;
        }
    });

    // 1. Submit Bulk Shelves
    formShelves?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const wingId = document.getElementById('bulk-shelf-wing')?.value;
        const wing = wingsList.find(w => w.id === wingId);
        if (!wing) {
            showToast('Please select a storage wing', 'warning');
            return;
        }

        const prefix = document.getElementById('bulk-shelf-prefix').value.trim().toUpperCase() || 'SH-';
        const baseName = document.getElementById('bulk-shelf-name').value.trim() || 'Book Shelf';
        const start = parseInt(document.getElementById('bulk-shelf-start').value) || 1;
        const count = parseInt(document.getElementById('bulk-shelf-count').value) || 5;
        const pad = parseInt(document.getElementById('bulk-shelf-pad').value) || 2;
        const genre = document.getElementById('bulk-shelf-genre').value.trim() || 'General Literature';
        const tiers = parseInt(document.getElementById('bulk-shelf-tiers').value) || 5;
        const capacity = parseInt(document.getElementById('bulk-shelf-capacity').value) || 500;
        const autoRacks = document.getElementById('bulk-shelf-auto-racks').checked;

        const newShelves = [];
        const newRacks = [];
        const now = Date.now();

        for (let i = 0; i < count; i++) {
            const num = start + i;
            const numStr = String(num).padStart(pad, '0');
            const code = `${prefix}${numStr}`;
            const name = `${baseName} ${numStr}`;
            const shelfId = `shelf-${now}-${i}`;

            const shelfObj = {
                id: shelfId,
                code: code,
                name: name,
                wing_id: wing.id,
                wing_name: wing.name,
                genre: genre,
                tiers: tiers,
                capacity: capacity
            };
            newShelves.push(shelfObj);

            if (autoRacks) {
                const colsPerTier = parseInt(document.getElementById('bulk-shelf-cols-per-tier')?.value) || 2;
                const slotsPerComp = parseInt(document.getElementById('bulk-shelf-slots-per-comp')?.value) || Math.round(capacity / (tiers * colsPerTier)) || 50;

                for (let t = 1; t <= tiers; t++) {
                    for (let c = 1; c <= colsPerTier; c++) {
                        newRacks.push({
                            id: `rack-${now}-${i}-${t}-${c}`,
                            code: `${code}-R${t}C${c}`,
                            name: `Tier ${t} • Bay ${c}`,
                            shelf_id: shelfId,
                            shelf_name: name,
                            row_level: `Tier ${t}`,
                            col_level: `Col ${c}`,
                            max_slots: slotsPerComp,
                            stored_books: 0
                        });
                    }
                }
            }
        }

        shelvesList.push(...newShelves);
        if (newRacks.length > 0) {
            racksList.push(...newRacks);
        }

        saveToLocalStorage();
        updateKpis();
        renderShelvesTable();
        renderRacksTable();
        populateSelectDropdowns();
        modal.classList.remove('active');
        playAudioChime('SUCCESS');
        showToast(`Generated ${newShelves.length} shelves${newRacks.length > 0 ? ` & ${newRacks.length} rack tiers` : ''} successfully!`, 'success');
    });

    // 2. Submit Bulk Racks
    formRacks?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const shelfId = document.getElementById('bulk-rack-shelf')?.value;
        const shelf = shelvesList.find(s => s.id === shelfId);
        if (!shelf) {
            showToast('Please select or create a book shelf first', 'warning');
            return;
        }

        const prefix = document.getElementById('bulk-rack-prefix').value.trim().toUpperCase() || 'RK-';
        const baseName = document.getElementById('bulk-rack-name').value.trim() || 'Compartment';
        const rows = parseInt(document.getElementById('bulk-rack-rows-count').value) || 4;
        const cols = parseInt(document.getElementById('bulk-rack-cols-count').value) || 3;
        const pattern = document.getElementById('bulk-rack-naming-pattern')?.value || 'MATRIX';
        const capacity = parseInt(document.getElementById('bulk-rack-capacity').value) || 50;
        const stored = parseInt(document.getElementById('bulk-rack-stored').value) || 0;

        const newRacks = [];
        const now = Date.now();
        let counter = 1;

        for (let r = 1; r <= rows; r++) {
            for (let c = 1; c <= cols; c++) {
                const code = (pattern === 'MATRIX') 
                    ? `${prefix}R${r}C${c}` 
                    : `${prefix}${String(counter).padStart(2, '0')}`;
                const name = `${baseName} (Tier ${r} • Bay ${c})`;

                newRacks.push({
                    id: `rack-${now}-${r}-${c}`,
                    code: code,
                    name: name,
                    shelf_id: shelf.id,
                    shelf_name: shelf.name,
                    row_level: `Tier ${r}`,
                    col_level: `Col ${c}`,
                    max_slots: capacity,
                    stored_books: stored
                });
                counter++;
            }
        }

        racksList.push(...newRacks);
        saveToLocalStorage();
        updateKpis();
        renderRacksTable();
        modal.classList.remove('active');
        playAudioChime('SUCCESS');
        showToast(`Generated ${newRacks.length} rack compartments successfully!`, 'success');
    });

    // 3. Submit Quick CSV Import
    formCsv?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const type = document.getElementById('bulk-csv-type')?.value;
        const parentId = document.getElementById('bulk-csv-parent-select')?.value;
        const text = document.getElementById('bulk-csv-text')?.value.trim();

        if (!text) {
            showToast('Please enter or paste data to import', 'warning');
            return;
        }

        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        let importedCount = 0;
        const now = Date.now();

        if (type === 'shelves') {
            const wing = wingsList.find(w => w.id === parentId) || wingsList[0];
            const added = [];

            lines.forEach((line, idx) => {
                // Skip header if present
                if (idx === 0 && (line.toLowerCase().startsWith('code') || line.toLowerCase().includes('shelf code'))) return;
                const parts = line.includes('\t') ? line.split('\t') : line.split(',');
                if (parts.length >= 2) {
                    const code = parts[0]?.trim().toUpperCase();
                    const name = parts[1]?.trim();
                    const genre = parts[2]?.trim() || 'General Collection';
                    const tiers = parseInt(parts[3]?.trim()) || 5;
                    const cap = parseInt(parts[4]?.trim()) || 500;

                    if (code && name) {
                        added.push({
                            id: `shelf-${now}-${idx}`,
                            code: code,
                            name: name,
                            wing_id: wing ? wing.id : 'wing-main-1',
                            wing_name: wing ? wing.name : 'Main Storage Wing',
                            genre: genre,
                            tiers: tiers,
                            capacity: cap
                        });
                        importedCount++;
                    }
                }
            });

            if (added.length > 0) {
                shelvesList.push(...added);
                saveToLocalStorage();
                updateKpis();
                renderShelvesTable();
                populateSelectDropdowns();
            }
        } else {
            const shelf = shelvesList.find(s => s.id === parentId) || shelvesList[0];
            const added = [];

            lines.forEach((line, idx) => {
                if (idx === 0 && (line.toLowerCase().startsWith('code') || line.toLowerCase().includes('rack code'))) return;
                const parts = line.includes('\t') ? line.split('\t') : line.split(',');
                if (parts.length >= 2) {
                    const code = parts[0]?.trim().toUpperCase();
                    const name = parts[1]?.trim();
                    const rowLevel = parts[2]?.trim() || 'Tier 1';
                    const cap = parseInt(parts[3]?.trim()) || 80;
                    const stored = parseInt(parts[4]?.trim()) || 0;

                    if (code && name) {
                        added.push({
                            id: `rack-${now}-${idx}`,
                            code: code,
                            name: name,
                            shelf_id: shelf ? shelf.id : 'shelf-1',
                            shelf_name: shelf ? shelf.name : 'General Shelf',
                            row_level: rowLevel,
                            max_slots: cap,
                            stored_books: stored
                        });
                        importedCount++;
                    }
                }
            });

            if (added.length > 0) {
                racksList.push(...added);
                saveToLocalStorage();
                updateKpis();
                renderRacksTable();
            }
        }

        if (importedCount > 0) {
            modal.classList.remove('active');
            playAudioChime('SUCCESS');
            showToast(`Imported ${importedCount} ${type} successfully!`, 'success');
            document.getElementById('bulk-csv-text').value = '';
        } else {
            showToast('No valid rows found. Please check your format.', 'warning');
        }
    });
}


// --- MOVE / COPY STORAGE UNITS ENGINE (SHELVES & RACKS) ---
window.openMoveCopyModal = function(entityType, rawIds) {
    const modal = document.getElementById('modal-move-copy-storage');
    if (!modal) return;

    const ids = Array.isArray(rawIds) ? rawIds : [rawIds];
    if (!ids || ids.length === 0) {
        showToast('No items selected to transfer', 'warning');
        return;
    }

    document.getElementById('move-copy-entity-type').value = entityType;
    document.getElementById('move-copy-entity-ids').value = JSON.stringify(ids);

    const titleEl = document.getElementById('modal-move-copy-title');
    const subtitleEl = document.getElementById('modal-move-copy-subtitle');
    const summaryEl = document.getElementById('move-copy-units-summary');
    const destLabel = document.getElementById('move-copy-dest-label');
    const destSelect = document.getElementById('move-copy-dest-select');

    if (entityType === 'shelf') {
        titleEl.innerText = ids.length === 1 ? 'Move or Copy Book Shelf' : `Move or Copy ${ids.length} Book Shelves`;
        subtitleEl.innerText = 'Transfer or duplicate shelf units across storage wings';
        destLabel.innerText = 'Destination Storage Wing *';

        // Populate destination wings
        destSelect.innerHTML = wingsList.map(w => `<option value="${w.id}">${w.name} (${w.code}) - ${w.floor}</option>`).join('');

        if (ids.length === 1) {
            const shelf = shelvesList.find(s => s.id === ids[0]);
            summaryEl.innerHTML = `Target Shelf: <strong>${shelf ? shelf.name : ids[0]}</strong> (${shelf ? shelf.code : ''}) &bull; Current: ${shelf ? shelf.wing_name : 'Wing'}`;
        } else {
            summaryEl.innerHTML = `Target: <strong>${ids.length} Book Shelves</strong> selected for transfer`;
        }
    } else {
        titleEl.innerText = ids.length === 1 ? 'Move or Copy Rack Compartment' : `Move or Copy ${ids.length} Rack Compartments`;
        subtitleEl.innerText = 'Transfer or duplicate rack compartments across book shelves';
        destLabel.innerText = 'Destination Book Shelf *';

        // Populate destination shelves (grouped with parent wing)
        destSelect.innerHTML = shelvesList.map(s => `<option value="${s.id}">${s.name} (${s.code}) &bull; ${s.wing_name || 'Wing'}</option>`).join('');

        if (ids.length === 1) {
            const rack = racksList.find(r => r.id === ids[0]);
            summaryEl.innerHTML = `Target Rack: <strong>${rack ? rack.name : ids[0]}</strong> (${rack ? rack.code : ''}) &bull; Current Shelf: ${rack ? rack.shelf_name : 'Shelf'}`;
        } else {
            summaryEl.innerHTML = `Target: <strong>${ids.length} Rack Compartments</strong> selected for transfer`;
        }
    }

    modal.classList.add('active');
    if (window.lucide) lucide.createIcons();
};

function initMoveCopyModal() {
    const modal = document.getElementById('modal-move-copy-storage');
    if (!modal) return;

    modal.querySelectorAll('.close-move-copy-modal').forEach(b => {
        b.addEventListener('click', () => modal.classList.remove('active'));
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
    });

    // Form submit
    document.getElementById('form-move-copy-storage')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const entityType = document.getElementById('move-copy-entity-type').value;
        const ids = JSON.parse(document.getElementById('move-copy-entity-ids').value || '[]');
        const operation = document.querySelector('input[name="move-copy-operation"]:checked')?.value || 'MOVE';
        const destId = document.getElementById('move-copy-dest-select').value;
        const includeBooks = document.getElementById('move-copy-include-books').checked;

        if (!destId) {
            showToast('Please select a target destination', 'warning');
            return;
        }

        const now = Date.now();

        if (entityType === 'shelf') {
            const destWing = wingsList.find(w => w.id === destId);
            if (!destWing) {
                showToast('Destination wing not found', 'warning');
                return;
            }

            if (operation === 'MOVE') {
                // MOVE SHELVES
                shelvesList.forEach(s => {
                    if (ids.includes(s.id)) {
                        s.wing_id = destWing.id;
                        s.wing_name = destWing.name;
                        if (!includeBooks) {
                            s.stored_books = 0;
                            // Reset child racks stored volumes since books stay behind
                            racksList.filter(r => r.shelf_id === s.id).forEach(r => { r.stored_books = 0; });
                        }
                    }
                });

                // Update Supabase if available
                try {
                    await supabase.from('shelves').update({ wing_id: destWing.id }).in('id', ids);
                    if (!includeBooks) {
                        await supabase.from('book_copies').update({ shelf_id: null, rack_id: null }).in('shelf_id', ids);
                    }
                } catch(err) {}

                showToast(`Moved ${ids.length} shelf(s) to "${destWing.name}"${includeBooks ? ' with books transferred' : ' as empty storage'}.`, 'success');
            } else {
                // COPY SHELVES
                const newShelves = [];
                const newRacks = [];

                ids.forEach((id, idx) => {
                    const originalShelf = shelvesList.find(s => s.id === id);
                    if (!originalShelf) return;

                    const rnd = Math.floor(100 + Math.random() * 900);
                    const clonedShelfId = `shelf-${now}-${idx}-${rnd}`;
                    const clonedShelf = {
                        ...originalShelf,
                        id: clonedShelfId,
                        code: `${originalShelf.code}-C${rnd}`,
                        name: `${originalShelf.name} (Copy)`,
                        wing_id: destWing.id,
                        wing_name: destWing.name,
                        stored_books: includeBooks ? (originalShelf.stored_books || 0) : 0
                    };
                    newShelves.push(clonedShelf);

                    // Also copy all child racks under this shelf
                    const childRacks = racksList.filter(r => r.shelf_id === originalShelf.id);
                    childRacks.forEach((r, rIdx) => {
                        const rackRnd = Math.floor(100 + Math.random() * 900);
                        newRacks.push({
                            ...r,
                            id: `rack-${now}-${idx}-${rIdx}-${rackRnd}`,
                            code: `${r.code}-C${rackRnd}`,
                            name: `${r.name} (Copy)`,
                            shelf_id: clonedShelfId,
                            shelf_name: clonedShelf.name,
                            stored_books: includeBooks ? (r.stored_books || 0) : 0
                        });
                    });
                });

                shelvesList.push(...newShelves);
                if (newRacks.length > 0) racksList.push(...newRacks);
                showToast(`Copied ${newShelves.length} shelf(s) to "${destWing.name}"${includeBooks ? ' with book copies' : ' as empty units'}.`, 'success');
            }

            selectedShelfIds.clear();
        } else {
            // RACKS
            const destShelf = shelvesList.find(s => s.id === destId);
            if (!destShelf) {
                showToast('Destination shelf not found', 'warning');
                return;
            }

            if (operation === 'MOVE') {
                // MOVE RACKS
                racksList.forEach(r => {
                    if (ids.includes(r.id)) {
                        r.shelf_id = destShelf.id;
                        r.shelf_name = destShelf.name;
                        if (!includeBooks) {
                            r.stored_books = 0;
                        }
                    }
                });

                // Update Supabase if available
                try {
                    await supabase.from('racks').update({ shelf_id: destShelf.id }).in('id', ids);
                    if (includeBooks) {
                        await supabase.from('book_copies').update({ shelf_id: destShelf.id }).in('rack_id', ids);
                    } else {
                        await supabase.from('book_copies').update({ rack_id: null }).in('rack_id', ids);
                    }
                } catch(err) {}

                showToast(`Moved ${ids.length} rack(s) to "${destShelf.name}"${includeBooks ? ' with books transferred' : ' as empty compartments'}.`, 'success');
            } else {
                // COPY RACKS
                const newRacks = [];

                ids.forEach((id, idx) => {
                    const originalRack = racksList.find(r => r.id === id);
                    if (!originalRack) return;

                    const rnd = Math.floor(100 + Math.random() * 900);
                    newRacks.push({
                        ...originalRack,
                        id: `rack-${now}-${idx}-${rnd}`,
                        code: `${originalRack.code}-C${rnd}`,
                        name: `${originalRack.name} (Copy)`,
                        shelf_id: destShelf.id,
                        shelf_name: destShelf.name,
                        stored_books: includeBooks ? (originalRack.stored_books || 0) : 0
                    });
                });

                racksList.push(...newRacks);
                showToast(`Copied ${newRacks.length} rack(s) to "${destShelf.name}"${includeBooks ? ' with book counts' : ' as empty compartments'}.`, 'success');
            }

            selectedRackIds.clear();
        }

        modal.classList.remove('active');
        playAudioChime('SUCCESS');
        syncStorageHierarchies();
        saveToLocalStorage();
        updateKpis();
        renderWingsTable();
        renderShelvesTable();
        renderRacksTable();
        if (bulkBar) bulkBar.hide();
    });
}
