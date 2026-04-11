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
let pendingSuggestionItems = [];

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
        bindEvent('recategoriseBtn',   'click',  recategoriseUncategorisedNow);
        bindEvent('generateMonthlyReviewBtn', 'click', generateMonthlyReview);
        bindEvent('acceptHighConfidenceBtn', 'click', acceptHighConfidenceSuggestions);
        bindEvent('approveSelectedBtn', 'click', approveSelectedSuggestions);
        bindEvent('rejectSelectedBtn', 'click', rejectSelectedSuggestions);
        bindEvent('selectAllSuggestions', 'change', toggleAllSuggestions);
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
        document.getElementById('aiReviewRows')?.addEventListener('click', async (e) => {
            const btn = e.target.closest('button[data-action=\"override\"]');
            if (!btn) return;
            const suggestionId = btn.dataset.suggestionId;
            const select = document.getElementById(`override-${suggestionId}`);
            if (!select) return;
            await overrideSuggestion(suggestionId, select.value, btn);
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

function buildCategoryList(apiCategories = [], txns = []) {
    const seen = new Set();
    const addCategory = (value) => {
        const name = String(value || '').trim();
        if (name) seen.add(name);
    };

    DEFAULT_CATEGORIES.forEach(addCategory);
    (apiCategories || []).forEach(addCategory);
    (txns || []).forEach((txn) => addCategory(txn?.category || 'Uncategorized'));

    const orderedDefaults = DEFAULT_CATEGORIES.filter((cat) => seen.has(cat));
    const custom = [...seen]
        .filter((cat) => !DEFAULT_CATEGORIES.includes(cat))
        .sort((a, b) => a.localeCompare(b));

    return [...orderedDefaults, ...custom];
}

function renderUncategorisedStatus() {
    const uncategorizedCount = allTransactions.filter(t => t.category === 'Uncategorized').length;
    const alertEl = document.getElementById('uncategorizedAlert');
    const countEl = document.getElementById('uncategorizedCount');
    const btn = document.getElementById('fixCategoriesBtn');

    if (!alertEl || !countEl) return;

    if (uncategorizedCount > 0) {
        alertEl.classList.remove('hidden');
        countEl.textContent = `${uncategorizedCount} transaction${uncategorizedCount !== 1 ? 's' : ''} need categorisation`;
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Generate AI Suggestions';
            btn.classList.remove('hidden', 'opacity-75', 'cursor-not-allowed');
        }
        return;
    }

    alertEl.classList.add('hidden');
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
            try {
                await api.categoriseTransactions(uploadAccount);
            } catch (error) {
                console.error('Auto recategorise after upload failed:', error);
            }
            try {
                await api.recomputeRecurring({ lookbackMonths: 12, minOccurrences: 2, accountId: uploadAccount });
            } catch (error) {
                console.error('Auto recurring recompute after upload failed:', error);
            }
            await loadDashboard();
            showLoading(false);
            status.textContent = finalMessage;
        }, 1000);
    }
}

async function recategoriseUncategorisedNow() {
    const btn = document.getElementById('recategoriseBtn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Recategorising...';
    }
    try {
        const result = await api.categoriseTransactions(currentAccountId);
        const countEl = document.getElementById('uncategorizedCount');
        if (countEl) {
            countEl.textContent = result?.message || `Categorised ${result?.changed || 0} transactions`;
        }
        await loadDashboard();
    } catch (error) {
        console.error('Recategorise failed:', error);
        alert(`Recategorise failed: ${error.message}`);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Recategorise Uncategorised';
        }
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
        allCategories = buildCategoryList(data?.categories || [], allTransactions);
    } catch {
        allCategories = buildCategoryList(allCategories, allTransactions);
    }
}

