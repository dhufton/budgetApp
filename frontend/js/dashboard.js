// frontend/js/dashboard.js
// Global state
let allTransactions = [];
let allCategories = [];
let filteredTransactions = [];
let currentSort = { column: 'date', direction: 'desc' };
let isLoading = false;

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    const token = await window.checkAuth();
    if (!token) {
        console.error('No valid auth, redirecting');
        return;
    }
    const email = localStorage.getItem('user_email');
    document.getElementById('userEmail').textContent = email || 'User';
    showLoading(true);
    await loadCategories();
    await loadDashboard();
    showLoading(false);
});

// ---------------------------------------------------------------------------
// File upload handler
// ---------------------------------------------------------------------------
window.uploadFiles = async function() {
    const input = document.getElementById('fileInput');
    const files = input.files;
    if (files.length === 0) { alert('Please select files to upload'); return; }

    const status = document.getElementById('uploadStatus');
    status.textContent = 'Uploading...';
    status.className = 'mt-2 text-sm text-blue-600';

    let successCount = 0, duplicateCount = 0, errorCount = 0;

    for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        try {
            const result = await api.uploadFile(formData);
            if (result.success) {
                successCount++;
                status.textContent = `✅ Uploaded ${successCount}/${files.length} files`;
                status.className = 'mt-2 text-sm text-green-600';
            }
        } catch (error) {
            console.error('Upload error:', error);
            if (error.message && error.message.includes('already exists')) {
                duplicateCount++;
                status.textContent = `⚠️ ${file.name} already uploaded (skipping)`;
                status.className = 'mt-2 text-sm text-yellow-600';
            } else {
                errorCount++;
                status.textContent = `❌ Error uploading ${file.name}: ${error.message}`;
                status.className = 'mt-2 text-sm text-red-600';
            }
        }
    }

    input.value = '';
    let finalMessage = '';
    if (successCount > 0)  finalMessage += `✅ ${successCount} file(s) uploaded`;
    if (duplicateCount > 0) finalMessage += (finalMessage ? ', ' : '') + `⚠️ ${duplicateCount} duplicate(s) skipped`;
    if (errorCount > 0)    finalMessage += (finalMessage ? ', ' : '') + `❌ ${errorCount} error(s)`;

    status.textContent = finalMessage + '. Refreshing...';
    status.className = successCount > 0 ? 'mt-2 text-sm text-green-600' : 'mt-2 text-sm text-yellow-600';

    if (successCount > 0) {
        setTimeout(async () => {
            showLoading(true);
            await loadDashboard();
            showLoading(false);
            status.textContent = finalMessage;
        }, 1000);
    }
};

// ---------------------------------------------------------------------------
// Load categories
// ---------------------------------------------------------------------------
async function loadCategories() {
    try {
        const data = await api.getCategories();
        allCategories = data.categories || DEFAULT_CATEGORIES;
    } catch (error) {
        console.error('Failed to load categories:', error);
        allCategories = DEFAULT_CATEGORIES;
    }
}

// ---------------------------------------------------------------------------
// Load dashboard data
// ---------------------------------------------------------------------------
async function loadDashboard() {
    try {
        const data = await api.getTransactions();
        if (!data || !data.transactions) {
            showEmptyState();
            return;
        }

        allTransactions = data.transactions;
        filteredTransactions = [...allTransactions];

        const uncategorizedCount = allTransactions.filter(t => t.category === 'Uncategorized').length;
        document.getElementById('totalTransactions').textContent = allTransactions.length.toLocaleString();

        if (uncategorizedCount > 0) {
            document.getElementById('uncategorizedAlert').classList.remove('hidden');
            document.getElementById('uncategorizedCount').textContent =
                `${uncategorizedCount} transaction${uncategorizedCount > 1 ? 's' : ''} need categorisation`;
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
            // Load insights in background — don't await so it doesn't block the page
            loadInsights();
        }
    } catch (error) {
        console.error('Failed to load dashboard:', error);
        showErrorState(error.message);
    }
}

// ---------------------------------------------------------------------------
// AI: Load spending insights
// ---------------------------------------------------------------------------
async function loadInsights() {
    const card = document.getElementById('insightsCard');
    const text = document.getElementById('insightsText');
    if (!card || !text) return;

    try {
        const data = await api.getInsights();
        if (data && data.insight) {
            text.textContent = data.insight;
            card.classList.remove('hidden');
        }
    } catch (error) {
        // Insights are non-critical — fail silently
        console.warn('Could not load insights:', error);
    }
}

