// frontend/js/dashboard.js

// ---------------------------------------------------------------------------
// Global state
// ---------------------------------------------------------------------------
let allTransactions      = [];
let allCategories        = [];
let filteredTransactions = [];
let currentSort          = { column: 'date', direction: 'desc' };
let currentPage          = 1;
let pageSize             = 50;
let isLoading            = false;

// ---------------------------------------------------------------------------
// Initialise
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const token = await window.checkAuth();
        if (!token) { console.error('No valid auth, redirecting'); return; }

        document.getElementById('userEmail').textContent =
            localStorage.getItem('user_email') || 'User';

        bindEvent('uploadBtn',         'click',  uploadFiles);
        bindEvent('fixCategoriesBtn',  'click',  fixUncategorised);
        bindEvent('dismissInsightsBtn','click', () =>
            document.getElementById('insightsCard')?.classList.add('hidden'));
        bindEvent('searchInput',       'input',  () => { currentPage = 1; filterAndRenderTable(); });
        bindEvent('categoryFilter',    'change', () => { currentPage = 1; filterAndRenderTable(); });
        bindEvent('thDate',            'click',  () => sortTable('date'));
        bindEvent('thCategory',        'click',  () => sortTable('category'));
        bindEvent('thAmount',          'click',  () => sortTable('amount'));
        bindEvent('btnFirst',          'click',  () => goToPage(1));
        bindEvent('btnPrev',           'click',  () => goToPage(currentPage - 1));
        bindEvent('btnNext',           'click',  () => goToPage(currentPage + 1));
        bindEvent('btnLast',           'click',  () => goToPage(totalPages()));
        bindEvent('pageSizeSelect',    'change', (e) => {
            pageSize = parseInt(e.target.value);
            currentPage = 1;
            renderTransactionsTable();
        });

        // Delegated listener for category dropdowns in dynamically rendered rows
        document.getElementById('transactionsTable')
            ?.addEventListener('change', async (e) => {
                if (e.target.tagName === 'SELECT' && e.target.dataset.transactionId) {
                    await updateCategory(e.target.dataset.transactionId, e.target.value);
                }
            });

        showLoading(true);
        await loadCategories();
        await loadDashboard();
        showLoading(false);

    } catch (err) {
        // Surface any initialisation error so it's visible in the console
        console.error('Dashboard initialisation failed:', err);
    }
});

// ---------------------------------------------------------------------------
// Helper: safely bind an event listener, logging if the element is missing
// ---------------------------------------------------------------------------
function bindEvent(id, event, handler) {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener(event, handler);
    } else {
        console.warn(`bindEvent: element #${id} not found — ${event} listener not attached`);
    }
}

// ---------------------------------------------------------------------------
// File upload
// ---------------------------------------------------------------------------
async function uploadFiles() {
    const input = document.getElementById('fileInput');
    if (!input || input.files.length === 0) {
        alert('Please select a file to upload');
        return;
    }

    const status = document.getElementById('uploadStatus');
    const files  = input.files;
    status.textContent = 'Uploading...';
    status.style.color = '#3b82f6';

    let successCount = 0, duplicateCount = 0, errorCount = 0;

    for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        try {
            const result = await api.uploadFile(formData);
            if (result?.success) {
                successCount++;
                status.textContent = `✅ Uploaded ${successCount}/${files.length} files`;
                status.style.color = '#10b981';
            }
        } catch (error) {
            console.error('Upload error:', error);
            if (error.message?.includes('already exists')) {
                duplicateCount++;
                status.textContent = `⚠️ ${file.name} already uploaded (skipping)`;
                status.style.color = '#f59e0b';
            } else {
                errorCount++;
                status.textContent = `❌ Error uploading ${file.name}: ${error.message}`;
                status.style.color = '#ef4444';
            }
        }
    }

    input.value = '';
    let finalMessage = '';
    if (successCount > 0)   finalMessage += `✅ ${successCount} file(s) uploaded`;
    if (duplicateCount > 0) finalMessage += (finalMessage ? ', ' : '') + `⚠️ ${duplicateCount} duplicate(s) skipped`;
    if (errorCount > 0)     finalMessage += (finalMessage ? ', ' : '') + `❌ ${errorCount} error(s)`;

    status.textContent = finalMessage + '. Refreshing...';
    status.style.color  = successCount > 0 ? '#10b981' : '#f59e0b';

    if (successCount > 0) {
        setTimeout(async () => {
            showLoading(true);
            await loadDashboard();
            showLoading(false);
            status.textContent = finalMessage;
        }, 1000);
    }
}

