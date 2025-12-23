// frontend/js/dashboard.js
let allTransactions = [];
let isLoading = false;

const api = {
    baseURL: window.location.hostname === 'localhost'
        ? 'http://localhost:8000'
        : 'https://budget-tracker-app-n12a.onrender.com',
    token: localStorage.getItem('access_token'),

    async getTransactions() {
        const response = await fetch(`${this.baseURL}/transactions`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${this.token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch transactions: ${response.status}`);
        }

        return response.json();
    },

    async uploadFile(formData) {
        const response = await fetch(`${this.baseURL}/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.token}`
            },
            body: formData,
        });

        // Handle 409 Conflict (duplicate file)
        if (response.status === 409) {
            const data = await response.json();
            throw new Error(data.message || 'File already exists');
        }

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
        }

        return response.json();
    }
};

let allTransactions = [];
let isLoading = false;

document.addEventListener('DOMContentLoaded', async () => {
    const token = await window.checkAuth();
    if (!token) {
        console.error('No valid auth, redirecting');
        return;
    }

    // Update API token
    api.token = token;

    const email = localStorage.getItem('user_email');
    document.getElementById('userEmail').textContent = email || 'User';

    // Show loading state
    showLoading(true);
    await loadDashboard();
    showLoading(false);
});

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

        if (!data) {
            console.error('No data returned from /transactions');
            showEmptyState();
            return;
        }

        console.log(`Loaded ${data.total} transactions`);

        allTransactions = data.transactions || [];

        document.getElementById('totalTransactions').textContent = (data.total || 0).toLocaleString();

        if (data.uncategorized_count > 0) {
            document.getElementById('uncategorizedAlert').classList.remove('hidden');
            document.getElementById('uncategorizedCount').textContent =
                `${data.uncategorized_count} transactions need categorization`;
        } else {
            document.getElementById('uncategorizedAlert').classList.add('hidden');
        }

        if (allTransactions.length === 0) {
            showEmptyState();
        } else {
            calculateMetrics();
            renderPieChart();
            renderLineChart();
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
        .filter(t => t.Amount < 0 && t.Category !== 'Savings')
        .reduce((sum, t) => sum + Math.abs(t.Amount), 0);

    const saved = allTransactions
        .filter(t => t.Category === 'Savings')
        .reduce((sum, t) => sum + Math.abs(t.Amount), 0);

    document.getElementById('totalSpent').textContent = `£${spent.toFixed(0)}`;
    document.getElementById('netSaved').textContent = `£${saved.toFixed(0)}`;
}

function renderPieChart() {
    if (!allTransactions.length) {
        document.getElementById('pieChart').innerHTML = '<p class="text-gray-500 text-center py-8">No data yet</p>';
        return;
    }

    const categoryTotals = {};

    allTransactions.filter(t => t.Amount < 0).forEach(t => {
        const cat = t.Category || 'Uncategorized';
        categoryTotals[cat] = (categoryTotals[cat] || 0) + Math.abs(t.Amount);
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

    const monthlyData = {};

    allTransactions.filter(t => t.Amount < 0).forEach(t => {
        const month = t.Date.substring(0, 7);
        monthlyData[month] = (monthlyData[month] || 0) + Math.abs(t.Amount);
    });

    const months = Object.keys(monthlyData).sort();
    const values = months.map(m => monthlyData[m]);

    const data = [{
        x: months,
        y: values,
        type: 'scatter',
        mode: 'lines+markers',
        line: { color: '#3b82f6', width: 3 },
        marker: { size: 8 },
        fill: 'tozeroy',
        fillcolor: 'rgba(59, 130, 246, 0.1)'
    }];

    const layout = {
        height: 300,
        margin: { t: 20, b: 40, l: 60, r: 20 },
        xaxis: { title: 'Month' },
        yaxis: { title: 'Spending (£)' }
    };

    Plotly.newPlot('lineChart', data, layout, {responsive: true});
}

function renderTransactionsTable() {
    const tbody = document.getElementById('transactionsTable');

    if (!allTransactions.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-gray-500">No transactions yet. Upload a statement to get started!</td></tr>';
        return;
    }

    const html = allTransactions.slice(0, 50).map(t => `
        <tr class="border-b hover:bg-gray-50">
            <td class="py-3 px-4">${t.Date}</td>
            <td class="py-3 px-4">${t.Description}</td>
            <td class="py-3 px-4">
                <span class="px-2 py-1 rounded-full text-xs font-semibold ${
                    t.Category === 'Uncategorized' ? 'bg-yellow-100 text-yellow-800' : 'bg-blue-100 text-blue-800'
                }">
                    ${t.Category}
                </span>
            </td>
            <td class="py-3 px-4 text-right ${t.Amount < 0 ? 'text-red-600' : 'text-green-600'}">
                £${Math.abs(t.Amount).toFixed(2)}
            </td>
        </tr>
    `).join('');

    tbody.innerHTML = html;
}
