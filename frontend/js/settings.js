// frontend/js/settings.js

let allCategoriesData = [];  // [{name, builtin_keywords, extra_keywords, is_builtin}]
let pendingKeywords   = {};  // {categoryName: [...keywords]} - unsaved changes
let currentBudgets    = [];
let currentSuggestions = {};
let currentAccounts = [];
let currentRecurringRules = [];

document.addEventListener('DOMContentLoaded', async () => {
    const token = await window.checkAuth();
    if (!token) { console.error('No valid auth, redirecting'); return; }

    const email = localStorage.getItem('user_email');
    document.getElementById('userEmail').textContent = email || 'User';

    await loadAccounts();
    await loadCategories();
    await loadBudgetTargets();
    await loadRecurringRules();

    document.getElementById('recurringAccountScope')?.addEventListener('change', loadRecurringRules);
    document.getElementById('recurringStatusFilter')?.addEventListener('change', loadRecurringRules);
});

async function loadAccounts() {
    try {
        const data = await api.getAccounts();
        currentAccounts = data?.accounts || [];
        renderAccounts();
        populateRecurringAccountScope();
        populateManualRecurringInputs();
    } catch (error) {
        console.error('Failed to load accounts:', error);
        const el = document.getElementById('accountsList');
        if (el) el.innerHTML = '<p style="color:#ef4444;">Failed to load accounts</p>';
    }
}

function renderAccounts() {
    const el = document.getElementById('accountsList');
    if (!el) return;
    if (currentAccounts.length === 0) {
        el.innerHTML = '<p style="color:#9ca3af; font-size:0.875rem;">No accounts configured.</p>';
        return;
    }
    el.innerHTML = currentAccounts.map(acc => `
        <div class="budget-item">
            <div class="budget-info">
                <span class="budget-category">${escHtml(acc.name)} ${acc.is_default ? '<span class="accordion-badge">Default</span>' : ''}</span>
                <span class="budget-amount" style="font-size:0.85rem; color:#6b7280; text-transform:uppercase;">${escHtml(acc.account_type)}</span>
            </div>
            <div style="display:flex; gap:0.5rem;">
                ${acc.is_default ? '' : `<button class="btn btn-secondary" style="width:auto; padding:0.4rem 0.7rem;" onclick="makeDefaultAccount('${escAttr(acc.id)}')">Make Default</button>`}
                ${acc.is_default ? '' : `<button class="btn-delete" onclick="deleteAccount('${escAttr(acc.id)}')">Delete</button>`}
            </div>
        </div>
    `).join('');
}

function populateRecurringAccountScope() {
    const select = document.getElementById('recurringAccountScope');
    if (!select) return;

    const selected = select.value || 'all';
    select.innerHTML = '<option value="all">All accounts</option>' + currentAccounts
        .map((acc) => `<option value="${escAttr(acc.id)}">${escHtml(acc.name)}</option>`)
        .join('');

    if (selected === 'all' || currentAccounts.some((acc) => acc.id === selected)) {
        select.value = selected;
    } else {
        select.value = 'all';
    }
}

function populateManualRecurringInputs() {
    const accountSelect = document.getElementById('manualRecurringAccount');
    if (accountSelect) {
        accountSelect.innerHTML = currentAccounts.map((acc) =>
            `<option value="${escAttr(acc.id)}">${escHtml(acc.name)}</option>`
        ).join('');
    }

    const categorySelect = document.getElementById('manualRecurringCategory');
    if (categorySelect) {
        const names = allCategoriesData.length ? allCategoriesData.map((cat) => cat.name) : ['Uncategorized'];
        categorySelect.innerHTML = names.map((name) =>
            `<option value="${escHtml(name)}">${escHtml(name)}</option>`
        ).join('');
    }
}

async function createAccount() {
    const name = document.getElementById('accountName')?.value.trim();
    const type = document.getElementById('accountType')?.value;
    if (!name) return alert('Please enter an account name.');
    try {
        await api.createAccount(name, type);
        document.getElementById('accountName').value = '';
        await loadAccounts();
    } catch (error) {
        alert('Failed to create account: ' + error.message);
    }
}

async function makeDefaultAccount(accountId) {
    try {
        await api.updateAccount(accountId, { is_default: true });
        await loadAccounts();
    } catch (error) {
        alert('Failed to set default account: ' + error.message);
    }
}