// ---------------------------------------------------------------------------
// Load categories
// ---------------------------------------------------------------------------
async function loadCategories() {
    try {
        const data = await api.getCategories();
        allCategories = data?.categories || DEFAULT_CATEGORIES;
    } catch {
        allCategories = DEFAULT_CATEGORIES;
    }
}

// ---------------------------------------------------------------------------
// Load dashboard
// ---------------------------------------------------------------------------
async function loadDashboard() {
    try {
        const data = await api.getTransactions();
        if (!data?.transactions) { showEmptyState(); return; }

        allTransactions      = data.transactions;
        filteredTransactions = [...allTransactions];
        currentPage          = 1;

        const uncategorizedCount = allTransactions.filter(t => t.category === 'Uncategorized').length;
        document.getElementById('totalTransactions').textContent = allTransactions.length.toLocaleString();

        if (uncategorizedCount > 0) {
            document.getElementById('uncategorizedAlert').classList.remove('hidden');
            document.getElementById('uncategorizedCount').textContent =
                `${uncategorizedCount} transaction${uncategorizedCount > 1 ? 's' : ''} need categorisation`;
            const btn = document.getElementById('fixCategoriesBtn');
            if (btn) {
                btn.disabled    = false;
                btn.textContent = '✨ Fix with AI';
                btn.classList.remove('hidden', 'opacity-75', 'cursor-not-allowed');
            }
        } else {
            document.getElementById('uncategorizedAlert').classList.add('hidden');
        }

        if (allTransactions.length === 0) {
            showEmptyState();
        } else {
            populateCategoryFilter();
            calculateMetrics();
            renderPieChart();
            renderLineChart();
            renderCategorySpendingChart();
            sortTable('date');
            loadInsights();
        }
    } catch (error) {
        console.error('Failed to load dashboard:', error);
        showErrorState(error.message);
    }
}

// ---------------------------------------------------------------------------
// AI: Insights
// ---------------------------------------------------------------------------
async function loadInsights() {
    const card = document.getElementById('insightsCard');
    const text = document.getElementById('insightsText');
    if (!card || !text) return;
    try {
        const data = await api.getInsights();
        if (data?.insight) {
            text.textContent = data.insight;
            card.classList.remove('hidden');
        }
    } catch (error) {
        console.warn('Could not load insights:', error);
    }
}