// ---------------------------------------------------------------------------
// Load dashboard
// ---------------------------------------------------------------------------
async function loadDashboard() {
    try {
        const [transactionsData, categoriesData] = await Promise.all([
            api.getTransactions(currentAccountId),
            api.getCategories().catch(() => null),
        ]);
        if (!transactionsData?.transactions) { showEmptyState(); return; }

        allTransactions = transactionsData.transactions;
        allCategories = buildCategoryList(categoriesData?.categories || allCategories, allTransactions);
        filteredTransactions = [...allTransactions];
        currentPage = 1;

        document.getElementById('totalTransactions').textContent = allTransactions.length.toLocaleString();
        renderUncategorisedStatus();

        if (allTransactions.length === 0) {
            populateCategoryFilter();
            showEmptyState();
            await loadBudgetHealth();
            await loadBudgetTrend();
            await loadReviews();
            await loadRecurringUpcoming();
            await loadAiReviewQueue();
        } else {
            populateCategoryFilter();
            calculateMetrics();
            renderPieChart();
            renderLineChart();
            renderCategorySpendingChart();
            await loadBudgetHealth();
            await loadBudgetTrend();
            await loadReviews();
            await loadRecurringUpcoming();
            await loadAiReviewQueue();
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

function formatReviewTimestamp(value) {
    if (!value) return '-';
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return value;
    return dt.toLocaleString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
}

function formatReviewTypeLabel(reviewType) {
    if (reviewType === 'monthly_closeout') return 'Monthly closeout review';
    if (reviewType === 'upload_snapshot') return 'Upload snapshot review';
    return 'Review';
}

function buildReviewChangeItems(summary) {
    const items = [];
    const flags = summary.flags || [];
    const categoryChanges = summary.category_changes_vs_previous || [];
    const budgetVariance = summary.budget_variance || [];

    for (const flag of flags) {
        const category = String(flag.category || 'Uncategorized');
        const categoryLabel = category.toLowerCase();

        if (flag.type === 'spike_vs_previous') {
            const change = categoryChanges.find((c) => c.category === category);
            const deltaPct = Number(change?.delta_pct || 0);
            if (deltaPct > 0) {
                items.push(`${category}: up ${deltaPct.toFixed(1)}% vs previous period`);
            } else {
                items.push(`Increase in ${categoryLabel} spending`);
            }
            continue;
        }

        if (flag.type === 'over_budget') {
            const varianceRow = budgetVariance.find((b) => b.category === category);
            const overspend = Math.max(0, Number((varianceRow?.actual || 0)) - Number((varianceRow?.target || 0)));
            if (overspend > 0) {
                items.push(`${category}: over budget by ${formatCurrency(overspend)}`);
            } else {
                items.push(`Over budget in ${categoryLabel}`);
            }
            continue;
        }
    }

    return [...new Set(items)];
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
        flagsEl.textContent = 'No notable changes.';
        return;
    }

    const summary = review.summary || {};
    const totals = summary.totals || {};
    const merchants = summary.top_merchants || [];
    const changeItems = buildReviewChangeItems(summary);

    statusEl.textContent = `Latest ${formatReviewTypeLabel(review.review_type)} generated on ${formatReviewTimestamp(review.created_at)}`;
    periodEl.textContent = `${formatReviewDate(review.period_start)} to ${formatReviewDate(review.period_end)}`;
    spentEl.textContent = formatCurrency(totals.spent);
    incomeEl.textContent = formatCurrency(totals.income);
    netEl.textContent = formatCurrency(totals.net);
    if (merchants.length) {
        merchantsEl.innerHTML = `<ul style="margin:0; padding-left:1rem;">${
            merchants
                .slice(0, 5)
                .map((m) => `<li>${m.merchant}: ${formatCurrency(m.amount)}</li>`)
                .join('')
        }</ul>`;
    } else {
        merchantsEl.textContent = '-';
    }
    if (changeItems.length) {
        flagsEl.innerHTML = `<ul style="margin:0; padding-left:1rem;">${
            changeItems.map((item) => `<li>${item}</li>`).join('')
        }</ul>`;
    } else {
        flagsEl.textContent = 'No notable changes.';
    }
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
    if (!btn || !countEl) return;

    btn.disabled = true;
    btn.textContent = 'Generating suggestions...';
    btn.classList.add('opacity-75', 'cursor-not-allowed');
    try {
        const result = await api.categoriseSuggest(currentAccountId, 85);
        if (!result) throw new Error('No response from categorisation service');

        countEl.textContent =
            `AI run: ${result.uncategorised_total} uncategorised, ${result.auto_applied} auto-applied, ${result.needs_review} need review`;
        await loadDashboard();
    } catch (error) {
        console.error('Categorisation failed:', error);
        countEl.textContent = `Categorisation failed: ${error.message}`;
    } finally {
        btn.disabled = false;
        btn.textContent = 'Generate AI Suggestions';
        btn.classList.remove('opacity-75', 'cursor-not-allowed');
    }
}

function escapeHtml(text) {
    if (!text && text !== 0) return '';
    return String(text)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

async function loadAiReviewQueue() {
    const panel = document.getElementById('aiReviewPanel');
    const summaryEl = document.getElementById('aiReviewSummary');
    const rowsEl = document.getElementById('aiReviewRows');
    if (!panel || !summaryEl || !rowsEl) return;

    try {
        const data = await api.getCategoriseReviewQueue(currentAccountId, 100);
        pendingSuggestionItems = data?.items || [];

        if (!pendingSuggestionItems.length) {
            panel.classList.add('hidden');
            summaryEl.textContent = 'No pending AI suggestions.';
            rowsEl.innerHTML = '<tr><td colspan="6" style="padding:0.7rem; color:#6b7280;">No pending suggestions.</td></tr>';
            return;
        }

        panel.classList.remove('hidden');
        summaryEl.textContent = `${pendingSuggestionItems.length} suggestion(s) awaiting review`;
        rowsEl.innerHTML = pendingSuggestionItems.map(renderSuggestionRow).join('');
    } catch (error) {
        console.error('Failed to load AI review queue:', error);
        panel.classList.remove('hidden');
        summaryEl.textContent = 'Failed to load AI review queue';
        rowsEl.innerHTML = `<tr><td colspan="6" style="padding:0.7rem; color:#ef4444;">${escapeHtml(error.message)}</td></tr>`;
    }
}

function renderSuggestionRow(item) {
    const suggestion = item?.suggestion || item || {};
    const txn = item.transaction || {};
    const suggestionId = suggestion.id;
    const selectedCategory = suggestion.suggested_category || 'Uncategorized';
    const confidence = Number(suggestion.confidence || 0).toFixed(1);
    const amount = Number(txn.amount || 0);
    const confidenceColor = Number(confidence) >= 85 ? '#166534' : (Number(confidence) >= 60 ? '#92400e' : '#991b1b');

    return `
        <tr style="border-bottom:1px solid #f3f4f6;">
            <td style="padding:0.45rem 0.25rem;">
                <input type="checkbox" class="suggestion-checkbox" value="${escapeHtml(suggestionId)}">
            </td>
            <td style="padding:0.45rem 0.25rem;">
                <div style="font-weight:600; color:#111827;">${escapeHtml(txn.description || '-')}</div>
                <div style="font-size:0.75rem; color:#6b7280;">${escapeHtml(txn.date || '-')} | ${amount < 0 ? '-' : ''}£${Math.abs(amount).toFixed(2)}</div>
            </td>
            <td style="padding:0.45rem 0.25rem;">${escapeHtml(selectedCategory)}</td>
            <td style="padding:0.45rem 0.25rem; color:${confidenceColor}; font-weight:600;">${confidence}%</td>
            <td style="padding:0.45rem 0.25rem; max-width:260px;">${escapeHtml(suggestion.reason || '-')}</td>
            <td style="padding:0.45rem 0.25rem;">
                <div style="display:flex; gap:0.4rem; align-items:center;">
                    <select id="override-${escapeHtml(suggestionId)}" style="padding:0.25rem; border:1px solid #d1d5db; border-radius:0.25rem; font-size:0.8rem;">
                        ${allCategories.map((cat) => `<option value="${escapeHtml(cat)}" ${cat === selectedCategory ? 'selected' : ''}>${escapeHtml(cat)}</option>`).join('')}
                    </select>
                    <button data-action="override" data-suggestion-id="${escapeHtml(suggestionId)}" class="btn btn-secondary" style="width:auto; padding:0.25rem 0.5rem; font-size:0.75rem;">Apply</button>
                </div>
            </td>
        </tr>
    `;
}

function getSelectedSuggestionIds() {
    const checkboxes = Array.from(document.querySelectorAll('.suggestion-checkbox:checked'));
    return checkboxes.map((el) => el.value).filter(Boolean);
}

function toggleAllSuggestions(event) {
    const checked = Boolean(event.target?.checked);
    document.querySelectorAll('.suggestion-checkbox').forEach((el) => {
        el.checked = checked;
    });
}

async function approveSelectedSuggestions() {
    const ids = getSelectedSuggestionIds();
    if (!ids.length) {
        alert('Select at least one suggestion to approve.');
        return;
    }
    await runSuggestionBatchAction(() => api.categoriseApprove(ids), `Approved ${ids.length} suggestion(s)`);
}

async function rejectSelectedSuggestions() {
    const ids = getSelectedSuggestionIds();
    if (!ids.length) {
        alert('Select at least one suggestion to reject.');
        return;
    }
    await runSuggestionBatchAction(() => api.categoriseReject(ids), `Rejected ${ids.length} suggestion(s)`);
}

async function acceptHighConfidenceSuggestions() {
    await runSuggestionBatchAction(
        () => api.categoriseAcceptHighConfidence(currentAccountId, 85),
        'Applied high-confidence suggestions',
    );
}

async function overrideSuggestion(suggestionId, finalCategory, buttonEl) {
    if (!suggestionId || !finalCategory) return;
    if (buttonEl) buttonEl.disabled = true;
    try {
        await api.categoriseOverride(suggestionId, finalCategory);
        await loadDashboard();
    } catch (error) {
        console.error('Override failed:', error);
        alert(`Override failed: ${error.message}`);
    } finally {
        if (buttonEl) buttonEl.disabled = false;
    }
}

async function runSuggestionBatchAction(actionFn, successMessage) {
    try {
        await actionFn();
        const countEl = document.getElementById('uncategorizedCount');
        if (countEl) countEl.textContent = successMessage;
        await loadDashboard();
    } catch (error) {
        console.error('Suggestion batch action failed:', error);
        alert(`Action failed: ${error.message}`);
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
    const recurringRows = document.getElementById('recurringUpcomingRows');
    if (recurringRows) recurringRows.innerHTML = `<tr><td colspan="5" style="padding:0.7rem; color:#6b7280;">Loading recurring charges...</td></tr>`;
    const recurringSummary = document.getElementById('recurringSummary');
    if (recurringSummary) recurringSummary.textContent = 'Loading...';
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
    const recurringRows = document.getElementById('recurringUpcomingRows');
    if (recurringRows) recurringRows.innerHTML = `<tr><td colspan="5" style="padding:0.7rem; color:#6b7280;">No recurring charge data yet.</td></tr>`;
    const recurringSummary = document.getElementById('recurringSummary');
    if (recurringSummary) recurringSummary.textContent = 'No recurring data';
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

function formatIsoDateForUi(value) {
    if (!value) return '-';
    const dt = new Date(`${value}T00:00:00`);
    if (Number.isNaN(dt.getTime())) return value;
    return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

async function loadRecurringUpcoming() {
    const rowsEl = document.getElementById('recurringUpcomingRows');
    const summaryEl = document.getElementById('recurringSummary');
    if (!rowsEl || !summaryEl) return;

    try {
        const data = await api.getRecurringUpcoming(30, currentAccountId);
        const items = data?.items || [];

        if (!items.length) {
            rowsEl.innerHTML = '<tr><td colspan="5" style="padding:0.7rem; color:#6b7280;">No upcoming recurring charges in the next 30 days.</td></tr>';
            summaryEl.textContent = '0 due in next 30 days';
            return;
        }

        summaryEl.textContent = `${items.length} due in next 30 days`;
        rowsEl.innerHTML = items.map((item) => `
                <tr style="border-bottom:1px solid #f3f4f6;">
                    <td style="padding:0.45rem 0.25rem;">${escapeHtml(item.display_name || '-')}</td>
                    <td style="padding:0.45rem 0.25rem;">${formatIsoDateForUi(item.expected_date)}</td>
                    <td style="padding:0.45rem 0.25rem;">£${Number(item.expected_amount || 0).toFixed(2)}</td>
                    <td style="padding:0.45rem 0.25rem;">${escapeHtml(item.category || 'Uncategorized')}</td>
                    <td style="padding:0.45rem 0.25rem; text-align:right;">
                        <button
                            title="Remove from recurring list"
                            aria-label="Remove recurring rule"
                            onclick="ignoreRecurringRule('${escapeHtml(item.rule_id || '')}')"
                            style="border:1px solid #d1d5db; background:#fff; color:#ef4444; width:1.8rem; height:1.8rem; border-radius:999px; font-weight:700; cursor:pointer;"
                        >×</button>
                    </td>
                </tr>
            `).join('');
    } catch (error) {
        console.error('Failed to load recurring upcoming charges:', error);
        rowsEl.innerHTML = '<tr><td colspan="5" style="padding:0.7rem; color:#ef4444;">Failed to load recurring charges.</td></tr>';
        summaryEl.textContent = 'Recurring data unavailable';
    }
}

async function ignoreRecurringRule(ruleId) {
    if (!ruleId) return;
    try {
        await api.updateRecurringRule(ruleId, { status: 'ignored' });
        await loadRecurringUpcoming();
    } catch (error) {
        console.error('Failed to ignore recurring rule:', error);
        alert(`Failed to remove recurring rule: ${error.message}`);
    }
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------
function populateCategoryFilter() {
    const sel = document.getElementById('categoryFilter');
    if (!sel) return;
    const previousValue = sel.value || 'all';
    allCategories = buildCategoryList(allCategories, allTransactions);
    sel.innerHTML = '<option value="all">All Categories</option>' +
        allCategories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
    sel.value = allCategories.includes(previousValue) ? previousValue : 'all';
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
        allCategories = buildCategoryList(allCategories, allTransactions);
        renderUncategorisedStatus();
        calculateMetrics();
        renderPieChart();
        renderLineChart();
        renderCategorySpendingChart();
        populateCategoryFilter();
        filterAndRenderTable();
        await Promise.all([loadBudgetHealth(), loadBudgetTrend()]);
    } catch (error) {
        console.error('Failed to update category:', error);
        alert('Failed to update category. Please try again.');
    }
}
