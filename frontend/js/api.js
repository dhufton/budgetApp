// frontend/js/api.js

async function authFetch(url, options = {}) {
    const token = localStorage.getItem('access_token');
    if (!token) throw new Error('Not authenticated');

    const response = await fetch(url, {
        ...options,
        headers: {
            'Authorization': `Bearer ${token}`,
            ...(options.headers || {}),
        },
    });

    if (response.status === 401) {
        localStorage.removeItem('access_token');
        window.location.href = '/';
        throw new Error('Session expired');
    }

    return response;
}

const api = {
    async getTransactions() {
        console.log('Fetching transactions...');
        const response = await authFetch('/api/transactions');
        console.log('Transactions response:', response.status);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
    },

    async uploadFile(formData) {
        const response = await authFetch('/api/upload', {
            method: 'POST',
            body: formData,
        });
        console.log('Upload response:', response.status);
        const data = await response.json();
        if (!response.ok) {
            console.log('Upload failed:', new Error(data.detail || data.message || 'Upload failed'));
            throw new Error(data.detail || data.message || 'Upload failed');
        }
        return data;
    },

    async getCategories() {
        const response = await authFetch('/api/categories');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
    },

    // Create a new custom category (optionally with initial keywords)
    async createCustomCategory(name, keywords = []) {
        const response = await authFetch('/api/categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, keywords }),
        });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.detail || 'Failed to create category');
        }
        return response.json();
    },

    // Update the extra keywords for a category
    async updateCategoryKeywords(category, keywords) {
        const response = await authFetch(`/api/categories/${encodeURIComponent(category)}/keywords`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keywords }),
        });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.detail || 'Failed to update keywords');
        }
        return response.json();
    },

    async deleteCategory(category) {
        const response = await authFetch(`/api/categories/${encodeURIComponent(category)}`, {
            method: 'DELETE',
        });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.detail || 'Failed to delete category');
        }
        return response.json();
    },

    async getBudgetTargets() {
        const response = await authFetch('/api/budget-targets');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
    },

    async setBudgetTarget(category, targetAmount) {
        const response = await authFetch('/api/budget-targets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category, target_amount: targetAmount }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
    },

    async deleteBudgetTarget(category) {
        const response = await authFetch(`/api/budget-targets/${encodeURIComponent(category)}`, {
            method: 'DELETE',
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
    },

    async getBudgetComparison() {
        const response = await authFetch('/api/budget-comparison');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
    },

    async categoriseTransactions() {
        const response = await authFetch('/api/categorise', { method: 'POST' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
    },

    async getInsights() {
        const response = await authFetch('/api/insights');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
    },

    async getBudgetSuggestions() {
        const response = await authFetch('/api/budget-suggestions');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
    },
};