// ---------------------------------------------------------------------------
// AI: Fix uncategorised
// ---------------------------------------------------------------------------
async function fixUncategorised() {
    const btn     = document.getElementById('fixCategoriesBtn');
    const countEl = document.getElementById('uncategorizedCount');

    btn.disabled    = true;
    btn.textContent = '⏳ Categorising...';
    btn.classList.add('opacity-75', 'cursor-not-allowed');

    try {
        const result = await api.categoriseTransactions();
        if (result?.changed > 0) {
            countEl.textContent = `✅ ${result.changed} transaction${result.changed > 1 ? 's' : ''} categorised!`;
            btn.classList.add('hidden');
            setTimeout(async () => {
                showLoading(true);
                await loadDashboard();
                showLoading(false);
            }, 1500);
        } else {
            countEl.textContent = 'No new categories found — try manually categorising remaining transactions';
            btn.disabled    = false;
            btn.textContent = '✨ Fix with AI';
            btn.classList.remove('opacity-75', 'cursor-not-allowed');
        }
    } catch (error) {
        console.error('Categorisation failed:', error);
        countEl.textContent = '❌ Categorisation failed — please try again';
        btn.disabled    = false;
        btn.textContent = '✨ Fix with AI';
        btn.classList.remove('opacity-75', 'cursor-not-allowed');
    }
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------
function calculateMetrics() {
    const spending = allTransactions.filter(t => t.amount < 0)
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const income = allTransactions.filter(t => t.amount > 0)
        .reduce((sum, t) => sum + t.amount, 0);
    const net = income - spending;

    const totalSpentEl = document.getElementById('totalSpent');
    const netSavedEl   = document.getElementById('netSaved');
    if (totalSpentEl) totalSpentEl.textContent = `£${spending.toFixed(2)}`;
    if (netSavedEl) {
        netSavedEl.textContent = `£${Math.abs(net).toFixed(2)}`;
        netSavedEl.className   = `value ${net >= 0 ? 'text-green' : 'text-red'}`;
    }
}

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------
function showLoading(loading) {
    isLoading = loading;
    if (!loading) return;
    document.getElementById('transactionsTable').innerHTML =
        `<tr><td colspan="4" style="text-align:center; padding:2rem; color:#6b7280;">Loading transactions...</td></tr>`;
    document.getElementById('pieChart').innerHTML =
        `<p style="text-align:center; color:#6b7280; padding:2rem;">Loading chart...</p>`;
    document.getElementById('lineChart').innerHTML =
        `<p style="text-align:center; color:#6b7280; padding:2rem;">Loading chart...</p>`;
    document.getElementById('pageIndicator').textContent   = '';
    document.getElementById('transactionCount').textContent = '';
}

function showEmptyState() {
    document.getElementById('transactionsTable').innerHTML =
        `<tr><td colspan="4" style="text-align:center; padding:2rem; color:#6b7280;">No transactions yet — upload a bank statement to get started!</td></tr>`;
    document.getElementById('pieChart').innerHTML =
        `<p style="text-align:center; color:#6b7280; padding:2rem;">Upload a statement to see spending breakdown</p>`;
    document.getElementById('lineChart').innerHTML =
        `<p style="text-align:center; color:#6b7280; padding:2rem;">Upload a statement to see monthly trends</p>`;
    document.getElementById('pageIndicator').textContent   = '';
    document.getElementById('transactionCount').textContent = '';
}

function showErrorState(message) {
    document.getElementById('transactionsTable').innerHTML =
        `<tr><td colspan="4" style="text-align:center; padding:2rem; color:#ef4444;">Failed to load  ${message}</td></tr>`;
}

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------
function renderPieChart() {
    const chartDiv = document.getElementById('pieChart');
    if (!allTransactions.length) { chartDiv.innerHTML = '<p style="text-align:center; color:#6b7280; padding:2rem;">No data yet</p>'; return; }
    const categoryTotals = {};
    allTransactions.filter(t => t.amount < 0).forEach(t => {
        const cat = t.category || 'Uncategorized';
        categoryTotals[cat] = (categoryTotals[cat] || 0) + Math.abs(t.amount);
    });
    Plotly.newPlot('pieChart', [{
        values: Object.values(categoryTotals),
        labels: Object.keys(categoryTotals),
        type: 'pie',
        marker: { colors: CHART_COLOURS },
    }], {
        height: 300, margin: { t: 0, b: 0, l: 0, r: 0 },
        showlegend: true, legend: { orientation: 'h', y: -0.2 },
    }, { responsive: true });
}

function renderLineChart() {
    const chartDiv = document.getElementById('lineChart');
    if (!allTransactions.length) { chartDiv.innerHTML = '<p style="text-align:center; color:#6b7280; padding:2rem;">No data yet</p>'; return; }
    const monthlyData = {};
    allTransactions.filter(t => t.amount < 0).forEach(t => {
        const month = t.date.substring(0, 7);
        monthlyData[month] = (monthlyData[month] || 0) + Math.abs(t.amount);
    });
    const months = Object.keys(monthlyData).sort();
    Plotly.newPlot('lineChart', [{
        x: months, y: months.map(m => monthlyData[m]),
        type: 'scatter', mode: 'lines+markers',
        line: { color: CHART_COLOURS[0], width: 3 },
        marker: { size: 8 }, fill: 'tozeroy',
        fillcolor: 'rgba(59, 130, 246, 0.1)',
    }], {
        height: 300, margin: { t: 20, b: 40, l: 60, r: 20 },
        xaxis: { title: 'Month' }, yaxis: { title: 'Spending (£)' },
    }, { responsive: true });
}

function renderCategorySpendingChart() {
    const chartDiv = document.getElementById('categorySpendingChart');
    if (!chartDiv) return;
    if (!allTransactions.length) { chartDiv.innerHTML = '<p style="text-align:center; color:#6b7280; padding:2rem;">No data yet</p>'; return; }
    const monthlyData  = {};
    const spendingTxns = allTransactions.filter(t => t.amount < 0);
    spendingTxns.forEach(t => {
        const month = t.date.substring(0, 7);
        const cat   = t.category || 'Uncategorized';
        if (!monthlyData[month]) monthlyData[month] = {};
        monthlyData[month][cat] = (monthlyData[month][cat] || 0) + Math.abs(t.amount);
    });
    const months     = Object.keys(monthlyData).sort();
    const categories = [...new Set(spendingTxns.map(t => t.category || 'Uncategorized'))];
    const traces     = categories.map((cat, idx) => ({
        x: months, y: months.map(m => monthlyData[m]?.[cat] || 0),
        type: 'scatter', mode: 'lines+markers', name: cat,
        line: { color: CHART_COLOURS[idx % CHART_COLOURS.length], width: 3 },
        marker: { size: 7 },
    }));
    Plotly.newPlot('categorySpendingChart', traces, {
        height: 400, margin: { t: 30, b: 80, l: 70, r: 30 },
        xaxis: { title: 'Month', tickangle: -45 },
        yaxis: { title: 'Spending (£)', tickprefix: '£' },
        legend: { orientation: 'h', y: -0.3, x: 0.5, xanchor: 'center' },
        hovermode: 'x unified',
    }, { responsive: true });
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
        currentSort.column    = column;
        currentSort.direction = column === 'date' ? 'desc' : 'asc';
    }
    ['Date', 'Category', 'Amount'].forEach(col =>
        document.getElementById(`sort${col}`).textContent = '↕️');
    document.getElementById(`sort${column.charAt(0).toUpperCase() + column.slice(1)}`).textContent =
        currentSort.direction === 'asc' ? '↑' : '↓';
    filteredTransactions.sort((a, b) => {
        let aVal, bVal;
        switch (column) {
            case 'date':     aVal = new Date(a.date);         bVal = new Date(b.date);         break;
            case 'amount':   aVal = Math.abs(a.amount);       bVal = Math.abs(b.amount);       break;
            case 'category': aVal = a.category.toLowerCase(); bVal = b.category.toLowerCase(); break;
            default: return 0;
        }
        if (aVal < bVal) return currentSort.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return currentSort.direction === 'asc' ?  1 : -1;
        return 0;
    });
    currentPage = 1;
    renderTransactionsTable();
}

