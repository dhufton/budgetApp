// frontend/js/constants.js

const DEFAULT_CATEGORIES = [
    'Bills', 'Entertainment', 'Food', 'Savings', 'Shopping', 'Transport', 'Uncategorized'
];

const CHART_COLOURS = [
    '#3b82f6', '#ef4444', '#10b981', '#f59e0b',
    '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'
];

const ENDPOINTS = {
    transactions:      '/api/transactions',
    transactionCategory: (id)   => `/api/transactions/${id}/category`,
    upload:            '/api/upload',
    categories:        '/api/categories',
    category:          (name)   => `/api/categories/${encodeURIComponent(name)}`,
    categoryKeywords:  (name)   => `/api/categories/${encodeURIComponent(name)}/keywords`,
    budgetTargets:     '/api/budget-targets',
    budgetTarget:      (name)   => `/api/budget-targets/${encodeURIComponent(name)}`,
    budgetComparison:  '/api/budget-comparison',
    config:            '/api/config',
    categorise:        '/api/categorise',
    insights:          '/api/insights',
    budgetSuggestions: '/api/budget-suggestions',
};