async function deleteAccount(accountId) {
    if (!confirm('Delete this account? It must be empty and non-default.')) return;
    try {
        await api.deleteAccount(accountId);
        await loadAccounts();
    } catch (error) {
        alert('Failed to delete account: ' + error.message);
    }
}

function recurringStatusBadge(status) {
    if (status === 'ignored') {
        return '<span style="display:inline-block;padding:0.15rem 0.5rem;border-radius:999px;background:#e5e7eb;color:#374151;font-size:0.75rem;font-weight:600;">Ignored</span>';
    }
    return '<span style="display:inline-block;padding:0.15rem 0.5rem;border-radius:999px;background:#dcfce7;color:#166534;font-size:0.75rem;font-weight:600;">Active</span>';
}

function recurringCadenceLabel(cadence) {
    if (!cadence) return 'Irregular';
    const value = String(cadence).toLowerCase();
    if (value === 'biweekly') return 'Biweekly';
    return value.charAt(0).toUpperCase() + value.slice(1);
}

function renderRecurringRules() {
    const listEl = document.getElementById('recurringRulesList');
    if (!listEl) return;
    if (currentRecurringRules.length === 0) {
        listEl.innerHTML = '<p style="color:#9ca3af; font-size:0.875rem;">No recurring rules found for this scope.</p>';
        return;
    }

    listEl.innerHTML = currentRecurringRules.map((rule) => `
        <div class="budget-item">
            <div class="budget-info" style="max-width:65%;">
                <span class="budget-category">${escHtml(rule.display_name || 'Unknown')}</span>
                <span class="budget-amount" style="font-size:0.82rem; color:#6b7280;">
                    ${recurringCadenceLabel(rule.cadence)} | £${Number(rule.average_amount || 0).toFixed(2)} | Next: ${escHtml(rule.next_expected_date || '-')} | Confidence: ${Number(rule.confidence || 0).toFixed(1)}%
                </span>
            </div>
            <div style="display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap; justify-content:flex-end;">
                ${recurringStatusBadge(rule.status)}
                <select id="recurring-category-${escId(rule.id)}" class="form-select" style="min-width:130px; height:34px; padding:0.25rem 0.45rem;">
                    ${allCategoriesData.map((cat) => {
                        const selected = cat.name === rule.category ? 'selected' : '';
                        return `<option value="${escHtml(cat.name)}" ${selected}>${escHtml(cat.name)}</option>`;
                    }).join('')}
                </select>
                <button class="btn btn-secondary" style="width:auto; padding:0.35rem 0.65rem;" onclick="saveRecurringRule('${escAttr(rule.id)}')">Save</button>
                <button class="btn btn-secondary" style="width:auto; padding:0.35rem 0.65rem;" onclick="toggleRecurringStatus('${escAttr(rule.id)}', '${escAttr(rule.status)}')">
                    ${rule.status === 'active' ? 'Ignore' : 'Restore'}
                </button>
            </div>
        </div>
    `).join('');
}

async function loadRecurringRules() {
    const statusEl = document.getElementById('recurringStatus');
    const scope = document.getElementById('recurringAccountScope')?.value || 'all';
    const status = document.getElementById('recurringStatusFilter')?.value || 'active';

    if (statusEl) statusEl.textContent = 'Loading recurring rules...';
    try {
        const data = await api.getRecurring({ status, includeUpcoming: true, accountId: scope });
        currentRecurringRules = data?.rules || [];
        renderRecurringRules();
        if (statusEl) statusEl.textContent = `${currentRecurringRules.length} ${status} rule(s)`;
    } catch (error) {
        console.error('Failed to load recurring rules:', error);
        currentRecurringRules = [];
        renderRecurringRules();
        if (statusEl) statusEl.textContent = `Failed to load recurring rules: ${error.message}`;
    }
}

async function recomputeRecurringRules() {
    const btn = document.getElementById('recomputeRecurringBtn');
    const statusEl = document.getElementById('recurringStatus');
    const scope = document.getElementById('recurringAccountScope')?.value || 'all';

    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Recomputing...';
    }
    if (statusEl) statusEl.textContent = 'Recomputing recurring rules...';

    try {
        const result = await api.recomputeRecurring({
            lookbackMonths: 12,
            minOccurrences: 2,
            accountId: scope,
        });
        if (statusEl) {
            statusEl.textContent = `Recompute complete: ${result.rules_created || 0} created, ${result.rules_updated || 0} updated, ${result.scanned_transactions || 0} scanned.`;
        }
        await loadRecurringRules();
    } catch (error) {
        console.error('Failed to recompute recurring rules:', error);
        if (statusEl) statusEl.textContent = `Recompute failed: ${error.message}`;
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Recompute Rules';
        }
    }
}

