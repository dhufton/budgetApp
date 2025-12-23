// frontend/js/api.js
const API_BASE = window.location.origin + '/api';

async function apiCall(endpoint, options = {}) {
    const token = localStorage.getItem('token');

    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                ...options.headers
            }
        });

        if (response.status === 401) {
            logout();
            return null;
        }

        // Check if response is JSON
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            const data = await response.json();
            if (!response.ok) {
                console.error('API Error:', data);
                throw new Error(data.detail || 'Request failed');
            }
            return data;
        } else {
            // Non-JSON response (likely 500 error)
            const text = await response.text();
            console.error('Non-JSON response:', text);
            throw new Error(`Server error: ${response.status}`);
        }
    } catch (error) {
        console.error('API call failed:', error);
        throw error;
    }
}

async function uploadFile(file) {
    const token = localStorage.getItem('token');
    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch(`${API_BASE}/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            const data = await response.json();
            if (!response.ok) {
                console.error('Upload error:', data);
                throw new Error(data.detail || 'Upload failed');
            }
            return data;
        } else {
            const text = await response.text();
            console.error('Upload non-JSON response:', text);
            throw new Error(`Server error: ${response.status}`);
        }
    } catch (error) {
        console.error('Upload failed:', error);
        throw error;
    }
}

async function getTransactions() {
    return apiCall('/transactions');
}

async function getCategories() {
    return apiCall('/categories');
}

async function getBudgetTargets() {
    return apiCall('/budget-targets');
}

async function getBudgetComparison() {
    return apiCall('/budget-comparison');
}
