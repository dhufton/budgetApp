// frontend/js/api.js
const API_BASE = window.location.origin;

// Create api object that dashboard.js expects
const api = {
    async getTransactions() {
        const token = localStorage.getItem('access_token');

        if (!token) {
            console.error('No token found, redirecting to login');
            window.location.href = '/';
            return null;
        }

        try {
            console.log('Fetching transactions...');
            const response = await fetch(`${API_BASE}/api/transactions`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            console.log(`Transactions response: ${response.status}`);

            if (response.status === 401) {
                console.error('Unauthorized - clearing token');
                localStorage.removeItem('access_token');
                window.location.href = '/';
                return null;
            }

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
        const token = localStorage.getItem('access_token');

        if (!token) {
            console.error('No token found');
            window.location.href = '/';
            return null;
        }

        try {
            const response = await fetch(`${API_BASE}/api/upload`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            console.log(`Upload response: ${response.status}`);

            if (response.status === 401) {
                console.error('Unauthorized - clearing token');
                localStorage.removeItem('access_token');
                window.location.href = '/';
                return null;
            }

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
        const token = localStorage.getItem('access_token');

        if (!token) {
            window.location.href = '/';
            return null;
        }

        try {
            const response = await fetch(`${API_BASE}/api/categories`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.status === 401) {
                localStorage.removeItem('access_token');
                window.location.href = '/';
                return null;
            }

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
        const token = localStorage.getItem('access_token');

        if (!token) {
            window.location.href = '/';
            return null;
        }

        try {
            const response = await fetch(`${API_BASE}/api/categories`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ category })
            });

            if (response.status === 401) {
                localStorage.removeItem('access_token');
                window.location.href = '/';
                return null;
            }

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
        const token = localStorage.getItem('access_token');

        if (!token) {
            window.location.href = '/';
            return null;
        }

        try {
            const response = await fetch(`${API_BASE}/api/categories/${encodeURIComponent(category)}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.status === 401) {
                localStorage.removeItem('access_token');
                window.location.href = '/';
                return null;
            }

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
        const token = localStorage.getItem('access_token');

        if (!token) {
            window.location.href = '/';
            return null;
        }

        try {
            const response = await fetch(`${API_BASE}/api/budget-targets`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.status === 401) {
                localStorage.removeItem('access_token');
                window.location.href = '/';
                return null;
            }

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
        const token = localStorage.getItem('access_token');

        if (!token) {
            window.location.href = '/';
            return null;
        }

        try {
            const response = await fetch(`${API_BASE}/api/budget-targets`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ category, target_amount: targetAmount })
            });

            if (response.status === 401) {
                localStorage.removeItem('access_token');
                window.location.href = '/';
                return null;
            }

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
        const token = localStorage.getItem('access_token');

        if (!token) {
            window.location.href = '/';
            return null;
        }

        try {
            const response = await fetch(`${API_BASE}/api/budget-targets/${encodeURIComponent(category)}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.status === 401) {
                localStorage.removeItem('access_token');
                window.location.href = '/';
                return null;
            }

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
        const token = localStorage.getItem('access_token');

        if (!token) {
            window.location.href = '/';
            return null;
        }

        try {
            const response = await fetch(`${API_BASE}/api/budget-comparison`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.status === 401) {
                localStorage.removeItem('access_token');
                window.location.href = '/';
                return null;
            }

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
        const token = localStorage.getItem('access_token');

        if (!token) {
            window.location.href = '/';
            return null;
        }

        try {
            const response = await fetch(`${API_BASE}/api/transactions/${transactionId}/category`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ category })
            });

            if (response.status === 401) {
                localStorage.removeItem('access_token');
                window.location.href = '/';
                return null;
            }

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || 'Failed to update category');
            }

            return response.json();
        } catch (error) {
            console.error('Failed to update transaction category:', error);
            throw error;
        }
    }
};
