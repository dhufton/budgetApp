// frontend/js/settings.js
let currentCategories = [];
let currentBudgets = [];
let currentSuggestions = {};  // ← new

document.addEventListener('DOMContentLoaded', async () => {
    const token = await window.checkAuth();
    if (!token) { console.error('No valid auth, redirecting'); return; }

    const email = localStorage.getItem('user_email');
    document.getElementById('userEmail').textContent = email || 'User';

    await loadCategories();
    await loadBudgetTargets();
    // Suggestions load lazily on button click — not auto-loaded
});

// ---------------------------------------------------------------------------
// Tab switching (unchanged)
// ---------------------------------------------------------------------------
function showTab(tab) {
    document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    document.getElementById('categoriesSection').classList.toggle('hidden', tab !== 'categories');
    document.getElementById('budgetSection').classList.toggle('hidden', tab === 'categories');
}

// ---------------------------------------------------------------------------
// Categories (unchanged)
// ---------------------------------------------------------------------------
async function loadCategories() {
    try {
        const data = await api.getCategories();
        currentCategories = data.categories || [];
        renderCategories();
        updateBudgetCategoryDropdown();
    } catch (error) {
        console.error('Failed to load categories:', error);
        document.getElementById('categoriesList').innerHTML =
            '<p class="text-red-500 text-sm py-2">Failed to load categories</p>';
    }
}

function renderCategories() {
    const container = document.getElementById('categoriesList');
    if (currentCategories.length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-sm py-2">No custom categories yet. Add one above!</p>';
        return;
    }
    container.innerHTML = currentCategories.map(cat => {
        const isDefault = DEFAULT_CATEGORIES.includes(cat);
        return `
            <div class="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
                <span class="text-sm text-gray-700">${cat}</span>
                ${!isDefault ? `
                    <button onclick="deleteCategory('${cat}')"
                        class="text-red-400 hover:text-red-600 text-xs">Remove</button>
                ` : '<span class="text-xs text-gray-400">Default</span>'}
            </div>`;
    }).join('');
}

async function addCategory() {
    const input = document.getElementById('newCategoryInput');
    const category = input.value.trim();
    if (!category) return;
    try {
        await api.addCategory(category);
        input.value = '';
        await loadCategories();
    } catch (error) {
        console.error('Failed to add category:', error);
        alert('Failed to add category: ' + error.message);
    }
}

async function deleteCategory(category) {
    if (!confirm(`Remove category "${category}"?`)) return;
    try {
        await api.deleteCategory(category);
        await loadCategories();
    } catch (error) {
        console.error('Failed to delete category:', error);
        alert('Failed to delete category: ' + error.message);
    }
}

function updateBudgetCategoryDropdown() {
    const select = document.getElementById('budgetCategorySelect');
    if (!select) return;
    select.innerHTML = currentCategories
        .filter(c => c !== 'Uncategorized')
        .map(cat => `<option value="${cat}">${cat}</option>`)
        .join('');
}

// ---------------------------------------------------------------------------
// Budget targets (unchanged)
// ---------------------------------------------------------------------------
async function loadBudgetTargets() {
    try {
        const data = await api.getBudgetTargets();
        currentBudgets = data.targets || [];
        renderBudgetTargets();
    } catch (error) {
        console.error('Failed to load budget targets:', error);
        document.getElementById('budgetsList').innerHTML =
            '<p class="text-red-500 text-sm py-2">Failed to load budget targets</p>';
    }
}

function renderBudgetTargets() {
    const container = document.getElementById('budgetsList');
    if (currentBudgets.length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-sm py-2">No budget targets set yet. Add one above!</p>';
        return;
    }
    container.innerHTML = currentBudgets.map(budget => `
        <div class="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
            <span class="text-sm text-gray-700">${budget.category}</span>
            <div class="flex items-center gap-3">
                <span class="text-sm font-medium text-gray-800">£${budget.target_amount}/mo</span>
                <button onclick="deleteBudgetTarget('${budget.category}')"
                    class="text-red-400 hover:text-red-600 text-xs">Remove</button>
            </div>
        </div>`).join('');
}

