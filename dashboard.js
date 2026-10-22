import { supabase } from './supabaseClient.js';
import { checkSession } from './auth.js';

let circulationChartInstance = null;

function formatRelativeTime(dateStr) {
    if (!dateStr) return 'Recently';
    const date = new Date(dateStr);
    const now = new Date();
    const diffSec = Math.floor((now - date) / 1000);

    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

async function initDashboard() {
    const user = await checkSession();
    if (!user) return;

    // 0. Update Date Badge
    const dateBadge = document.getElementById('dashboard-date-badge');
    if (dateBadge) {
        const today = new Date();
        dateBadge.innerText = today.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
    }

    // 1. Fetch Books Count (with fallback if copies table empty)
    try {
        const { count: copiesCount } = await supabase.from('book_copies').select('id', { count: 'exact', head: true });
        const { count: booksCount } = await supabase.from('books').select('id', { count: 'exact', head: true });
        const total = (copiesCount && copiesCount > 0) ? copiesCount : (booksCount || 0);
        const el = document.getElementById('stat-total-books');
        if (el) el.innerText = total.toLocaleString();
    } catch (err) {
        console.error("Error fetching books count:", err);
    }

    // 2. Fetch Active Loans
    try {
        const { count: loansCount } = await supabase.from('loans').select('id', { count: 'exact', head: true }).eq('status', 'ACTIVE');
        const el = document.getElementById('stat-active-issues');
        if (el) el.innerText = (loansCount || 0).toLocaleString();
    } catch (err) {
        const el = document.getElementById('stat-active-issues');
        if (el) el.innerText = "0";
    }

    // 3. Fetch Overdue Loans
    try {
        const { count: overdueCount } = await supabase.from('loans').select('id', { count: 'exact', head: true })
            .eq('status', 'ACTIVE')
            .lt('due_date', new Date().toISOString());
        const el = document.getElementById('stat-overdue');
        if (el) el.innerText = (overdueCount || 0).toLocaleString();
    } catch (err) {
        const el = document.getElementById('stat-overdue');
        if (el) el.innerText = "0";
    }

    // 4. Fetch Members Count
    try {
        const { count: membersCount } = await supabase.from('students').select('id', { count: 'exact', head: true }).eq('status', 'ACTIVE');
        const el = document.getElementById('stat-members');
        if (el) el.innerText = (membersCount || 0).toLocaleString();
    } catch (err) {
        const el = document.getElementById('stat-members');
        if (el) el.innerText = "0";
    }

    // 5. Load Chart Data & Activity Feed
    await Promise.all([
        loadChartData(),
        loadRecentActivityFeed()
    ]);
}

async function loadChartData() {
    const ctx = document.getElementById('circulationChart');
    if (!ctx) return;

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const labels = [];
    const issueCounts = {};
    const returnCounts = {};

    for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const monthString = monthNames[d.getMonth()];
        labels.push(monthString);
        issueCounts[monthString] = 0;
        returnCounts[monthString] = 0;
    }

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1); 
    sixMonthsAgo.setHours(0, 0, 0, 0);

    try {
        const { data: recentLoans } = await supabase
            .from('loans')
            .select('created_at, returned_at, status')
            .gte('created_at', sixMonthsAgo.toISOString());

        if (recentLoans) {
            recentLoans.forEach(loan => {
                if (loan.created_at) {
                    const m = monthNames[new Date(loan.created_at).getMonth()];
                    if (issueCounts[m] !== undefined) issueCounts[m]++;
                }
                if (loan.returned_at) {
                    const rm = monthNames[new Date(loan.returned_at).getMonth()];
                    if (returnCounts[rm] !== undefined) returnCounts[rm]++;
                }
            });
        }
    } catch (err) {
        console.warn("Could not fetch loans chart data", err);
    }

    const issueData = labels.map(l => issueCounts[l]);
    const returnData = labels.map(l => returnCounts[l]);

    renderChart(ctx, labels, issueData, returnData);
}

