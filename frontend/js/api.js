// frontend/js/api.js

// ---------------------------------------------------------------------------
// Core auth fetch helper — handles token injection, 401 redirect, and errors.
// FormData bodies are detected automatically so Content-Type is not forced
// (the browser must set it with the multipart boundary for file uploads).
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

    async getTransactions() {
        try {
            console.log('Fetching transactions...');
            const response = await authFetch(ENDPOINTS.transactions);
            if (!response) return null;

            console.log(`Transactions response: ${response.status}`);

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

    async uploadFile(formData) {
        try {
            const response = await authFetch(ENDPOINTS.upload, {
                method: 'POST',
                body: formData,
            });
            if (!response) return null;

            console.log(`Upload response: ${response.status}`);

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

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return response.json();
        } catch (error) {
            console.error('Failed to fetch categories:', error);
            throw error;
        }
    },

    async addCategory(category) {
        try {
            const response = await authFetch(ENDPOINTS.categories, {
                method: 'POST',
                body: JSON.stringify({ category }),
            });
            if (!response) return null;

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || 'Failed to add category');
            }

            return response.json();
        } catch (error) {
            console.error('Failed to add category:', error);
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

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return response.json();
        } catch (error) {
            console.error('Failed to fetch budget targets:', error);
            throw error;
        }
    },

    async setBudgetTarget(category, targetAmount) {
        try {
            const response = await authFetch(ENDPOINTS.budgetTargets, {
                method: 'POST',
                body: JSON.stringify({ category, target_amount: targetAmount }),
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

    async getBudgetComparison() {
        try {
            const response = await authFetch(ENDPOINTS.budgetComparison);
            if (!response) return null;

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return response.json();
        } catch (error) {
            console.error('Failed to fetch budget comparison:', error);
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

    async categoriseTransactions() {
        try {
            const response = await authFetch(ENDPOINTS.categorise, { method: 'POST' });
            if (!response) return null;
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response.json();
        } catch (error) {
            console.error('Failed to categorise transactions:', error);
            throw error;
        }
    },
    async getInsights() {
        try {
            const response = await authFetch(ENDPOINTS.insights);
            if (!response) return null;
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response.json();
        } catch (error) {
            console.error('Failed to fetch insights:', error);
            throw error;
        }
    },

    async getBudgetSuggestions() {
        try {
            const response = await authFetch(ENDPOINTS.budgetSuggestions);
            if (!response) return null;
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response.json();
        } catch (error) {
            console.error('Failed to fetch budget suggestions:', error);
            throw error;
        }
    },
};
