// frontend/js/api.js
// Detect if running locally or on production
const API_BASE = window.location.hostname === 'localhost'
    ? 'http://localhost:8000'
    : 'https://budget-tracker-app-n12a.onrender.com';

// Create api object that dashboard.js expects
const api = {
    async getTransactions() {
        const token = localStorage.getItem('access_token'); // Fixed: was 'token'

        if (!token) {
            console.error('No token found, redirecting to login');
            window.location.href = '/';
            return null;
        }

        try {
            console.log('Fetching transactions...');
            const response = await fetch(`${API_BASE}/transactions`, {
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
        const token = localStorage.getItem('access_token'); // Fixed: was 'token'

        if (!token) {
            console.error('No token found');
            window.location.href = '/';
            return null;
        }

        try {
            const response = await fetch(`${API_BASE}/upload`, {
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

            // Handle 409 Conflict (duplicate file)
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
            const response = await fetch(`${API_BASE}/categories`, {
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

    async getBudgetTargets() {
        const token = localStorage.getItem('access_token');

        if (!token) {
            window.location.href = '/';
            return null;
        }

        try {
            const response = await fetch(`${API_BASE}/budget-targets`, {
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

    async getBudgetComparison() {
        const token = localStorage.getItem('access_token');

        if (!token) {
            window.location.href = '/';
            return null;
        }

        try {
            const response = await fetch(`${API_BASE}/budget-comparison`, {
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
    }
};