async function createRecurringRule() {
    const name = document.getElementById('manualRecurringName')?.value.trim();
    const accountId = document.getElementById('manualRecurringAccount')?.value;
    const category = document.getElementById('manualRecurringCategory')?.value || 'Uncategorized';
    const cadence = document.getElementById('manualRecurringCadence')?.value || 'monthly';
    const amount = parseFloat(document.getElementById('manualRecurringAmount')?.value || '0');
    const nextDate = document.getElementById('manualRecurringDate')?.value;
    const statusEl = document.getElementById('recurringStatus');

    if (!name) return alert('Please enter a merchant/rule name.');
    if (!accountId) return alert('Please select an account.');
    if (!Number.isFinite(amount) || amount <= 0) return alert('Please enter a valid amount.');
    if (!nextDate) return alert('Please select next expected date.');

    try {
        await api.createRecurringRule({
            account_id: accountId,
            display_name: name,
            category,
            cadence,
            average_amount: amount,
            next_expected_date: nextDate,
            confidence: 95,
            status: 'active',
        });

        document.getElementById('manualRecurringName').value = '';
        document.getElementById('manualRecurringAmount').value = '';
        document.getElementById('manualRecurringDate').value = '';
        if (statusEl) statusEl.textContent = 'Recurring rule created.';
        await loadRecurringRules();
    } catch (error) {
        console.error('Failed to create recurring rule:', error);
        if (statusEl) statusEl.textContent = `Create failed: ${error.message}`;
    }
}

async function saveRecurringRule(ruleId) {
    const select = document.getElementById(`recurring-category-${escId(ruleId)}`);
    const statusEl = document.getElementById('recurringStatus');
    if (!select) return;

    try {
        await api.updateRecurringRule(ruleId, { category: select.value });
        if (statusEl) statusEl.textContent = 'Recurring rule updated.';
        await loadRecurringRules();
    } catch (error) {
        console.error('Failed to update recurring rule:', error);
        if (statusEl) statusEl.textContent = `Update failed: ${error.message}`;
    }
}

async function toggleRecurringStatus(ruleId, currentStatus) {
    const nextStatus = currentStatus === 'active' ? 'ignored' : 'active';
    const statusEl = document.getElementById('recurringStatus');
    try {
        await api.updateRecurringRule(ruleId, { status: nextStatus });
        if (statusEl) statusEl.textContent = `Rule marked ${nextStatus}.`;
        await loadRecurringRules();
    } catch (error) {
        console.error('Failed to update recurring status:', error);
        if (statusEl) statusEl.textContent = `Status update failed: ${error.message}`;
    }
}

// ---------------------------------------------------------------------------
// Tab switching
// ---------------------------------------------------------------------------
function showTab(tab) {
    document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    document.getElementById('categoriesSection').classList.toggle('hidden', tab !== 'categories');
    document.getElementById('budgetSection').classList.toggle('hidden', tab === 'categories');
}

// ---------------------------------------------------------------------------
// Categories - load + render
// ---------------------------------------------------------------------------
async function loadCategories() {
    try {
        const data = await api.getCategories();
        allCategoriesData = data.all_categories || [];
        pendingKeywords = {};
        allCategoriesData.forEach(cat => {
            pendingKeywords[cat.name] = [...(cat.extra_keywords || [])];
        });
        renderCategories();
        updateBudgetCategoryDropdown();
        populateManualRecurringInputs();
    } catch (error) {
        console.error('Failed to load categories:', error);
        document.getElementById('categoriesList').innerHTML =
            '<p style="color:#ef4444; font-size:0.875rem; padding:0.5rem 0;">Failed to load categories</p>';
    }
}

