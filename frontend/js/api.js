// frontend/js/api.js
const API_BASE = window.location.origin + '/api';

async function apiCall(endpoint, options = {}) {
    const token = localStorage.getItem('token');

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

    return response.json();
}

async function uploadFile(file) {
    const token = localStorage.getItem('token');
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`
        },
        body: formData
    });

    return response.json();
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
