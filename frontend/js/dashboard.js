// frontend/js/dashboard.js
let allTransactions = [];

document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();

    const email = localStorage.getItem('user_email');
    document.getElementById('userEmail').textContent = email;

    await loadDashboard();
});

async function loadDashboard() {
    try {
        const data = await getTransactions();

        if (!data) {
            console.error('No data returned from /transactions');
            return;
        }

        allTransactions = data.transactions || [];

        document.getElementById('totalTransactions').textContent = (data.total || 0).toLocaleString();

        if (data.uncategorized_count > 0) {
            document.getElementById('uncategorizedAlert').classList.remove('hidden');
            document.getElementById('uncategorizedCount').textContent =
                `${data.uncategorized_count} transactions need categorization`;
        }

        calculateMetrics();
        renderPieChart();
        renderLineChart();
        renderTransactionsTable();
    } catch (error) {
        console.error('Failed to load dashboard:', error);
        alert('Failed to load transactions. Please refresh the page.');
    }
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
            colors: ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899']
        }
    }];

    const layout = {
        height: 300,
        margin: { t: 0, b: 0, l: 0, r: 0 }
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
        marker: { size: 8 }
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

async function uploadFiles() {
    const input = document.getElementById('fileInput');
    const files = input.files;

    if (files.length === 0) {
        alert('Please select files to upload');
        return;
    }

    const status = document.getElementById('uploadStatus');
    status.textContent = 'Uploading...';
    status.className = 'mt-2 text-sm text-blue-600';

    for (const file of files) {
        try {
            const result = await uploadFile(file);
            if (result.success) {
                status.textContent = `✅ Uploaded ${file.name}`;
                status.className = 'mt-2 text-sm text-green-600';
            } else {
                status.textContent = `❌ Failed: ${result.message}`;
                status.className = 'mt-2 text-sm text-red-600';
            }
        } catch (error) {
            status.textContent = `❌ Failed: ${error.message}`;
            status.className = 'mt-2 text-sm text-red-600';
        }
    }

    // Reload after 1 second
    setTimeout(() => loadDashboard(), 1000);
}
