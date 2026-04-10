// frontend/js/dashboard.js

// ---------------------------------------------------------------------------
// Global state
// ---------------------------------------------------------------------------
let allTransactions = [];
let allCategories = [];
let allAccounts = [];
let filteredTransactions = [];
let currentSort = { column: 'date', direction: 'desc' };
let currentPage = 1;
let pageSize = 50;
let isLoading = false;
let currentAccountId = 'all';

// ---------------------------------------------------------------------------
// Initialise
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const token = await window.checkAuth();
        if (!token) { console.error('No valid auth, redirecting'); return; }

        document.getElementById('userEmail').textContent = localStorage.getItem('user_email') || 'User';

        bindEvent('uploadBtn',         'click',  uploadFiles);
        bindEvent('fixCategoriesBtn',  'click',  fixUncategorised);
        bindEvent('generateMonthlyReviewBtn', 'click', generateMonthlyReview);
        bindEvent('searchInput',       'input',  () => { currentPage = 1; filterAndRenderTable(); });
        bindEvent('categoryFilter',    'change', () => { currentPage = 1; filterAndRenderTable(); });
        bindEvent('accountFilter',     'change', async (e) => {
            currentAccountId = e.target.value;
            showLoading(true);
            await loadDashboard();
            showLoading(false);
        });
        bindEvent('uploadAccount',     'change', (e) => {
            const btn = document.getElementById('uploadBtn');
            if (btn) btn.disabled = !e.target.value;
        });
        bindEvent('thDate',            'click',  () => sortTable('date'));
        bindEvent('thCategory',        'click',  () => sortTable('category'));
        bindEvent('thAmount',          'click',  () => sortTable('amount'));
        bindEvent('btnFirst',          'click',  () => goToPage(1));
        bindEvent('btnPrev',           'click',  () => goToPage(currentPage - 1));
        bindEvent('btnNext',           'click',  () => goToPage(currentPage + 1));
        bindEvent('btnLast',           'click',  () => goToPage(totalPages()));
        bindEvent('pageSizeSelect',    'change', (e) => { pageSize = parseInt(e.target.value); currentPage = 1; renderTransactionsTable(); });

        // Delegated listener for category dropdowns in dynamically rendered rows
        document.getElementById('transactionsTable')?.addEventListener('change', async (e) => {
            if (e.target.tagName === 'SELECT' && e.target.dataset.transactionId) {
                await updateCategory(e.target.dataset.transactionId, e.target.value);
            }
        });

        showLoading(true);
        await loadAccounts();
        await loadCategories();
        await loadDashboard();
        showLoading(false);
    } catch (err) {
        console.error('Dashboard initialisation failed', err);
    }
});

// ---------------------------------------------------------------------------
// Helper: safely bind an event listener
// ---------------------------------------------------------------------------
function bindEvent(id, event, handler) {
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, handler);
    else console.warn(`bindEvent: element #${id} not found - listener not attached`);
}

// ---------------------------------------------------------------------------
// File upload
// ---------------------------------------------------------------------------
async function uploadFiles() {
    console.log('[uploadFiles] called');
    const input = document.getElementById('fileInput');
    if (!input || input.files.length === 0) { alert('Please select a file to upload'); return; }

    const status = document.getElementById('uploadStatus');
    const uploadAccount = document.getElementById('uploadAccount')?.value;
    if (!uploadAccount) { alert('Please select an account first'); return; }
    const files = input.files;
    status.textContent = 'Uploading...';
    status.style.color = '#3b82f6';

    let successCount = 0, duplicateCount = 0, errorCount = 0;

    for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        try {
            const result = await api.uploadFile(formData, uploadAccount);
            if (result?.success) successCount++;
        } catch (error) {
            console.error('Upload error:', error);
            if (error.message?.includes('already exists')) duplicateCount++;
            else errorCount++;
        }
    }

    input.value = '';
    let finalMessage = '';
    if (successCount > 0)   finalMessage += `${successCount} file(s) uploaded`;
    if (duplicateCount > 0) finalMessage += (finalMessage ? ', ' : '') + `${duplicateCount} duplicate(s) skipped`;
    if (errorCount > 0)     finalMessage += (finalMessage ? ', ' : '') + `${errorCount} error(s)`;

    status.textContent = finalMessage + '. Refreshing...';
    status.style.color = successCount > 0 ? '#10b981' : '#f59e0b';

    if (successCount > 0) {
        setTimeout(async () => {
            showLoading(true);
            await loadDashboard();
            showLoading(false);
            status.textContent = finalMessage;
        }, 1000);
    }
}

