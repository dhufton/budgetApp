// frontend/js/dashboard.js
let allTransactions = [];
let isLoading = false;

document.addEventListener('DOMContentLoaded', async () => {
    const token = await window.checkAuth();
    if (!token) {
        console.error('No valid auth, redirecting');
        return;
    }

    const email = localStorage.getItem('user_email');
    document.getElementById('userEmail').textContent = email || 'User';

    // Show loading state
    showLoading(true);
    await loadCategories();
    await loadDashboard();
    showLoading(false);
});


window.uploadFiles = async function() {
    const input = document.getElementById('fileInput');
    const files = input.files;

    if (files.length === 0) {
        alert('Please select files to upload');
        return;
    }

    const status = document.getElementById('uploadStatus');
    status.textContent = 'Uploading...';
    status.className = 'mt-2 text-sm text-blue-600';

    let successCount = 0;
    let duplicateCount = 0;
    let errorCount = 0;

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

            // Handle duplicate file (409 error)
            if (error.message && error.message.includes('already exists')) {
                duplicateCount++;
                status.textContent = `⚠️ ${file.name} already uploaded (skipping)`;
                status.className = 'mt-2 text-sm text-yellow-600';
            } else {
                // Handle other errors
                errorCount++;
                status.textContent = `❌ Error uploading ${file.name}: ${error.message}`;
                status.className = 'mt-2 text-sm text-red-600';
            }
        }
    }

    // Clear file input
    input.value = '';

    // Show final status
    let finalMessage = '';
    if (successCount > 0) {
        finalMessage += `✅ ${successCount} file(s) uploaded`;
    }
    if (duplicateCount > 0) {
        finalMessage += (finalMessage ? ', ' : '') + `⚠️ ${duplicateCount} duplicate(s) skipped`;
    }
    if (errorCount > 0) {
        finalMessage += (finalMessage ? ', ' : '') + `❌ ${errorCount} error(s)`;
    }

    status.textContent = finalMessage + '. Refreshing...';
    status.className = successCount > 0 ? 'mt-2 text-sm text-green-600' : 'mt-2 text-sm text-yellow-600';

    // Reload dashboard after successful uploads
    if (successCount > 0) {
        setTimeout(async () => {
            showLoading(true);
            await loadDashboard();
            showLoading(false);
            status.textContent = finalMessage;
        }, 1000);
    }
};

function showLoading(loading) {
    isLoading = loading;
    const transactionsTable = document.getElementById('transactionsTable');
    const pieChart = document.getElementById('pieChart');
    const lineChart = document.getElementById('lineChart');

    if (loading) {
        transactionsTable.innerHTML = '<tr><td colspan="4" class="text-center py-8"><div class="animate-pulse">Loading transactions...</div></td></tr>';
        pieChart.innerHTML = '<div class="text-center py-8 text-gray-500">Loading...</div>';
        lineChart.innerHTML = '<div class="text-center py-8 text-gray-500">Loading...</div>';
    }
}

async function loadDashboard() {
    try {
        console.log('Loading dashboard data...');
        const data = await api.getTransactions();

        if (!data || !data.transactions) {
            console.error('No data returned from /transactions');
            showEmptyState();
            return;
        }

        allTransactions = data.transactions;
        console.log(`Loaded ${allTransactions.length} transactions`);

        const uncategorizedCount = allTransactions.filter(t => t.category === 'Uncategorized').length;

        document.getElementById('totalTransactions').textContent = allTransactions.length.toLocaleString();

        if (uncategorizedCount > 0) {
            document.getElementById('uncategorizedAlert').classList.remove('hidden');
            document.getElementById('uncategorizedCount').textContent =
                `${uncategorizedCount} transactions need categorization`;
        } else {
            document.getElementById('uncategorizedAlert').classList.add('hidden');
        }

        if (allTransactions.length === 0) {
            showEmptyState();
        } else {
            calculateMetrics();
            renderPieChart();
            renderLineChart();
            renderCategorySpendingChart();
            renderTransactionsTable();
        }
    } catch (error) {
        console.error('Failed to load dashboard:', error);
        showErrorState(error.message);
    }
}

