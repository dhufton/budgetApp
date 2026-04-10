// frontend/js/api.js

// ---------------------------------------------------------------------------
// authFetch — attaches Bearer token; handles 401s; avoids setting
// Content-Type for FormData (the browser must set it with the multipart boundary).
// ---------------------------------------------------------------------------
async function authFetch(url, options = {}) {
    const token = localStorage.getItem('access_token');
    if (!token) {
        console.error('No token found, redirecting to login');
        window.location.href = '/';
        return null;
    }

    const headers = {
        'Authorization': `Bearer ${token}`,
        ...options.headers,
    };

    // Don't force Content-Type for FormData — browser sets it with the boundary
    if (!(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, { ...options, headers });

    if (response.status === 401) {
        console.error('Unauthorized - clearing token');
        localStorage.removeItem('access_token');
        window.location.href = '/';
        return null;
    }

    return response;
}

// ---------------------------------------------------------------------------
// API object
// ---------------------------------------------------------------------------
const api = {

    _withAccountParam(url, accountId) {
        if (!accountId || accountId === 'all') return url;
        const sep = url.includes('?') ? '&' : '?';
        return `${url}${sep}account_id=${encodeURIComponent(accountId)}`;
    },

    async getTransactions(accountId = 'all') {
        try {
            const response = await authFetch(this._withAccountParam(ENDPOINTS.transactions, accountId));
            if (!response) return null;
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
            }
            return response.json();
        } catch (error) {
            console.error('Failed to fetch transactions:', error);
            throw error;
        }
    },

    async uploadFile(formData, accountId) {
        try {
            if (!accountId || accountId === 'all') {
                throw new Error('Account is required');
            }
            formData.append('account_id', accountId);
            const response = await authFetch(ENDPOINTS.upload, {
                method: 'POST',
                body: formData,
            });
            if (!response) return null;
            console.log('Upload response:', response.status);
            if (response.status === 409) {
                const data = await response.json();
                throw new Error(data.message || 'File already exists');
            }
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || 'Upload failed');
            }
            return response.json();
        } catch (error) {
            console.error('Upload failed:', error);
            throw error;
        }
    },

    async getCategories() {
        try {
            const response = await authFetch(ENDPOINTS.categories);
            if (!response) return null;
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response.json();
        } catch (error) {
            console.error('Failed to fetch categories:', error);
            throw error;
        }
    },

    // Create a new custom category (name + optional initial keywords)
    async createCustomCategory(name, keywords = []) {
        try {
            const response = await authFetch(ENDPOINTS.categories, {
                method: 'POST',
                body: JSON.stringify({ name, keywords }),
            });
            if (!response) return null;
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || 'Failed to create category');
            }
            return response.json();
        } catch (error) {
            console.error('Failed to create category:', error);
            throw error;
        }
    },

    // Save user-defined keywords for a category
    async updateCategoryKeywords(category, keywords) {
        try {
            const response = await authFetch(ENDPOINTS.categoryKeywords(category), {
                method: 'PATCH',
                body: JSON.stringify({ keywords }),
            });
            if (!response) return null;
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || 'Failed to update keywords');
            }
            return response.json();
        } catch (error) {
            console.error('Failed to update keywords:', error);
            throw error;
        }
    },

    async deleteCategory(category) {
        try {
            const response = await authFetch(ENDPOINTS.category(category), {
                method: 'DELETE',
            });
            if (!response) return null;
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || 'Failed to delete category');
            }
            return response.json();
        } catch (error) {
            console.error('Failed to delete category:', error);
            throw error;
        }
    },

    async getBudgetTargets() {
        try {
            const response = await authFetch(ENDPOINTS.budgetTargets);
            if (!response) return null;
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response.json();
        } catch (error) {
            console.error('Failed to fetch budget targets:', error);
            throw error;
        }
    },

    async setBudgetTarget(category, targetAmount, thresholdPercent = 80) {
        try {
            const response = await authFetch(ENDPOINTS.budgetTargets, {
                method: 'POST',
                body: JSON.stringify({
                    category,
                    target_amount: targetAmount,
                    threshold_percent: thresholdPercent,
                }),
            });
            if (!response) return null;
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || 'Failed to set budget target');
            }
            return response.json();
        } catch (error) {
            console.error('Failed to set budget target:', error);
            throw error;
        }
    },

    async updateBudgetTarget(category, payload) {
        try {
            const response = await authFetch(ENDPOINTS.budgetTarget(category), {
                method: 'PATCH',
                body: JSON.stringify(payload),
            });
            if (!response) return null;
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || 'Failed to update budget target');
            }
            return response.json();
        } catch (error) {
            console.error('Failed to update budget target:', error);
            throw error;
        }
    },

    async deleteBudgetTarget(category) {
        try {
            const response = await authFetch(ENDPOINTS.budgetTarget(category), {
                method: 'DELETE',
            });
            if (!response) return null;
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || 'Failed to delete budget target');
            }
            return response.json();
        } catch (error) {
            console.error('Failed to delete budget target:', error);
            throw error;
        }
    },

    async getBudgetComparison(accountId = 'all') {
        try {
            const response = await authFetch(this._withAccountParam(ENDPOINTS.budgetComparison, accountId));
            if (!response) return null;
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response.json();
        } catch (error) {
            console.error('Failed to fetch budget comparison:', error);
            throw error;
        }
    },

    async getBudgetHealth(month = null, accountId = 'all') {
        try {
            const params = new URLSearchParams();
            if (month) params.set('month', month);
            if (accountId && accountId !== 'all') params.set('account_id', accountId);
            const qs = params.toString();
            const response = await authFetch(`${ENDPOINTS.budgetHealth}${qs ? `?${qs}` : ''}`);
            if (!response) return null;
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response.json();
        } catch (error) {
            console.error('Failed to fetch budget health:', error);
            throw error;
        }
    },

    async getBudgetTrend(months = 6, accountId = 'all') {
        try {
            const params = new URLSearchParams({ months: String(months) });
            if (accountId && accountId !== 'all') params.set('account_id', accountId);
            const response = await authFetch(`${ENDPOINTS.budgetTrend}?${params.toString()}`);
            if (!response) return null;
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response.json();
        } catch (error) {
            console.error('Failed to fetch budget trend:', error);
            throw error;
        }
    },

    async updateTransactionCategory(transactionId, category) {
        try {
            const response = await authFetch(ENDPOINTS.transactionCategory(transactionId), {
                method: 'PATCH',
                body: JSON.stringify({ category }),
            });
            if (!response) return null;
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || 'Failed to update category');
            }
            return response.json();
        } catch (error) {
            console.error('Failed to update transaction category:', error);
            throw error;
        }
    },

    async categoriseTransactions(accountId = 'all') {
        try {
            const response = await authFetch(this._withAccountParam(ENDPOINTS.categorise, accountId), { method: 'POST' });
            if (!response) return null;
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response.json();
        } catch (error) {
            console.error('Failed to categorise transactions:', error);
            throw error;
        }
    },

    async getInsights(accountId = 'all') {
        try {
            const response = await authFetch(this._withAccountParam(ENDPOINTS.insights, accountId));
            if (!response) return null;
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response.json();
        } catch (error) {
            console.error('Failed to fetch insights:', error);
            throw error;
        }
    },

    async getBudgetSuggestions(accountId = 'all') {
        try {
            const response = await authFetch(this._withAccountParam(ENDPOINTS.budgetSuggestions, accountId));
            if (!response) return null;
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response.json();
        } catch (error) {
            console.error('Failed to fetch budget suggestions:', error);
            throw error;
        }
    },

    async getAccounts() {
        const response = await authFetch(ENDPOINTS.accounts);
        if (!response) return null;
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Failed to fetch accounts');
        }
        return response.json();
    },

    async createAccount(name, accountType) {
        const response = await authFetch(ENDPOINTS.accounts, {
            method: 'POST',
            body: JSON.stringify({ name, account_type: accountType }),
        });
        if (!response) return null;
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Failed to create account');
        }
        return response.json();
    },

    async updateAccount(accountId, payload) {
        const response = await authFetch(ENDPOINTS.account(accountId), {
            method: 'PATCH',
            body: JSON.stringify(payload),
        });
        if (!response) return null;
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Failed to update account');
        }
        return response.json();
    },

    async deleteAccount(accountId) {
        const response = await authFetch(ENDPOINTS.account(accountId), {
            method: 'DELETE',
        });
        if (!response) return null;
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Failed to delete account');
        }
        return response.json();
    },

    async getLatestReview(accountId = 'all', reviewType = null) {
        const params = new URLSearchParams();
        if (accountId && accountId !== 'all') params.set('account_id', accountId);
        if (reviewType) params.set('review_type', reviewType);
        const response = await authFetch(`${ENDPOINTS.reviewsLatest}${params.toString() ? `?${params.toString()}` : ''}`);
        if (!response) return null;
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Failed to fetch latest review');
        }
        return response.json();
    },

    async getReviewHistory({ accountId = 'all', reviewType = null, limit = 20 } = {}) {
        const params = new URLSearchParams({ limit: String(limit) });
        if (accountId && accountId !== 'all') params.set('account_id', accountId);
        if (reviewType) params.set('review_type', reviewType);
        const response = await authFetch(`${ENDPOINTS.reviewsHistory}?${params.toString()}`);
        if (!response) return null;
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Failed to fetch review history');
        }
        return response.json();
    },

    async generateReview(payload) {
        const response = await authFetch(ENDPOINTS.reviewsGenerate, {
            method: 'POST',
            body: JSON.stringify(payload),
        });
        if (!response) return null;
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Failed to generate review');
        }
        return response.json();
    },

    async generateMonthlyReview(accountId = 'all') {
        const params = new URLSearchParams();
        if (accountId && accountId !== 'all') params.set('account_id', accountId);
        const response = await authFetch(`${ENDPOINTS.reviewsGenerateMonthly}${params.toString() ? `?${params.toString()}` : ''}`, {
            method: 'POST',
        });
        if (!response) return null;
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Failed to generate monthly review');
        }
        return response.json();
    },
};

// Explicitly expose API on window to avoid any cross-script global binding ambiguity.
window.api = api;