async function setBudgetTarget() {
    const category = document.getElementById('budgetCategorySelect').value;
    const amount = parseFloat(document.getElementById('budgetAmountInput').value);
    if (!category || isNaN(amount) || amount <= 0) {
        alert('Please select a category and enter a valid amount');
        return;
    }
    try {
        await api.setBudgetTarget(category, amount);
        document.getElementById('budgetAmountInput').value = '';
        await loadBudgetTargets();
    } catch (error) {
        console.error('Failed to set budget target:', error);
        alert('Failed to set budget target: ' + error.message);
    }
}

async function deleteBudgetTarget(category) {
    if (!confirm(`Remove budget target for "${category}"?`)) return;
    try {
        await api.deleteBudgetTarget(category);
        await loadBudgetTargets();
    } catch (error) {
        console.error('Failed to delete budget target:', error);
        alert('Failed to delete budget target: ' + error.message);
    }
}

// ---------------------------------------------------------------------------
// AI: Budget suggestions  ← NEW
// ---------------------------------------------------------------------------
window.loadBudgetSuggestions = async function() {
    const btn = document.getElementById('suggestBtn');
    const loading = document.getElementById('suggestionsLoading');
    const container = document.getElementById('suggestionsContainer');
    const list = document.getElementById('suggestionsList');

    btn.disabled = true;
    btn.textContent = '⏳ Analysing...';
    container.classList.add('hidden');
    loading.classList.remove('hidden');

    try {
        const data = await api.getBudgetSuggestions();
        currentSuggestions = data.suggestions || {};

        if (Object.keys(currentSuggestions).length === 0) {
            list.innerHTML = '<p class="text-gray-400 text-sm">Not enough spending history to make suggestions yet.</p>';
        } else {
            const months = data.based_on_months || 0;
            list.innerHTML = `
                <p class="text-xs text-gray-400 mb-2">Based on ${months} month${months !== 1 ? 's' : ''} of spending</p>
                ${Object.entries(currentSuggestions).map(([cat, amount]) => `
                    <div class="flex items-center justify-between py-2 px-3 bg-blue-50 rounded-lg">
                        <span class="text-sm text-gray-700">${cat}</span>
                        <div class="flex items-center gap-2">
                            <span class="text-sm font-semibold text-blue-700">£${amount}/mo</span>
                            <button onclick="applySuggestion('${cat}', ${amount})"
                                class="text-xs bg-white border border-blue-300 hover:bg-blue-100 text-blue-600 px-2 py-1 rounded transition-colors">
                                Apply
                            </button>
                        </div>
                    </div>`).join('')}`;
        }

        loading.classList.add('hidden');
        container.classList.remove('hidden');
        btn.textContent = '🔄 Regenerate';
    } catch (error) {
        console.error('Failed to load budget suggestions:', error);
        list.innerHTML = '<p class="text-red-400 text-sm">Failed to generate suggestions. Please try again.</p>';
        loading.classList.add('hidden');
        container.classList.remove('hidden');
        btn.textContent = '✨ Generate Suggestions';
    } finally {
        btn.disabled = false;
    }
};

window.applySuggestion = async function(category, amount) {
    try {
        await api.setBudgetTarget(category, amount);
        await loadBudgetTargets();
        // Visual confirmation on the applied row
        const buttons = document.querySelectorAll(`#suggestionsList button`);
        buttons.forEach(btn => {
            if (btn.getAttribute('onclick')?.includes(`'${category}'`)) {
                btn.textContent = '✅';
                btn.disabled = true;
            }
        });
    } catch (error) {
        console.error('Failed to apply suggestion:', error);
        alert('Failed to apply suggestion: ' + error.message);
    }
};

window.applyAllSuggestions = async function() {
    const entries = Object.entries(currentSuggestions);
    if (entries.length === 0) return;

    const btn = document.querySelector('[onclick="applyAllSuggestions()"]');
    btn.disabled = true;
    btn.textContent = '⏳ Applying...';

    for (const [category, amount] of entries) {
        try {
            await api.setBudgetTarget(category, amount);
        } catch (error) {
            console.error(`Failed to apply ${category}:`, error);
        }
    }

    await loadBudgetTargets();
    btn.textContent = '✅ All Applied';
    currentSuggestions = {};
};