function showEmptyState() {
    document.getElementById('totalTransactions').textContent = '0';
    document.getElementById('totalSpent').textContent = '£0';
    document.getElementById('netSaved').textContent = '£0';

    const tbody = document.getElementById('transactionsTable');
    tbody.innerHTML = `
        <tr>
            <td colspan="4" class="text-center py-12">
                <div class="text-gray-400 mb-4">
                    <svg class="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                </div>
                <p class="text-gray-600 font-medium mb-2">No transactions yet</p>
                <p class="text-gray-500 text-sm">Upload a bank statement to get started!</p>
            </td>
        </tr>
    `;

    document.getElementById('pieChart').innerHTML = '<p class="text-gray-500 text-center py-8">Upload a statement to see spending breakdown</p>';
    document.getElementById('lineChart').innerHTML = '<p class="text-gray-500 text-center py-8">Upload a statement to see monthly trends</p>';
}

let allCategories = [];

async function loadCategories() {
    try {
        const data = await api.getCategories();
        allCategories = data.categories || ['Food', 'Transport', 'Shopping', 'Entertainment', 'Bills', 'Savings', 'Uncategorized'];
        console.log('Loaded categories:', allCategories);
    } catch (error) {
        console.error('Failed to load categories:', error);
        allCategories = ['Food', 'Transport', 'Shopping', 'Entertainment', 'Bills', 'Savings', 'Uncategorized'];
    }
}


function showErrorState(message) {
    const tbody = document.getElementById('transactionsTable');
    tbody.innerHTML = `
        <tr>
            <td colspan="4" class="text-center py-12">
                <div class="text-red-400 mb-4">
                    <svg class="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>
                <p class="text-red-600 font-medium mb-2">Failed to load data</p>
                <p class="text-gray-500 text-sm">${message}</p>
                <button onclick="location.reload()" class="mt-4 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
                    Retry
                </button>
            </td>
        </tr>
    `;
}

function calculateMetrics() {
    const spent = allTransactions
        .filter(t => t.amount < 0 && t.category !== 'Savings')
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const saved = allTransactions
        .filter(t => t.category === 'Savings')
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    document.getElementById('totalSpent').textContent = `£${spent.toFixed(0)}`;
    document.getElementById('netSaved').textContent = `£${saved.toFixed(0)}`;
}

function renderPieChart() {
    if (!allTransactions.length) {
        document.getElementById('pieChart').innerHTML = '<p class="text-gray-500 text-center py-8">No data yet</p>';
        return;
    }

    const categoryTotals = {};

    allTransactions.filter(t => t.amount < 0).forEach(t => {
        const cat = t.category || 'Uncategorized';
        categoryTotals[cat] = (categoryTotals[cat] || 0) + Math.abs(t.amount);
    });

    const data = [{
        values: Object.values(categoryTotals),
        labels: Object.keys(categoryTotals),
        type: 'pie',
        marker: {
            colors: ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316']
        }
    }];

    const layout = {
        height: 300,
        margin: { t: 0, b: 0, l: 0, r: 0 },
        showlegend: true,
        legend: { orientation: 'h', y: -0.2 }
    };

    Plotly.newPlot('pieChart', data, layout, {responsive: true});
}