function totalPages() {
    return Math.max(1, Math.ceil(filteredTransactions.length / pageSize));
}

function goToPage(page) {
    currentPage = Math.min(Math.max(1, page), totalPages());
    renderTransactionsTable();
}

function renderTransactionsTable() {
    const tbody = document.getElementById('transactionsTable');
    const total = filteredTransactions.length;

    if (total === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:2rem; color:#6b7280;">No transactions match your filters</td></tr>`;
        document.getElementById('transactionCount').textContent = '0 transactions';
        document.getElementById('pageIndicator').textContent    = '';
        updatePaginationButtons(0);
        return;
    }

    const tp       = totalPages();
    const startIdx = (currentPage - 1) * pageSize;
    const endIdx   = Math.min(startIdx + pageSize, total);

    document.getElementById('transactionCount').textContent =
        `${total.toLocaleString()} transaction${total !== 1 ? 's' : ''}` +
        (total !== allTransactions.length ? ` (filtered from ${allTransactions.length.toLocaleString()})` : '');
    document.getElementById('pageIndicator').textContent =
        `Page ${currentPage} of ${tp} (${startIdx + 1}–${endIdx})`;

    tbody.innerHTML = filteredTransactions.slice(startIdx, endIdx).map(t => `
        <tr>
            <td style="padding:0.6rem 1rem; font-size:0.875rem; color:#6b7280; white-space:nowrap;">${t.date}</td>
            <td style="padding:0.6rem 1rem; font-size:0.875rem; color:#1f2937; max-width:320px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${t.description}">${t.description}</td>
            <td style="padding:0.6rem 1rem; font-size:0.875rem;">
                <select data-transaction-id="${t.id}"
                    style="font-size:0.75rem; border:1px solid #d1d5db; border-radius:0.375rem; padding:0.25rem 0.5rem; background:white; cursor:pointer;">
                    ${allCategories.map(cat =>
                        `<option value="${cat}" ${t.category === cat ? 'selected' : ''}>${cat}</option>`
                    ).join('')}
                </select>
            </td>
            <td style="padding:0.6rem 1rem; font-size:0.875rem; text-align:right; font-weight:600; white-space:nowrap; color:${t.amount < 0 ? '#ef4444' : '#10b981'};">
                ${t.amount < 0 ? '-' : '+'}£${Math.abs(t.amount).toFixed(2)}
            </td>
        </tr>`).join('');

    updatePaginationButtons(tp);
    document.querySelector('.table-scroll-wrapper').scrollTop = 0;
}

function updatePaginationButtons(tp) {
    document.getElementById('btnFirst').disabled = currentPage <= 1;
    document.getElementById('btnPrev').disabled  = currentPage <= 1;
    document.getElementById('btnNext').disabled  = currentPage >= tp;
    document.getElementById('btnLast').disabled  = currentPage >= tp;
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