async function loadAccounts() {
    try {
        const data = await api.getAccounts();
        allAccounts = data?.accounts || [];
    } catch (error) {
        console.error('Failed to load accounts:', error);
        allAccounts = [];
    }
    populateAccountSelectors();
}

function populateAccountSelectors() {
    const accountFilter = document.getElementById('accountFilter');
    const uploadAccount = document.getElementById('uploadAccount');

    if (accountFilter) {
        accountFilter.innerHTML = '<option value="all">All Accounts</option>' +
            allAccounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
        accountFilter.value = currentAccountId;
    }

    if (uploadAccount) {
        uploadAccount.innerHTML = '<option value="">Select account</option>' +
            allAccounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
        const btn = document.getElementById('uploadBtn');
        if (allAccounts.length > 0) {
            const defaultAcc = allAccounts.find(a => a.is_default) || allAccounts[0];
            uploadAccount.value = defaultAcc.id;
            if (btn) btn.disabled = false;
        } else if (btn) {
            btn.disabled = true;
        }
    }
}

// ---------------------------------------------------------------------------
// Load categories
// ---------------------------------------------------------------------------
async function loadCategories() {
    try {
        const data = await api.getCategories();
        allCategories = data?.categories || ['Food', 'Transport', 'Shopping', 'Entertainment', 'Bills', 'Savings', 'Uncategorized'];
    } catch {
        allCategories = ['Food', 'Transport', 'Shopping', 'Entertainment', 'Bills', 'Savings', 'Uncategorized'];
    }
}

// ---------------------------------------------------------------------------
// Load dashboard
// ---------------------------------------------------------------------------
async function loadDashboard() {
    try {
        const data = await api.getTransactions(currentAccountId);
        if (!data?.transactions) { showEmptyState(); return; }

        allTransactions = data.transactions;
        filteredTransactions = [...allTransactions];
        currentPage = 1;

        const uncategorizedCount = allTransactions.filter(t => t.category === 'Uncategorized').length;
        document.getElementById('totalTransactions').textContent = allTransactions.length.toLocaleString();

        if (uncategorizedCount > 0) {
            document.getElementById('uncategorizedAlert').classList.remove('hidden');
            document.getElementById('uncategorizedCount').textContent =
                `${uncategorizedCount} transaction${uncategorizedCount !== 1 ? 's' : ''} need categorisation`;
            const btn = document.getElementById('fixCategoriesBtn');
            if (btn) { btn.disabled = false; btn.textContent = 'Fix with AI'; btn.classList.remove('hidden', 'opacity-75', 'cursor-not-allowed'); }
        } else {
            document.getElementById('uncategorizedAlert').classList.add('hidden');
        }

        if (allTransactions.length === 0) {
            showEmptyState();
            await loadBudgetHealth();
            await loadBudgetTrend();
            await loadReviews();
        } else {
            populateCategoryFilter();
            calculateMetrics();
            renderPieChart();
            renderLineChart();
            renderCategorySpendingChart();
            await loadBudgetHealth();
            await loadBudgetTrend();
            await loadReviews();
            sortTable('date');
        }
    } catch (error) {
        console.error('Failed to load dashboard:', error);
        showErrorState(error.message);
    }
}