function renderLineChart() {
    if (!allTransactions.length) {
        document.getElementById('lineChart').innerHTML = '<p class="text-gray-500 text-center py-8">No data yet</p>';
        return;
    }

    // Group by month and category
    const monthlyData = {};

    allTransactions.filter(t => t.amount < 0).forEach(t => {
        const month = t.date.substring(0, 7); // YYYY-MM
        const cat = t.category || 'Uncategorized';

        if (!monthlyData[month]) {
            monthlyData[month] = {};
        }
        if (!monthlyData[month][cat]) {
            monthlyData[month][cat] = 0;
        }
        monthlyData[month][cat] += Math.abs(t.amount);
    });

    const months = Object.keys(monthlyData).sort();
    const categories = [...new Set(allTransactions.map(t => t.category))];

    // Create a line for each category
    const traces = categories.map((cat, idx) => {
        const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

        return {
            x: months,
            y: months.map(m => monthlyData[m][cat] || 0),
            type: 'scatter',
            mode: 'lines+markers',
            name: cat,
            line: { color: colors[idx % colors.length], width: 2 },
            marker: { size: 6 }
        };
    });

    const layout = {
        height: 300,
        margin: { t: 20, b: 60, l: 60, r: 20 },
        xaxis: { title: 'Month' },
        yaxis: { title: 'Spending (£)' },
        legend: {
            orientation: 'h',
            y: -0.3,
            x: 0.5,
            xanchor: 'center'
        },
        hovermode: 'x unified'
    };

    Plotly.newPlot('lineChart', traces, layout, {responsive: true});
}

function renderCategorySpendingChart() {
    if (!allTransactions.length) {
        document.getElementById('categorySpendingChart').innerHTML = '<p class="text-gray-500 text-center py-8">No data yet</p>';
        return;
    }

    // Group by month and category
    const monthlyData = {};

    allTransactions.filter(t => t.amount < 0).forEach(t => {
        const month = t.date.substring(0, 7);
        const cat = t.category || 'Uncategorized';

        if (!monthlyData[month]) {
            monthlyData[month] = {};
        }
        monthlyData[month][cat] = (monthlyData[month][cat] || 0) + Math.abs(t.amount);
    });

    const months = Object.keys(monthlyData).sort();
    const categories = [...new Set(allTransactions.filter(t => t.amount < 0).map(t => t.category))];

    const traces = categories.map((cat, idx) => {
        const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

        return {
            x: months,
            y: months.map(m => monthlyData[m]?.[cat] || 0),
            type: 'scatter',
            mode: 'lines+markers',
            name: cat,
            line: { color: colors[idx % colors.length], width: 3 },
            marker: { size: 7 }
        };
    });

    const layout = {
        height: 350,
        margin: { t: 30, b: 80, l: 60, r: 20 },
        xaxis: {
            title: 'Month',
            tickangle: -45
        },
        yaxis: {
            title: 'Spending (£)',
            tickformat: '£,.0f'
        },
        legend: {
            orientation: 'h',
            y: -0.35,
            x: 0.5,
            xanchor: 'center'
        },
        hovermode: 'x unified',
        showlegend: true
    };

    Plotly.newPlot('categorySpendingChart', traces, layout, {responsive: true});
}


function renderTransactionsTable() {
    const tbody = document.getElementById('transactionsTable');

    if (!allTransactions.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-gray-500">No transactions yet. Upload a statement to get started!</td></tr>';
        return;
    }

    const html = allTransactions.slice(0, 50).map(t => `
        <tr class="border-b hover:bg-gray-50">
            <td class="py-3 px-4">${formatDate(t.date)}</td>
            <td class="py-3 px-4">${escapeHtml(t.description)}</td>
            <td class="py-3 px-4">
                <select
                    class="category-select ${t.category === 'Uncategorized' ? 'bg-yellow-100' : 'bg-blue-100'}"
                    style="border: none; padding: 0.25rem 0.5rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; cursor: pointer;"
                    onchange="updateTransactionCategory('${t.id}', this.value, this)"
                >
                    ${allCategories.map(cat =>
                        `<option value="${escapeHtml(cat)}" ${cat === t.category ? 'selected' : ''}>${escapeHtml(cat)}</option>`
                    ).join('')}
                </select>
            </td>
            <td class="py-3 px-4 text-right ${t.amount < 0 ? 'text-red-600' : 'text-green-600'}">
                £${Math.abs(t.amount).toFixed(2)}
            </td>
        </tr>
    `).join('');

    tbody.innerHTML = html;
}