function renderCategories() {
    const container = document.getElementById('categoriesList');

    if (allCategoriesData.length === 0) {
        container.innerHTML = '<p style="color:#9ca3af; font-size:0.875rem; padding:0.5rem 0;">No categories found.</p>';
        return;
    }

    container.innerHTML = allCategoriesData.map(cat => {
        const safeId   = escId(cat.name);
        const safeAttr = escAttr(cat.name);

        const builtinChips = (cat.builtin_keywords || []).map(kw =>
            `<span class="kw-chip kw-chip--builtin" title="Built-in keyword">${escHtml(kw)}</span>`
        ).join('');

        const extraChips = (pendingKeywords[cat.name] || []).map(kw =>
            `<span class="kw-chip kw-chip--custom">
                ${escHtml(kw)}
                <button class="kw-chip__remove" onclick="removeKeyword('${safeAttr}', '${escAttr(kw)}')" title="Remove">&times;</button>
            </span>`
        ).join('');

        const deleteBtn = !cat.is_builtin
            ? `<button class="accordion-delete" onclick="confirmDeleteCategory('${safeAttr}')" title="Delete category">&#128465;</button>`
            : '';

        const hasChips = builtinChips || extraChips;

        return `
            <div class="accordion-item" id="acc-${safeId}">
                <div class="accordion-header" onclick="toggleAccordion('${safeAttr}')">
                    <div class="accordion-header__left">
                        <span class="accordion-chevron" id="chev-${safeId}">&#9654;</span>
                        <span class="accordion-title">${escHtml(cat.name)}</span>
                        ${!cat.is_builtin ? '<span class="accordion-badge">Custom</span>' : ''}
                    </div>
                    <div class="accordion-header__right" onclick="event.stopPropagation()">
                        ${deleteBtn}
                    </div>
                </div>
                <div class="accordion-body hidden" id="body-${safeId}">
                    ${hasChips
                        ? `<div class="kw-chips-row">${builtinChips}${extraChips}</div>`
                        : `<p class="kw-empty">No keywords yet. Add one below.</p>`
                    }
                    <div class="kw-input-row">
                        <input
                            type="text"
                            class="kw-input"
                            id="kwinput-${safeId}"
                            placeholder="Add keyword, press Enter"
                            onkeydown="handleKeywordInput(event, '${safeAttr}')"
                        />
                        <button class="kw-add-btn" onclick="addKeywordFromInput('${safeAttr}')">Add</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ---------------------------------------------------------------------------
// Accordion toggle
// ---------------------------------------------------------------------------
function toggleAccordion(name) {
    const safeId = escId(name);
    const body   = document.getElementById(`body-${safeId}`);
    const chev   = document.getElementById(`chev-${safeId}`);
    const isOpen = !body.classList.contains('hidden');

    // Close all
    document.querySelectorAll('.accordion-body').forEach(b => b.classList.add('hidden'));
    document.querySelectorAll('.accordion-chevron').forEach(c => c.innerHTML = '&#9654;');

    // Open clicked if it was closed
    if (!isOpen) {
        body.classList.remove('hidden');
        chev.innerHTML = '&#9660;';
        const input = document.getElementById(`kwinput-${safeId}`);
        if (input) input.focus();
    }
}

function reopenAccordion(name) {
    const safeId = escId(name);
    const body   = document.getElementById(`body-${safeId}`);
    const chev   = document.getElementById(`chev-${safeId}`);
    if (body && chev) {
        body.classList.remove('hidden');
        chev.innerHTML = '&#9660;';
    }
}

// ---------------------------------------------------------------------------
// Keyword management
// ---------------------------------------------------------------------------
function handleKeywordInput(event, categoryName) {
    if (event.key === 'Enter' || event.key === ',') {
        event.preventDefault();
        addKeywordFromInput(categoryName);
    }
}

function addKeywordFromInput(categoryName) {
    const input = document.getElementById(`kwinput-${escId(categoryName)}`);
    if (!input) return;
    const kw = input.value.trim().replace(/,$/, '');
    if (!kw) return;
    addKeyword(categoryName, kw);
    input.value = '';
    input.focus();
}

function addKeyword(categoryName, keyword) {
    if (!pendingKeywords[categoryName]) pendingKeywords[categoryName] = [];
    const lowers = pendingKeywords[categoryName].map(k => k.toLowerCase());
    if (lowers.includes(keyword.toLowerCase())) return;  // silent dedupe
    pendingKeywords[categoryName].push(keyword);
    renderCategories();
    reopenAccordion(categoryName);
}

function removeKeyword(categoryName, keyword) {
    if (!pendingKeywords[categoryName]) return;
    pendingKeywords[categoryName] = pendingKeywords[categoryName]
        .filter(k => k.toLowerCase() !== keyword.toLowerCase());
    renderCategories();
    reopenAccordion(categoryName);
}

// ---------------------------------------------------------------------------
// Save all categories
// ---------------------------------------------------------------------------
async function saveCategories() {
    const btn = document.getElementById('saveCategoriesBtn');
    btn.textContent = 'Saving...';
    btn.disabled = true;

    try {
        const promises = allCategoriesData.map(cat =>
            api.updateCategoryKeywords(cat.name, pendingKeywords[cat.name] || [])
        );
        await Promise.all(promises);

        btn.textContent = 'Saved!';
        btn.classList.add('btn--success');
        await loadCategories();

        setTimeout(() => {
            btn.textContent = 'Save Changes';
            btn.classList.remove('btn--success');
            btn.disabled = false;
        }, 2000);
    } catch (err) {
        console.error('Save failed:', err);
        btn.textContent = 'Save Failed';
        btn.disabled = false;
    }
}

// ---------------------------------------------------------------------------
// Add category modal
// ---------------------------------------------------------------------------
function openAddCategory() {
    document.getElementById('addCategoryModal').classList.remove('hidden');
    setTimeout(() => document.getElementById('newCategoryName').focus(), 50);
}

function closeAddCategory() {
    document.getElementById('addCategoryModal').classList.add('hidden');
    document.getElementById('newCategoryName').value = '';
}

async function submitNewCategory() {
    const input = document.getElementById('newCategoryName');
    const name  = input.value.trim();
    if (!name) return;

    const exists = allCategoriesData.some(c => c.name.toLowerCase() === name.toLowerCase());
    if (exists) {
        alert(`Category "${name}" already exists.`);
        return;
    }

    try {
        await api.createCustomCategory(name, []);
        closeAddCategory();
        await loadCategories();
    } catch (err) {
        alert('Failed to create category: ' + err.message);
    }
}

async function confirmDeleteCategory(name) {
    if (!confirm(`Delete category "${name}"?\n\nTransactions assigned to it will not be deleted, but the category will be removed.`)) return;
    try {
        await api.deleteCategory(name);
        await loadCategories();
    } catch (err) {
        alert('Failed to delete: ' + err.message);
    }
}

// ---------------------------------------------------------------------------
// Budget category dropdown helper
// ---------------------------------------------------------------------------
function updateBudgetCategoryDropdown() {
    const select = document.getElementById('budgetCategory');
    if (!select) return;
    const names = allCategoriesData.map(c => c.name).filter(n => n !== 'Uncategorized' && n !== 'Transfer');
    select.innerHTML = names.map(cat =>
        `<option value="${escHtml(cat)}">${escHtml(cat)}</option>`
    ).join('');
}

// ---------------------------------------------------------------------------
// Escape helpers
// ---------------------------------------------------------------------------
function escAttr(str) {
    return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}
function escId(str) {
    return String(str).replace(/[^a-zA-Z0-9]/g, '_');
}
function escHtml(str) {
    const d = document.createElement('div');
    d.textContent = String(str);
    return d.innerHTML;
}

// ---------------------------------------------------------------------------
// Budget targets
// ---------------------------------------------------------------------------
async function loadBudgetTargets() {
    try {
        const data = await api.getBudgetTargets();
        currentBudgets = data.targets || [];
        renderBudgetTargets();
    } catch (error) {
        console.error('Failed to load budget targets:', error);
        document.getElementById('budgetsList').innerHTML =
            '<p style="color:#ef4444; font-size:0.875rem; padding:0.5rem 0;">Failed to load budget targets</p>';
    }
}

function renderBudgetTargets() {
    const container = document.getElementById('budgetsList');
    if (currentBudgets.length === 0) {
        container.innerHTML = '<p style="color:#9ca3af; font-size:0.875rem; padding:0.5rem 0;">No budget targets set yet. Add one above!</p>';
        return;
    }
    container.innerHTML = currentBudgets.map(budget => {
        const safeId = escId(budget.category);
        const threshold = Number.isFinite(parseFloat(budget.threshold_percent))
            ? parseFloat(budget.threshold_percent)
            : 80;
        return `
        <div class="budget-item">
            <div class="budget-info" style="flex:1;">
                <span class="budget-category">${escHtml(budget.category)}</span>
                <span class="budget-amount">£${parseFloat(budget.target_amount).toFixed(0)}/mo</span>
                <span style="font-size:0.75rem;color:#6b7280;">Alert at ${threshold.toFixed(0)}%</span>
            </div>
            <div style="display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap;">
                <input id="target-${safeId}" type="number" min="0" step="0.01" value="${parseFloat(budget.target_amount).toFixed(2)}" style="width:100px; padding:0.35rem; border:1px solid #d1d5db; border-radius:0.375rem; font-size:0.75rem;" title="Monthly target">
                <input id="threshold-${safeId}" type="number" min="1" max="100" step="1" value="${threshold.toFixed(0)}" style="width:85px; padding:0.35rem; border:1px solid #d1d5db; border-radius:0.375rem; font-size:0.75rem;" title="Alert threshold percent">
                <button onclick="updateBudgetTargetInline('${escAttr(budget.category)}')" style="padding:0.35rem 0.5rem; border:1px solid #d1d5db; border-radius:0.375rem; background:#fff; font-size:0.75rem; cursor:pointer;">Save</button>
            </div>
            <button class="btn-delete" onclick="deleteBudgetTarget('${escAttr(budget.category)}')">Remove</button>
        </div>`;
    }).join('');
}

async function setBudgetTarget() {
    const category = document.getElementById('budgetCategory').value;
    const amount   = parseFloat(document.getElementById('budgetAmount').value);
    const threshold = parseFloat(document.getElementById('budgetThreshold').value);

    if (!category || isNaN(amount) || amount <= 0 || isNaN(threshold) || threshold < 1 || threshold > 100) {
        document.getElementById('budgetStatus').textContent = 'Please enter a valid category, amount, and threshold (1-100).';
        return;
    }

    try {
        await api.setBudgetTarget(category, amount, threshold);
        document.getElementById('budgetAmount').value = '';
        document.getElementById('budgetThreshold').value = '80';
        document.getElementById('budgetStatus').textContent = '';
        await loadBudgetTargets();
    } catch (error) {
        console.error('Failed to set budget target:', error);
        document.getElementById('budgetStatus').textContent = 'Failed to save budget target.';
    }
}

async function updateBudgetTargetInline(category) {
    const safeId = escId(category);
    const amount = parseFloat(document.getElementById(`target-${safeId}`)?.value);
    const threshold = parseFloat(document.getElementById(`threshold-${safeId}`)?.value);

    if (isNaN(amount) || amount <= 0 || isNaN(threshold) || threshold < 1 || threshold > 100) {
        alert('Please enter a valid target and threshold (1-100).');
        return;
    }

    try {
        await api.updateBudgetTarget(category, {
            target_amount: amount,
            threshold_percent: threshold,
        });
        await loadBudgetTargets();
    } catch (error) {
        console.error('Failed to update budget target:', error);
        alert('Failed to update budget target: ' + error.message);
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
// AI Budget Suggestions
// ---------------------------------------------------------------------------
async function loadBudgetSuggestions() {
    const btn       = document.getElementById('suggestBtn');
    const loading   = document.getElementById('suggestionsLoading');
    const container = document.getElementById('suggestionsContainer');
    const list      = document.getElementById('suggestionsList');

    btn.disabled = true;
    loading.classList.remove('hidden');
    container.classList.add('hidden');

    try {
        const data = await api.getBudgetSuggestions();
        currentSuggestions = data.suggestions || {};

        if (Object.keys(currentSuggestions).length === 0) {
            list.innerHTML = '<p style="color:#9ca3af; font-size:0.875rem;">Not enough data to generate suggestions yet.</p>';
        } else {
            list.innerHTML = Object.entries(currentSuggestions).map(([cat, amount]) => `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:0.5rem 0.75rem; background:#f0f9ff; border-radius:0.375rem; font-size:0.875rem;">
                    <span style="font-weight:500; color:#1f2937;">${escHtml(cat)}</span>
                    <span style="font-weight:700; color:#0369a1;">£${amount}/mo</span>
                </div>
            `).join('');
        }

        loading.classList.add('hidden');
        container.classList.remove('hidden');
    } catch (error) {
        console.error('Failed to load suggestions:', error);
        loading.classList.add('hidden');
    } finally {
        btn.disabled = false;
    }
}

async function applyAllSuggestions() {
    const btn = event.target;
    btn.textContent = 'Applying...';
    btn.disabled = true;

    try {
        const promises = Object.entries(currentSuggestions).map(([cat, amount]) =>
            api.setBudgetTarget(cat, amount)
        );
        await Promise.all(promises);
        await loadBudgetTargets();
        btn.textContent = 'Applied!';
        currentSuggestions = {};
        setTimeout(() => {
            btn.textContent = 'Apply All Suggestions';
            btn.disabled = false;
        }, 2000);
    } catch (error) {
        console.error('Failed to apply suggestions:', error);
        btn.textContent = 'Apply All Suggestions';
        btn.disabled = false;
    }
}

function logout() {
    window.logout();
}