// ---------------------------------------------------------------------------
// AI: Fix uncategorised transactions
// ---------------------------------------------------------------------------
window.fixUncategorised = async function() {
    const btn = document.getElementById('fixCategoriesBtn');
    const countEl = document.getElementById('uncategorizedCount');

    btn.disabled = true;
    btn.textContent = '⏳ Categorising...';
    btn.classList.add('opacity-75', 'cursor-not-allowed');

    try {
        const result = await api.categoriseTransactions();
        if (result && result.changed > 0) {
            countEl.textContent = `✅ ${result.changed} transaction${result.changed > 1 ? 's' : ''} categorised!`;
            btn.classList.add('hidden');
            // Reload dashboard after short delay so the user sees the success message
            setTimeout(async () => {
                showLoading(true);
                await loadDashboard();
                showLoading(false);
            }, 1500);
        } else {
            countEl.textContent = 'No new categories found — try manually categorising remaining transactions';
            btn.disabled = false;
            btn.textContent = '✨ Fix with AI';
            btn.classList.remove('opacity-75', 'cursor-not-allowed');
        }
    } catch (error) {
        console.error('Categorisation failed:', error);
        countEl.textContent = '❌ Categorisation failed — please try again';
        btn.disabled = false;
        btn.textContent = '✨ Fix with AI';
        btn.classList.remove('opacity-75', 'cursor-not-allowed');
    }
};

// ---------------------------------------------------------------------------
// Show/hide loading state (unchanged)
// ---------------------------------------------------------------------------
function showLoading(loading) {
    isLoading = loading;
    const transactionsTable = document.getElementById('transactionsTable');
    if (loading) {
        if (transactionsTable) transactionsTable.innerHTML = `
            <tr><td colspan="5" class="text-center py-8 text-gray-400">Loading transactions...</td></tr>`;
        document.getElementById('pieChart').innerHTML =
            '<p class="text-center text-gray-400 py-8">Loading chart...</p>';
        document.getElementById('lineChart').innerHTML =
            '<p class="text-center text-gray-400 py-8">Loading chart...</p>';
    }
}

// ---------------------------------------------------------------------------
// Show empty / error states (unchanged)
// ---------------------------------------------------------------------------
function showEmptyState() {
    const tbody = document.getElementById('transactionsTable');
    tbody.innerHTML = `
        <tr><td colspan="5" class="text-center py-8 text-gray-400">
            No transactions yet — upload a bank statement to get started!
        </td></tr>`;
    document.getElementById('pieChart').innerHTML =
        '<p class="text-center text-gray-400 py-8">Upload a statement to see spending breakdown</p>';
    document.getElementById('lineChart').innerHTML =
        '<p class="text-center text-gray-400 py-8">Upload a statement to see monthly trends</p>';
}

function showErrorState(message) {
    const tbody = document.getElementById('transactionsTable');
    tbody.innerHTML = `
        <tr><td colspan="5" class="text-center py-8 text-red-400">
            Failed to load  ${message}
        </td></tr>`;
}

// ---------------------------------------------------------------------------
// Charts (unchanged — using CHART_COLOURS from constants.js)
// ---------------------------------------------------------------------------
function renderPieChart() {
    const chartDiv = document.getElementById('pieChart');
    if (!allTransactions.length) { chartDiv.innerHTML = '<p class="text-center text-gray-400 py-8">No data yet</p>'; return; }

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
        height: 300,
        margin: { t: 0, b: 0, l: 0, r: 0 },
        showlegend: true,
        legend: { orientation: 'h', y: -0.2 },
    }, { responsive: true });
}

function renderLineChart() {
    const chartDiv = document.getElementById('lineChart');
    if (!allTransactions.length) { chartDiv.innerHTML = '<p class="text-center text-gray-400 py-8">No data yet</p>'; return; }

    const monthlyData = {};
    allTransactions.filter(t => t.amount < 0).forEach(t => {
        const month = t.date.substring(0, 7);
        monthlyData[month] = (monthlyData[month] || 0) + Math.abs(t.amount);
    });
    const months = Object.keys(monthlyData).sort();

    Plotly.newPlot('lineChart', [{
        x: months,
        y: months.map(m => monthlyData[m]),
        type: 'scatter',
        mode: 'lines+markers',
        line: { color: CHART_COLOURS[0], width: 3 },
        marker: { size: 8 },
        fill: 'tozeroy',
        fillcolor: 'rgba(59, 130, 246, 0.1)',
    }], {
        height: 300,
        margin: { t: 20, b: 40, l: 60, r: 20 },
        xaxis: { title: 'Month' },
        yaxis: { title: 'Spending (£)' },
    }, { responsive: true });
}