function formatCurrency(value) {
    return `£${Number(value || 0).toFixed(2)}`;
}

function formatReviewDate(value) {
    if (!value) return '-';
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function renderReviewSummary(review) {
    const statusEl = document.getElementById('reviewStatus');
    const periodEl = document.getElementById('reviewPeriod');
    const spentEl = document.getElementById('reviewSpent');
    const incomeEl = document.getElementById('reviewIncome');
    const netEl = document.getElementById('reviewNet');
    const merchantsEl = document.getElementById('reviewTopMerchants');
    const flagsEl = document.getElementById('reviewFlags');
    if (!statusEl || !periodEl || !spentEl || !incomeEl || !netEl || !merchantsEl || !flagsEl) return;

    if (!review) {
        statusEl.textContent = 'No reviews found for this account scope.';
        periodEl.textContent = '-';
        spentEl.textContent = formatCurrency(0);
        incomeEl.textContent = formatCurrency(0);
        netEl.textContent = formatCurrency(0);
        merchantsEl.textContent = '-';
        flagsEl.textContent = 'None';
        return;
    }

    const summary = review.summary || {};
    const totals = summary.totals || {};
    const merchants = summary.top_merchants || [];
    const flags = summary.flags || [];

    statusEl.textContent = `Latest ${review.review_type || 'review'} generated on ${new Date(review.created_at).toLocaleString('en-GB')}`;
    periodEl.textContent = `${formatReviewDate(review.period_start)} to ${formatReviewDate(review.period_end)}`;
    spentEl.textContent = formatCurrency(totals.spent);
    incomeEl.textContent = formatCurrency(totals.income);
    netEl.textContent = formatCurrency(totals.net);
    merchantsEl.textContent = merchants.length ? merchants.map(m => `${m.merchant} (${formatCurrency(m.amount)})`).join(', ') : '-';
    flagsEl.textContent = flags.length ? flags.map(f => `${f.type} (${f.category})`).join(', ') : 'None';
}

function renderReviewHistory(reviews) {
    const historyEl = document.getElementById('reviewHistory');
    if (!historyEl) return;
    if (!reviews || reviews.length === 0) {
        historyEl.textContent = 'No reviews yet.';
        return;
    }

    historyEl.innerHTML = reviews.slice(0, 6).map((review) => {
        const totals = review.summary?.totals || {};
        const label = review.review_type === 'monthly_closeout' ? 'Monthly' : 'Upload';
        return `
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #f3f4f6; padding:0.35rem 0;">
                <span>${label} | ${formatReviewDate(review.period_start)} - ${formatReviewDate(review.period_end)}</span>
                <span style="font-weight:600;">${formatCurrency(totals.spent)}</span>
            </div>
        `;
    }).join('');
}

async function loadReviews() {
    const statusEl = document.getElementById('reviewStatus');
    if (statusEl) statusEl.textContent = 'Loading review...';
    try {
        const [latestData, historyData] = await Promise.all([
            api.getLatestReview(currentAccountId),
            api.getReviewHistory({ accountId: currentAccountId, limit: 6 }),
        ]);
        renderReviewSummary(latestData?.review || null);
        renderReviewHistory(historyData?.reviews || []);
    } catch (error) {
        console.error('Failed to load reviews:', error);
        if (statusEl) statusEl.textContent = 'Review data unavailable';
        renderReviewHistory([]);
    }
}

async function generateMonthlyReview() {
    const btn = document.getElementById('generateMonthlyReviewBtn');
    const statusEl = document.getElementById('reviewStatus');
    if (!btn) return;
    btn.disabled = true;
    btn.textContent = 'Generating...';
    try {
        await api.generateMonthlyReview(currentAccountId);
        if (statusEl) statusEl.textContent = 'Monthly review generated';
        await loadReviews();
    } catch (error) {
        console.error('Failed to generate monthly review:', error);
        if (statusEl) statusEl.textContent = `Failed to generate review: ${error.message}`;
    } finally {
        btn.disabled = false;
        btn.textContent = 'Generate Previous Month Review';
    }
}

// ---------------------------------------------------------------------------
// AI Fix uncategorised
// ---------------------------------------------------------------------------
async function fixUncategorised() {
    const btn = document.getElementById('fixCategoriesBtn');
    const countEl = document.getElementById('uncategorizedCount');
    btn.disabled = true;
    btn.textContent = 'Categorising...';
    btn.classList.add('opacity-75', 'cursor-not-allowed');
    try {
        const result = await api.categoriseTransactions(currentAccountId);
        if (result?.changed > 0) {
            countEl.textContent = `${result.changed} transaction${result.changed !== 1 ? 's' : ''} categorised!`;
            btn.classList.add('hidden');
            setTimeout(async () => { showLoading(true); await loadDashboard(); showLoading(false); }, 1500);
        } else {
            countEl.textContent = 'No new categories found - try manually categorising remaining transactions';
            btn.disabled = false;
            btn.textContent = 'Fix with AI';
            btn.classList.remove('opacity-75', 'cursor-not-allowed');
        }
    } catch (error) {
        console.error('Categorisation failed:', error);
        countEl.textContent = 'Categorisation failed - please try again';
        btn.disabled = false;
        btn.textContent = 'Fix with AI';
        btn.classList.remove('opacity-75', 'cursor-not-allowed');
    }
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------
function calculateMetrics() {
    const spending = allTransactions
        .filter(t => t.amount < 0 && t.category !== 'Transfer')
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const income   = allTransactions.filter(t => t.amount > 0).reduce((sum, t) => sum + t.amount, 0);
    const net = income - spending;
    const totalSpentEl = document.getElementById('totalSpent');
    const netSavedEl   = document.getElementById('netSaved');
    if (totalSpentEl) totalSpentEl.textContent = `£${spending.toFixed(2)}`;
    if (netSavedEl) {
        netSavedEl.textContent = `£${Math.abs(net).toFixed(2)}`;
        netSavedEl.className = `value ${net >= 0 ? 'text-green' : 'text-red'}`;
    }
}

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------
function showLoading(loading) {
    isLoading = loading;
    if (!loading) return;
    const tbody = document.getElementById('transactionsTable');
    if (tbody) tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:2rem;color:#6b7280"><div class="loading"></div><p style="margin-top:0.5rem">Loading transactions...</p></td></tr>`;
    const pieChart = document.getElementById('pieChart');
    if (pieChart) pieChart.innerHTML = `<p style="text-align:center;color:#6b7280;padding:2rem">Loading chart...</p>`;
    const lineChart = document.getElementById('lineChart');
    if (lineChart) lineChart.innerHTML = `<p style="text-align:center;color:#6b7280;padding:2rem">Loading chart...</p>`;
    const budgetTrendChart = document.getElementById('budgetTrendChart');
    if (budgetTrendChart) budgetTrendChart.innerHTML = `<p style="text-align:center;color:#6b7280;padding:2rem">Loading budget trend...</p>`;
    const budgetHealthRows = document.getElementById('budgetHealthRows');
    if (budgetHealthRows) budgetHealthRows.innerHTML = `<tr><td colspan="5" style="padding:1rem;color:#6b7280;">Loading budget health...</td></tr>`;
    const budgetHealthSummary = document.getElementById('budgetHealthSummary');
    if (budgetHealthSummary) budgetHealthSummary.textContent = 'Loading...';
    const reviewStatus = document.getElementById('reviewStatus');
    if (reviewStatus) reviewStatus.textContent = 'Loading review...';
    document.getElementById('pageIndicator').textContent = '';
    document.getElementById('transactionCount').textContent = '';
}

function showEmptyState() {
    const tbody = document.getElementById('transactionsTable');
    if (tbody) tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:2rem;color:#6b7280">No transactions yet - upload a bank statement to get started!</td></tr>`;
    const pieChart = document.getElementById('pieChart');
    if (pieChart) pieChart.innerHTML = `<p style="text-align:center;color:#6b7280;padding:2rem">Upload a statement to see spending breakdown</p>`;
    const lineChart = document.getElementById('lineChart');
    if (lineChart) lineChart.innerHTML = `<p style="text-align:center;color:#6b7280;padding:2rem">Upload a statement to see monthly trends</p>`;
    const budgetTrendChart = document.getElementById('budgetTrendChart');
    if (budgetTrendChart) budgetTrendChart.innerHTML = `<p style="text-align:center;color:#6b7280;padding:2rem">Add budget targets to see trend</p>`;
    const budgetHealthRows = document.getElementById('budgetHealthRows');
    if (budgetHealthRows) budgetHealthRows.innerHTML = `<tr><td colspan="5" style="padding:1rem;color:#6b7280;">No budget data yet.</td></tr>`;
    const budgetHealthSummary = document.getElementById('budgetHealthSummary');
    if (budgetHealthSummary) budgetHealthSummary.textContent = 'No budget data';
    const reviewStatus = document.getElementById('reviewStatus');
    if (reviewStatus) reviewStatus.textContent = 'No review yet';
    renderReviewSummary(null);
    renderReviewHistory([]);
    document.getElementById('pageIndicator').textContent = '';
    document.getElementById('transactionCount').textContent = '';
}

function showErrorState(message) {
    const tbody = document.getElementById('transactionsTable');
    if (tbody) tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:2rem;color:#ef4444">Failed to load: ${message}</td></tr>`;
}

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------
function renderPieChart() {
    const chartDiv = document.getElementById('pieChart');
    if (!allTransactions.length) {
        chartDiv.innerHTML = `<p style="text-align:center;color:#6b7280;padding:2rem">No data yet</p>`;
        return;
    }
    const categoryTotals = {};
    allTransactions.filter(t => t.amount < 0 && t.category !== 'Transfer').forEach(t => {
        const cat = t.category || 'Uncategorized';
        categoryTotals[cat] = (categoryTotals[cat] || 0) + Math.abs(t.amount);
    });
    Plotly.newPlot('pieChart', [{
        values: Object.values(categoryTotals),
        labels: Object.keys(categoryTotals),
        type: 'pie',
        marker: { colors: ['#3b82f6','#ef4444','#10b981','#f59e0b','#8b5cf6','#ec4899','#06b6d4','#f97316'] }
    }], {
        height: 300,
        margin: { t: 0, b: 0, l: 0, r: 0 },
        showlegend: true,
        legend: { orientation: 'h', y: -0.2 }
    }, { responsive: true });
}

function renderLineChart() {
    const chartDiv = document.getElementById('lineChart');
    if (!allTransactions.length) {
        chartDiv.innerHTML = `<p style="text-align:center;color:#6b7280;padding:2rem">No data yet</p>`;
        return;
    }
    const monthlyData = {};
    allTransactions.filter(t => t.amount < 0 && t.category !== 'Transfer').forEach(t => {
        const month = t.date.substring(0, 7);
        monthlyData[month] = (monthlyData[month] || 0) + Math.abs(t.amount);
    });
    const months = Object.keys(monthlyData).sort();
    Plotly.newPlot('lineChart', [{
        x: months,
        y: months.map(m => monthlyData[m]),
        type: 'scatter',
        mode: 'lines+markers',
        line: { color: '#3b82f6', width: 3 },
        marker: { size: 8 },
        fill: 'tozeroy',
        fillcolor: 'rgba(59, 130, 246, 0.1)'
    }], {
        height: 300,
        margin: { t: 20, b: 40, l: 60, r: 20 },
        xaxis: { title: 'Month' },
        yaxis: { title: 'Spending (\u00a3)' }
    }, { responsive: true });
}

function renderCategorySpendingChart() {
    const chartDiv = document.getElementById('categorySpendingChart');
    if (!chartDiv) return;
    if (!allTransactions.length) {
        chartDiv.innerHTML = `<p style="text-align:center;color:#6b7280;padding:2rem">No data yet</p>`;
        return;
    }
    const monthlyData = {};
    const spendingTxns = allTransactions.filter(t => t.amount < 0 && t.category !== 'Transfer');
    spendingTxns.forEach(t => {
        const month = t.date.substring(0, 7);
        const cat = t.category || 'Uncategorized';
        if (!monthlyData[month]) monthlyData[month] = {};
        monthlyData[month][cat] = (monthlyData[month][cat] || 0) + Math.abs(t.amount);
    });
    const months = Object.keys(monthlyData).sort();
    const categories = [...new Set(spendingTxns.map(t => t.category || 'Uncategorized'))];
    const colors = ['#3b82f6','#ef4444','#10b981','#f59e0b','#8b5cf6','#ec4899','#06b6d4','#f97316'];
    const traces = categories.map((cat, idx) => ({
        x: months,
        y: months.map(m => monthlyData[m]?.[cat] || 0),
        type: 'scatter',
        mode: 'lines+markers',
        name: cat,
        line: { color: colors[idx % colors.length], width: 3 },
        marker: { size: 7 }
    }));
    Plotly.newPlot('categorySpendingChart', traces, {
        height: 400,
        margin: { t: 30, b: 80, l: 70, r: 30 },
        xaxis: { title: 'Month', tickangle: -45 },
        yaxis: { title: 'Spending (\u00a3)', tickprefix: '\u00a3' },
        legend: { orientation: 'h', y: -0.3, x: 0.5, xanchor: 'center' },
        hovermode: 'x unified'
    }, { responsive: true });
}

// ---------------------------------------------------------------------------
// Budget health and trend
// ---------------------------------------------------------------------------
function statusBadge(status) {
    if (status === 'over_budget') return '<span style="display:inline-block;padding:0.15rem 0.5rem;border-radius:999px;background:#fee2e2;color:#991b1b;font-size:0.75rem;font-weight:600;">Over budget</span>';
    if (status === 'at_risk') return '<span style="display:inline-block;padding:0.15rem 0.5rem;border-radius:999px;background:#fef3c7;color:#92400e;font-size:0.75rem;font-weight:600;">At risk</span>';
    if (status === 'on_track') return '<span style="display:inline-block;padding:0.15rem 0.5rem;border-radius:999px;background:#dcfce7;color:#166534;font-size:0.75rem;font-weight:600;">On track</span>';
    return '<span style="display:inline-block;padding:0.15rem 0.5rem;border-radius:999px;background:#e5e7eb;color:#374151;font-size:0.75rem;font-weight:600;">No target</span>';
}

async function loadBudgetHealth() {
    const rowsEl = document.getElementById('budgetHealthRows');
    const summaryEl = document.getElementById('budgetHealthSummary');
    const emptyEl = document.getElementById('budgetHealthEmpty');
    if (!rowsEl || !summaryEl) return;

    try {
        const data = await api.getBudgetHealth(null, currentAccountId);
        const categories = data?.categories || [];
        const summary = data?.summary || { target_total: 0, actual_total: 0 };
        const monthLabel = data?.month || '';

        if (categories.length === 0) {
            rowsEl.innerHTML = '<tr><td colspan="5" style="padding:1rem;color:#6b7280;">No budget targets or spending this month.</td></tr>';
            if (emptyEl) emptyEl.classList.remove('hidden');
            summaryEl.textContent = `${monthLabel} | Target £0 | Actual £0`;
            return;
        }

        if (emptyEl) emptyEl.classList.add('hidden');
        const atRisk = categories.filter(c => c.status === 'at_risk').length;
        const over = categories.filter(c => c.status === 'over_budget').length;
        summaryEl.textContent = `${monthLabel} | Target £${summary.target_total.toFixed(2)} | Actual £${summary.actual_total.toFixed(2)} | At risk ${atRisk} | Over ${over}`;

        rowsEl.innerHTML = categories.map(c => `
            <tr style="border-bottom:1px solid #f3f4f6;">
                <td style="padding:0.5rem 0.25rem;">${c.category}</td>
                <td style="padding:0.5rem 0.25rem;">£${Number(c.target).toFixed(2)}</td>
                <td style="padding:0.5rem 0.25rem;">£${Number(c.actual).toFixed(2)}</td>
                <td style="padding:0.5rem 0.25rem;">${Number(c.percent_used).toFixed(1)}%</td>
                <td style="padding:0.5rem 0.25rem;">${statusBadge(c.status)}</td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Failed to load budget health:', error);
        rowsEl.innerHTML = '<tr><td colspan="5" style="padding:1rem;color:#ef4444;">Failed to load budget health.</td></tr>';
        summaryEl.textContent = 'Budget health unavailable';
    }
}

async function loadBudgetTrend() {
    const chartDiv = document.getElementById('budgetTrendChart');
    if (!chartDiv) return;

    try {
        const data = await api.getBudgetTrend(6, currentAccountId);
        const months = data?.months || [];
        const series = data?.series || [];

        if (months.length === 0 || series.length === 0) {
            chartDiv.innerHTML = '<p style="text-align:center;color:#6b7280;padding:2rem">No budget trend data yet</p>';
            return;
        }

        const totalsByMonth = {};
        for (const month of months) {
            totalsByMonth[month] = { target: 0, actual: 0 };
        }
        for (const point of series) {
            if (!totalsByMonth[point.month]) continue;
            totalsByMonth[point.month].target += Number(point.target || 0);
            totalsByMonth[point.month].actual += Number(point.actual || 0);
        }

        Plotly.newPlot('budgetTrendChart', [
            {
                x: months,
                y: months.map(m => Number(totalsByMonth[m].target.toFixed(2))),
                type: 'scatter',
                mode: 'lines+markers',
                name: 'Budget Target',
                line: { color: '#2563eb', width: 3, dash: 'dot' },
                marker: { size: 7 }
            },
            {
                x: months,
                y: months.map(m => Number(totalsByMonth[m].actual.toFixed(2))),
                type: 'scatter',
                mode: 'lines+markers',
                name: 'Actual Spend',
                line: { color: '#ef4444', width: 3 },
                marker: { size: 7 },
                fill: 'tozeroy',
                fillcolor: 'rgba(239,68,68,0.08)'
            }
        ], {
            height: 320,
            margin: { t: 20, b: 50, l: 60, r: 20 },
            xaxis: { title: 'Month' },
            yaxis: { title: 'Amount (\u00a3)', tickprefix: '\u00a3' },
            legend: { orientation: 'h', y: -0.25 }
        }, { responsive: true });
    } catch (error) {
        console.error('Failed to load budget trend:', error);
        chartDiv.innerHTML = '<p style="text-align:center;color:#ef4444;padding:2rem">Failed to load budget trend</p>';
    }
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------
function populateCategoryFilter() {
    const sel = document.getElementById('categoryFilter');
    if (!sel) return;
    sel.innerHTML = '<option value="all">All Categories</option>' +
        allCategories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
}

function filterAndRenderTable() {
    const searchTerm     = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const categoryFilter = document.getElementById('categoryFilter')?.value || 'all';
    filteredTransactions = allTransactions.filter(t =>
        (!searchTerm || t.description.toLowerCase().includes(searchTerm)) &&
        (categoryFilter === 'all' || t.category === categoryFilter)
    );
    currentPage = 1;
    renderTransactionsTable();
}

function sortTable(column) {
    if (currentSort.column === column) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.column = column;
        currentSort.direction = column === 'date' ? 'desc' : 'asc';
    }
    ['Date', 'Category', 'Amount'].forEach(col => {
        document.getElementById(`sort${col}`).textContent = '';
    });
    document.getElementById(`sort${column.charAt(0).toUpperCase() + column.slice(1)}`).textContent =
        currentSort.direction === 'asc' ? '\u2191' : '\u2193';

    filteredTransactions.sort((a, b) => {
        let aVal, bVal;
        switch (column) {
            case 'date':     aVal = new Date(a.date);          bVal = new Date(b.date);          break;
            case 'amount':   aVal = Math.abs(a.amount);        bVal = Math.abs(b.amount);        break;
            case 'category': aVal = a.category.toLowerCase();  bVal = b.category.toLowerCase();  break;
            default: return 0;
        }
        if (aVal < bVal) return currentSort.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return currentSort.direction === 'asc' ?  1 : -1;
        return 0;
    });
    currentPage = 1;
    renderTransactionsTable();
}

function totalPages() { return Math.max(1, Math.ceil(filteredTransactions.length / pageSize)); }

function goToPage(page) { currentPage = Math.min(Math.max(1, page), totalPages()); renderTransactionsTable(); }

function renderTransactionsTable() {
    const tbody = document.getElementById('transactionsTable');
    const total = filteredTransactions.length;

    if (total === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:2rem;color:#6b7280">No transactions match your filters</td></tr>`;
        document.getElementById('transactionCount').textContent = '0 transactions';
        document.getElementById('pageIndicator').textContent = '';
        updatePaginationButtons(0);
        return;
    }

    const tp       = totalPages();
    const startIdx = (currentPage - 1) * pageSize;
    const endIdx   = Math.min(startIdx + pageSize, total);

    document.getElementById('transactionCount').textContent =
        `${total.toLocaleString()} transaction${total !== 1 ? 's' : ''}` +
        (total !== allTransactions.length ? ` (filtered from ${allTransactions.length.toLocaleString()})` : '');
    document.getElementById('pageIndicator').textContent = `Page ${currentPage} of ${tp} (${startIdx + 1}\u2013${endIdx})`;

    tbody.innerHTML = filteredTransactions.slice(startIdx, endIdx).map(t => `
        <tr>
            <td style="padding:0.6rem 1rem;font-size:0.875rem;color:#6b7280;white-space:nowrap">${t.date}</td>
            <td style="padding:0.6rem 1rem;font-size:0.875rem;color:#1f2937;max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${t.description}">${t.description}</td>
            <td style="padding:0.6rem 1rem;font-size:0.875rem">
                <select data-transaction-id="${t.id}" style="font-size:0.75rem;border:1px solid #d1d5db;border-radius:0.375rem;padding:0.25rem 0.5rem;background:white;cursor:pointer">
                    ${allCategories.map(cat => `<option value="${cat}"${t.category === cat ? ' selected' : ''}>${cat}</option>`).join('')}
                </select>
            </td>
            <td style="padding:0.6rem 1rem;font-size:0.875rem;text-align:right;font-weight:600;white-space:nowrap;color:${t.amount < 0 ? '#ef4444' : '#10b981'}">${t.amount < 0 ? '-' : ''}\u00a3${Math.abs(t.amount).toFixed(2)}</td>
        </tr>`).join('');

    updatePaginationButtons(tp);
    document.querySelector('.table-scroll-wrapper').scrollTop = 0;
}

function updatePaginationButtons(tp) {
    document.getElementById('btnFirst').disabled = currentPage === 1;
    document.getElementById('btnPrev').disabled  = currentPage === 1;
    document.getElementById('btnNext').disabled  = currentPage === tp;
    document.getElementById('btnLast').disabled  = currentPage === tp;
}

async function updateCategory(transactionId, category) {
    try {
        await api.updateTransactionCategory(transactionId, category);
        const t = allTransactions.find(t => t.id === transactionId);
        if (t) t.category = category;
    } catch (error) {
        console.error('Failed to update category:', error);
        alert('Failed to update category. Please try again.');
    }
}