function renderChart(ctx, labels, issueData, returnData) {
    if (circulationChartInstance) {
        circulationChartInstance.destroy();
    }

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#94a3b8' : '#64748b';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';

    circulationChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Books Issued',
                    data: issueData,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.12)',
                    borderWidth: 2.5,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#3b82f6',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6
                },
                {
                    label: 'Books Returned',
                    data: returnData,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.08)',
                    borderWidth: 2.5,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#10b981',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(15, 23, 42, 0.9)',
                    titleFont: { size: 12, family: "'Plus Jakarta Sans', sans-serif" },
                    bodyFont: { size: 13, family: "'Plus Jakarta Sans', sans-serif", weight: 'bold' },
                    padding: 12,
                    cornerRadius: 10,
                    boxPadding: 4
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { precision: 0, color: textColor, font: { family: "'Plus Jakarta Sans', sans-serif" } }, 
                    grid: { color: gridColor },
                    border: { display: false }
                },
                x: {
                    ticks: { color: textColor, font: { family: "'Plus Jakarta Sans', sans-serif" } },
                    grid: { display: false },
                    border: { display: false }
                }
            },
            interaction: {
                intersect: false,
                mode: 'index',
            },
        }
    });
}

// Window listener to re-render chart on theme toggle
window.addEventListener('themeChanged', () => {
    loadChartData();
});

async function loadRecentActivityFeed() {
    const feedContainer = document.getElementById('recent-activity-feed');
    if (!feedContainer) return;

    try {
        // Fetch recent loans and returns
        const { data: loans, error } = await supabase
            .from('loans')
            .select(`
                id, status, created_at, returned_at, due_date,
                students(name, student_id),
                book_copies(barcode, books(title))
            `)
            .order('created_at', { ascending: false })
            .limit(7);

        if (error || !loans || loans.length === 0) {
            feedContainer.innerHTML = `
                <div style="padding: 2rem 1rem; text-align: center; color: var(--text-muted);">
                    <i data-lucide="check-circle-2" style="width: 28px; height: 28px; color: var(--success); margin-bottom: 0.5rem; opacity: 0.7;"></i>
                    <p style="font-size: 0.85rem; font-weight: 500;">No recent circulation transactions found.</p>
                    <p style="font-size: 0.75rem; margin-top: 0.25rem;">Start scanning at the Circulation desk to see activity here.</p>
                </div>
            `;
            if (window.lucide) lucide.createIcons();
            return;
        }

        let feedHtml = '';
        loans.forEach(loan => {
            const isReturned = loan.status === 'RETURNED';
            const studentName = loan.students?.name || 'Student';
            const bookTitle = loan.book_copies?.books?.title || 'Library Book';
            const timeAgo = formatRelativeTime(isReturned ? loan.returned_at : loan.created_at);

            feedHtml += `
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 0.85rem; border-radius: var(--radius-sm); background: var(--bg-surface); border: 1px solid var(--border-color); gap: 0.75rem;">
                    <div style="display: flex; align-items: center; gap: 0.75rem; min-width: 0;">
                        <div style="width: 32px; height: 32px; border-radius: 8px; background: ${isReturned ? 'rgba(16,185,129,0.1)' : 'rgba(59,130,246,0.1)'}; color: ${isReturned ? 'var(--success)' : 'var(--brand-primary)'}; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                            <i data-lucide="${isReturned ? 'book-down' : 'book-up'}" style="width: 16px; height: 16px;"></i>
                        </div>
                        <div style="min-width: 0;">
                            <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                ${studentName} <span style="font-weight: 400; color: var(--text-secondary);">${isReturned ? 'returned' : 'borrowed'}</span> ${bookTitle}
                            </div>
                            <div style="font-size: 0.7rem; color: var(--text-muted);">
                                ${loan.book_copies?.barcode ? `Barcode: <span style="font-family: monospace;">${loan.book_copies.barcode}</span> • ` : ''}${timeAgo}
                            </div>
                        </div>
                    </div>
                    <span class="badge badge-${isReturned ? 'success' : 'brand'}" style="font-size: 0.65rem; padding: 0.2rem 0.5rem; flex-shrink: 0;">
                        ${isReturned ? 'Returned' : 'Active'}
                    </span>
                </div>
            `;
        });

        feedContainer.innerHTML = feedHtml;
        if (window.lucide) lucide.createIcons();
    } catch (err) {
        feedContainer.innerHTML = `<div style="padding: 1rem; text-align: center; color: var(--danger); font-size: 0.85rem;">Failed to load activity feed.</div>`;
    }
}

document.getElementById('btn-refresh-feed')?.addEventListener('click', () => {
    loadRecentActivityFeed();
    if (window.app?.toast) window.app.toast("Activity feed updated", "info", "Refreshed", 2000);
});

document.addEventListener('DOMContentLoaded', initDashboard);