function renderCategorySpendingChart() {
    const chartDiv = document.getElementById('categorySpendingChart');
    if (!chartDiv) return;
    if (!allTransactions.length) { chartDiv.innerHTML = '<p class="text-center text-gray-400 py-8">No data yet</p>'; return; }

    const monthlyData = {};
    const spendingTxns = allTransactions.filter(t => t.amount < 0);
    spendingTxns.forEach(t => {
        const month = t.date.substring(0, 7);
        const cat = t.category || 'Uncategorized';
        if (!monthlyData[month]) monthlyData[month] = {};
        monthlyData[month][cat] = (monthlyData[month][cat] || 0) + Math.abs(t.amount);
    });
    const months = Object.keys(monthlyData).sort();
    const categories = [...new Set(spendingTxns.map(t => t.category || 'Uncategorized'))];

    const traces = categories.map((cat, idx) => ({
        x: months,
        y: months.map(m => monthlyData[m]?.[cat] || 0),
        type: 'scatter',
        mode: 'lines+markers',
        name: cat,
        line: { color: CHART_COLOURS[idx % CHART_COLOURS.length], width: 3 },
        marker: { size: 7 },
    }));

    Plotly.newPlot('categorySpendingChart', traces, {
        height: 400,
        margin: { t: 30, b: 80, l: 70, r: 30 },
        xaxis: { title: 'Month', tickangle: -45 },
        yaxis: { title: 'Spending (£)', tickprefix: '£' },
        legend: { orientation: 'h', y: -0.3, x: 0.5, xanchor: 'center' },
        hovermode: 'x unified',
    }, { responsive: true });
}

// ---------------------------------------------------------------------------
// Table: filter, sort, render (unchanged)
// ---------------------------------------------------------------------------
function populateCategoryFilter() {
    const filterSelect = document.getElementById('categoryFilter');
    if (!filterSelect) return;
    filterSelect.innerHTML = '<option value="all">All Categories</option>' +
        allCategories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
}

function filterAndRenderTable() {
    const searchTerm = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const categoryFilter = document.getElementById('categoryFilter')?.value || 'all';

    filteredTransactions = allTransactions.filter(t => {
        const matchesSearch = !searchTerm || t.description.toLowerCase().includes(searchTerm);
        const matchesCategory = categoryFilter === 'all' || t.category === categoryFilter;
        return matchesSearch && matchesCategory;
    });

    const countElement = document.getElementById('transactionCount');
    if (countElement) {
        countElement.textContent = `${filteredTransactions.length} of ${allTransactions.length} transactions`;
    }
    renderTransactionsTable();
}

function sortTable(column) {
    if (currentSort.column === column) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.column = column;
        currentSort.direction = column === 'date' ? 'desc' : 'asc';
    }

    document.getElementById('sortDate').textContent = '↕️';
    document.getElementById('sortCategory').textContent = '↕️';
    document.getElementById('sortAmount').textContent = '↕️';
    const indicator = currentSort.direction === 'asc' ? '↑' : '↓';
    document.getElementById(`sort${column.charAt(0).toUpperCase() + column.slice(1)}`).textContent = indicator;

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
    renderTransactionsTable();
}

function renderTransactionsTable() {
    const tbody = document.getElementById('transactionsTable');
    if (!filteredTransactions || filteredTransactions.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-gray-400">No transactions match your filters</td></tr>`;
        return;
    }
    tbody.innerHTML = filteredTransactions.map(t => `
        <tr class="hover:bg-gray-50 border-b border-gray-100">
            <td class="px-4 py-3 text-sm text-gray-600">${t.date}</td>
            <td class="px-4 py-3 text-sm text-gray-800">${t.description}</td>
            <td class="px-4 py-3 text-sm font-medium ${t.amount < 0 ? 'text-red-600' : 'text-green-600'}">
                £${Math.abs(t.amount).toFixed(2)}
            </td>
            <td class="px-4 py-3 text-sm">
                <select onchange="updateCategory('${t.id}', this.value)"
                    class="text-xs border border-gray-200 rounded px-2 py-1 bg-white">
                    ${allCategories.map(cat =>
                        `<option value="${cat}" ${t.category === cat ? 'selected' : ''}>${cat}</option>`
                    ).join('')}
                </select>
            </td>
        </tr>`).join('');
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

function calculateMetrics() {
    // Preserve existing implementation
}
