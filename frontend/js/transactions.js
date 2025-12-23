// frontend/js/transactions.js

let allTransactions = [];
let allCategories = [];
let currentFilter = 'all';

document.addEventListener('DOMContentLoaded', async () => {
    const token = await window.checkAuth();
    if (!token) {
        console.error('No valid auth, redirecting');
        return;
    }

    const email = localStorage.getItem('user_email');
    document.getElementById('userEmail').textContent = email || 'User';

    await loadCategories();
    await loadTransactions();
});

async function loadCategories() {
    try {
        const data = await api.getCategories();
        allCategories = data.categories || [];
    } catch (error) {
        console.error('Failed to load categories:', error);
        // Fallback to default categories
        allCategories = ['Food', 'Transport', 'Shopping', 'Entertainment', 'Bills', 'Savings', 'Uncategorized'];
    }
}

async function loadTransactions() {
    try {
        const data = await api.getTransactions();
        allTransactions = data.transactions || [];

        // Sort by date (newest first)
        allTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));

        renderTransactions();
        updateFilterCounts();
    } catch (error) {
        console.error('Failed to load transactions:', error);
        document.getElementById('transactionsBody').innerHTML =
            '<tr><td colspan="4" class="text-center" style="color: #ef4444; padding: 2rem;">Failed to load transactions. Please refresh the page.</td></tr>';
    }
}

function renderTransactions() {
    const tbody = document.getElementById('transactionsBody');

    if (allTransactions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center" style="color: #6b7280; padding: 2rem;">No transactions found. Upload a statement to get started!</td></tr>';
        return;
    }

    // Filter transactions based on current filter
    let filteredTransactions = allTransactions;
    if (currentFilter === 'uncategorized') {
        filteredTransactions = allTransactions.filter(t => t.category === 'Uncategorized');
    } else if (currentFilter === 'categorized') {
        filteredTransactions = allTransactions.filter(t => t.category !== 'Uncategorized');
    }

    if (filteredTransactions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center" style="color: #6b7280; padding: 2rem;">No transactions match this filter.</td></tr>';
        return;
    }

    const html = filteredTransactions.map(t => {
        const isUncategorized = t.category === 'Uncategorized';
        const amount = parseFloat(t.amount);
        const amountClass = amount >= 0 ? 'amount-positive' : 'amount-negative';

        return `
            <tr class="${isUncategorized ? 'uncategorized-row' : ''}" data-id="${t.id}">
                <td>${formatDate(t.date)}</td>
                <td>${escapeHtml(t.description)}</td>
                <td>
                    <select
                        class="category-select ${isUncategorized ? 'uncategorized' : ''}"
                        data-transaction-id="${t.id}"
                        onchange="updateCategory('${t.id}', this.value, this)"
                    >
                        ${allCategories.map(cat =>
                            `<option value="${escapeHtml(cat)}" ${cat === t.category ? 'selected' : ''}>${escapeHtml(cat)}</option>`
                        ).join('')}
                    </select>
                </td>
                <td class="${amountClass}">£${Math.abs(amount).toFixed(2)}</td>
            </tr>
        `;
    }).join('');

    tbody.innerHTML = html;

    // Update pagination info
    updatePaginationInfo(filteredTransactions.length, allTransactions.length);
}

async function updateCategory(transactionId, newCategory, selectElement) {
    const row = selectElement.closest('tr');
    const transaction = allTransactions.find(t => t.id === transactionId);
    const oldCategory = transaction?.category;

    // Don't update if unchanged
    if (oldCategory === newCategory) return;

    try {
        // Show loading state
        selectElement.classList.add('category-updating');

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
        selectElement.classList.remove('category-updating');
        const isUncategorized = newCategory === 'Uncategorized';
        selectElement.classList.toggle('uncategorized', isUncategorized);
        row.classList.toggle('uncategorized-row', isUncategorized);

        // Show success feedback (green flash)
        const originalBg = isUncategorized ? '#fef3c7' : 'white';
        selectElement.style.background = '#d1fae5';
        setTimeout(() => {
            selectElement.style.background = originalBg;
        }, 1000);

        // Update filter counts
        updateFilterCounts();

        // Re-filter if needed (hide row if it no longer matches filter)
        if (currentFilter !== 'all') {
            setTimeout(() => renderTransactions(), 1000);
        }

    } catch (error) {
        console.error('Error updating category:', error);
        selectElement.classList.remove('category-updating');

        // Revert selection
        selectElement.value = oldCategory;
        alert('Failed to update category: ' + error.message + '. Please try again.');
    }
}

function filterTransactions(filter) {
    currentFilter = filter;

    // Update active button
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`filter${filter.charAt(0).toUpperCase() + filter.slice(1)}`).classList.add('active');

    // Re-render with new filter
    renderTransactions();
}

function updateFilterCounts() {
    const total = allTransactions.length;
    const uncategorized = allTransactions.filter(t => t.category === 'Uncategorized').length;
    const categorized = total - uncategorized;

    document.getElementById('countAll').textContent = total;
    document.getElementById('countUncategorized').textContent = uncategorized;
    document.getElementById('countCategorized').textContent = categorized;
}

function updatePaginationInfo(showing, total) {
    const info = document.getElementById('paginationInfo');
    if (showing === total) {
        info.textContent = `Showing all ${total} transactions`;
    } else {
        info.textContent = `Showing ${showing} of ${total} transactions`;
    }
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Logout function
function logout() {
    window.logout();
}