let allTransactions = [];
let allCategories = [];
let filteredTransactions = [];
let currentSort = { column: 'date', direction: 'desc' };
let isLoading = false;

// Add after loadCategories function
function populateCategoryFilter() {
    const filterSelect = document.getElementById('categoryFilter');
    if (!filterSelect) return;

    // Keep "All Categories" option and add others
    const options = '<option value="all">All Categories</option>' +
        allCategories.map(cat => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`).join('');

    filterSelect.innerHTML = options;
}

function filterAndRenderTable() {
    const searchTerm = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const categoryFilter = document.getElementById('categoryFilter')?.value || 'all';

    // Filter transactions
    filteredTransactions = allTransactions.filter(t => {
        const matchesSearch = !searchTerm || t.description.toLowerCase().includes(searchTerm);
        const matchesCategory = categoryFilter === 'all' || t.category === categoryFilter;
        return matchesSearch && matchesCategory;
    });

    // Update count
    const countElement = document.getElementById('transactionCount');
    if (countElement) {
        countElement.textContent = `${filteredTransactions.length} of ${allTransactions.length} transactions`;
    }

    // Render with current sort
    renderTransactionsTable();
}

function sortTable(column) {
    // Toggle direction if same column, otherwise default to desc
    if (currentSort.column === column) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.column = column;
        currentSort.direction = column === 'date' ? 'desc' : 'asc';
    }

    // Update sort indicators
    document.getElementById('sortDate').textContent = '↕️';
    document.getElementById('sortCategory').textContent = '↕️';
    document.getElementById('sortAmount').textContent = '↕️';

    const indicator = currentSort.direction === 'asc' ? '↑' : '↓';
    document.getElementById(`sort${column.charAt(0).toUpperCase() + column.slice(1)}`).textContent = indicator;

    // Sort filtered transactions
    filteredTransactions.sort((a, b) => {
        let aVal, bVal;

        switch(column) {
            case 'date':
                aVal = new Date(a.date);
                bVal = new Date(b.date);
                break;
            case 'amount':
                aVal = Math.abs(a.amount);
                bVal = Math.abs(b.amount);
                break;
            case 'category':
                aVal = a.category.toLowerCase();
                bVal = b.category.toLowerCase();
                break;
            default:
                return 0;
        }

        if (aVal < bVal) return currentSort.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return currentSort.direction === 'asc' ? 1 : -1;
        return 0;
    });

    renderTransactionsTable();
}

function renderTransactionsTable() {
    const tbody = document.getElementById('transactionsTable');

    if (!filteredTransactions || filteredTransactions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-gray-500">No transactions match your filters.</td></tr>';
        return;
    }

    const html = filteredTransactions.map(t => `
        <tr class="border-b hover:bg-gray-50">
            <td class="py-3 px-4">${formatDate(t.date)}</td>
            <td class="py-3 px-4">${escapeHtml(t.description)}</td>
            <td class="py-3 px-4">
                <select
                    class="category-select ${t.category === 'Uncategorized' ? 'bg-yellow-100' : 'bg-blue-100'}"
                    style="border: none; padding: 0.25rem 0.5rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; cursor: pointer;"
                    onchange="updateTransactionCategory('${t.id}', this.value, this)"
                >
                    ${allCategories.map(cat =>
                        `<option value="${escapeHtml(cat)}" ${cat === t.category ? 'selected' : ''}>${escapeHtml(cat)}</option>`
                    ).join('')}
                </select>
            </td>
            <td class="py-3 px-4 text-right ${t.amount < 0 ? 'text-red-600' : 'text-green-600'}">
                £${Math.abs(t.amount).toFixed(2)}
            </td>
        </tr>
    `).join('');

    tbody.innerHTML = html;
}

async function updateTransactionCategory(transactionId, newCategory, selectElement) {
    const transaction = allTransactions.find(t => t.id === transactionId);
    const oldCategory = transaction?.category;

    if (oldCategory === newCategory) return;

    try {
        // Show loading state
        selectElement.style.opacity = '0.5';
        selectElement.disabled = true;

        const token = localStorage.getItem('access_token');
        const response = await fetch(`${window.location.origin}/api/transactions/${transactionId}/category`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ category: newCategory })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Failed to update category');
        }

        // Update local data
        if (transaction) {
            transaction.category = newCategory;
        }

        // Update UI
        selectElement.style.opacity = '1';
        selectElement.disabled = false;

        // Update styling
        const isUncategorized = newCategory === 'Uncategorized';
        selectElement.className = `category-select ${isUncategorized ? 'bg-yellow-100' : 'bg-blue-100'}`;

        // Flash success
        selectElement.style.background = '#d1fae5';
        setTimeout(() => {
            selectElement.className = `category-select ${isUncategorized ? 'bg-yellow-100' : 'bg-blue-100'}`;
        }, 500);

        // Refresh charts and stats
        calculateMetrics();
        renderPieChart();
        renderLineChart();
        renderCategorySpendingChart();

        // Update uncategorized count
        const uncategorizedCount = allTransactions.filter(t => t.category === 'Uncategorized').length;
        if (uncategorizedCount > 0) {
            document.getElementById('uncategorizedAlert').classList.remove('hidden');
            document.getElementById('uncategorizedCount').textContent =
                `${uncategorizedCount} transactions need categorization`;
        } else {
            document.getElementById('uncategorizedAlert').classList.add('hidden');
        }

    } catch (error) {
        console.error('Error updating category:', error);
        selectElement.style.opacity = '1';
        selectElement.disabled = false;

        // Revert selection
        selectElement.value = oldCategory;
        alert('Failed to update category: ' + error.message);
    }
}

async function updateTransactionCategory(transactionId, newCategory, selectElement) {
    const transaction = allTransactions.find(t => t.id === transactionId);
    const oldCategory = transaction?.category;

    if (oldCategory === newCategory) return;

    try {
        // Show loading state
        selectElement.style.opacity = '0.5';
        selectElement.disabled = true;

        const token = localStorage.getItem('access_token');
        const response = await fetch(`${window.location.origin}/api/transactions/${transactionId}/category`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ category: newCategory })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Failed to update category');
        }

        // Update local data
        if (transaction) {
            transaction.category = newCategory;
        }

        // Update UI
        selectElement.style.opacity = '1';
        selectElement.disabled = false;

        // Update styling
        const isUncategorized = newCategory === 'Uncategorized';
        selectElement.className = `category-select ${isUncategorized ? 'bg-yellow-100' : 'bg-blue-100'}`;

        // Flash success
        selectElement.style.background = '#d1fae5';
        setTimeout(() => {
            selectElement.className = `category-select ${isUncategorized ? 'bg-yellow-100' : 'bg-blue-100'}`;
        }, 500);

        // Refresh charts and stats
        calculateMetrics();
        renderPieChart();
        renderLineChart();
        renderCategorySpendingChart();

        // Update uncategorized count
        const uncategorizedCount = allTransactions.filter(t => t.category === 'Uncategorized').length;
        if (uncategorizedCount > 0) {
            document.getElementById('uncategorizedAlert').classList.remove('hidden');
            document.getElementById('uncategorizedCount').textContent =
                `${uncategorizedCount} transactions need categorization`;
        } else {
            document.getElementById('uncategorizedAlert').classList.add('hidden');
        }

    } catch (error) {
        console.error('Error updating category:', error);
        selectElement.style.opacity = '1';
        selectElement.disabled = false;

        // Revert selection
        selectElement.value = oldCategory;
        alert('Failed to update category: ' + error.message);
    }
}


function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
