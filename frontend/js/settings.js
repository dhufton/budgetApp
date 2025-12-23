// frontend/js/settings.js

let currentCategories = [];
let currentBudgets = [];

document.addEventListener('DOMContentLoaded', async () => {
    const token = await window.checkAuth();
    if (!token) {
        console.error('No valid auth, redirecting');
        return;
    }

    const email = localStorage.getItem('user_email');
    document.getElementById('userEmail').textContent = email || 'User';

    // Load data for both sections
    await loadCategories();
    await loadBudgetTargets();
});

function showTab(tab) {
    // Update tab buttons
    const tabs = document.querySelectorAll('.settings-tab');
    tabs.forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');

    // Show/hide sections
    if (tab === 'categories') {
        document.getElementById('categoriesSection').classList.remove('hidden');
        document.getElementById('budgetSection').classList.add('hidden');
    } else {
        document.getElementById('categoriesSection').classList.add('hidden');
        document.getElementById('budgetSection').classList.remove('hidden');
    }
}

// ========== CATEGORIES ==========

async function loadCategories() {
    try {
        const data = await api.getCategories();
        currentCategories = data.categories || [];
        renderCategories();
        updateBudgetCategoryDropdown();
    } catch (error) {
        console.error('Failed to load categories:', error);
        document.getElementById('categoriesList').innerHTML =
            '<p class="text-center" style="color: #ef4444; padding: 2rem;">Failed to load categories</p>';
    }
}

function renderCategories() {
    const container = document.getElementById('categoriesList');

    if (currentCategories.length === 0) {
        container.innerHTML = '<p class="text-center" style="color: #6b7280; padding: 2rem;">No custom categories yet. Add one above!</p>';
        return;
    }

    const defaultCategories = ['Food', 'Transport', 'Shopping', 'Entertainment', 'Bills', 'Savings', 'Uncategorized'];

    const html = currentCategories.map(cat => {
        const isDefault = defaultCategories.includes(cat);
        return `
            <div class="category-item">
                <span class="category-name">${cat}</span>
                ${isDefault ?
                    '<span class="badge badge-blue">Default</span>' :
                    `<button onclick="deleteCategory('${cat}')" class="btn-delete">Delete</button>`
                }
            </div>
        `;
    }).join('');

    container.innerHTML = html;
}

async function addCategory() {
    const input = document.getElementById('newCategory');
    const categoryName = input.value.trim();
    const status = document.getElementById('categoryStatus');

    if (!categoryName) {
        showStatus(status, 'Please enter a category name', 'error');
        return;
    }

    // Check for duplicates
    if (currentCategories.some(c => c.toLowerCase() === categoryName.toLowerCase())) {
        showStatus(status, 'Category already exists', 'error');
        return;
    }

    try {
        const token = localStorage.getItem('access_token');
        const response = await fetch(`${window.location.origin}/api/categories`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ category: categoryName })
        });

        if (!response.ok) {
            throw new Error('Failed to add category');
        }

        showStatus(status, `✅ Category "${categoryName}" added successfully!`, 'success');
        input.value = '';
        await loadCategories();
    } catch (error) {
        console.error('Error adding category:', error);
        showStatus(status, 'Failed to add category', 'error');
    }
}

async function deleteCategory(categoryName) {
    if (!confirm(`Are you sure you want to delete "${categoryName}"?`)) {
        return;
    }

    const status = document.getElementById('categoryStatus');

    try {
        const token = localStorage.getItem('access_token');
        const response = await fetch(`${window.location.origin}/api/categories/${encodeURIComponent(categoryName)}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to delete category');
        }

        showStatus(status, `✅ Category "${categoryName}" deleted`, 'success');
        await loadCategories();
    } catch (error) {
        console.error('Error deleting category:', error);
        showStatus(status, 'Failed to delete category', 'error');
    }
}

// ========== BUDGET TARGETS ==========

async function loadBudgetTargets() {
    try {
        const data = await api.getBudgetTargets();
        currentBudgets = data.targets || [];
        renderBudgetTargets();
    } catch (error) {
        console.error('Failed to load budget targets:', error);
        document.getElementById('budgetsList').innerHTML =
            '<p class="text-center" style="color: #ef4444; padding: 2rem;">Failed to load budget targets</p>';
    }
}

function renderBudgetTargets() {
    const container = document.getElementById('budgetsList');

    if (currentBudgets.length === 0) {
        container.innerHTML = '<p class="text-center" style="color: #6b7280; padding: 2rem;">No budget targets set yet. Add one above!</p>';
        return;
    }

    const html = currentBudgets.map(budget => `
        <div class="budget-item">
            <div class="budget-info">
                <span class="budget-category">${budget.category}</span>
                <span class="budget-amount">£${parseFloat(budget.target_amount).toFixed(2)}</span>
            </div>
            <button onclick="deleteBudgetTarget('${budget.category}')" class="btn-delete">Delete</button>
        </div>
    `).join('');

    container.innerHTML = html;
}

function updateBudgetCategoryDropdown() {
    const select = document.getElementById('budgetCategory');

    if (currentCategories.length === 0) {
        select.innerHTML = '<option value="">No categories available</option>';
        return;
    }

    const options = currentCategories.map(cat =>
        `<option value="${cat}">${cat}</option>`
    ).join('');

    select.innerHTML = '<option value="">Select a category</option>' + options;
}

async function setBudgetTarget() {
    const categorySelect = document.getElementById('budgetCategory');
    const amountInput = document.getElementById('budgetAmount');
    const status = document.getElementById('budgetStatus');

    const category = categorySelect.value;
    const amount = parseFloat(amountInput.value);

    if (!category) {
        showStatus(status, 'Please select a category', 'error');
        return;
    }

    if (!amount || amount <= 0) {
        showStatus(status, 'Please enter a valid amount', 'error');
        return;
    }

    try {
        const token = localStorage.getItem('access_token');
        const response = await fetch(`${window.location.origin}/api/budget-targets`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                category: category,
                target_amount: amount
            })
        });

        if (!response.ok) {
            throw new Error('Failed to set budget target');
        }

        showStatus(status, `✅ Budget target for "${category}" set to £${amount.toFixed(2)}`, 'success');
        categorySelect.value = '';
        amountInput.value = '';
        await loadBudgetTargets();
    } catch (error) {
        console.error('Error setting budget target:', error);
        showStatus(status, 'Failed to set budget target', 'error');
    }
}

async function deleteBudgetTarget(category) {
    if (!confirm(`Delete budget target for "${category}"?`)) {
        return;
    }

    const status = document.getElementById('budgetStatus');

    try {
        const token = localStorage.getItem('access_token');
        const response = await fetch(`${window.location.origin}/api/budget-targets/${encodeURIComponent(category)}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to delete budget target');
        }

        showStatus(status, `✅ Budget target for "${category}" deleted`, 'success');
        await loadBudgetTargets();
    } catch (error) {
        console.error('Error deleting budget target:', error);
        showStatus(status, 'Failed to delete budget target', 'error');
    }
}

// ========== HELPERS ==========

function showStatus(element, message, type) {
    element.textContent = message;
    element.className = type === 'error' ? 'text-red' : 'text-green';
    element.style.fontSize = '0.9rem';
    element.style.fontWeight = '500';

    setTimeout(() => {
        element.textContent = '';
    }, 5000);
}
