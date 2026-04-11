// frontend/js/constants.js

const DEFAULT_CATEGORIES = [
    'Bills', 'Entertainment', 'Food', 'Savings', 'Shopping', 'Transport', 'Transfer', 'Uncategorized'
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
    accounts:          '/api/accounts',
    account:           (id)     => `/api/accounts/${encodeURIComponent(id)}`,
    budgetHealth:      '/api/budget-health',
    budgetTrend:       '/api/budget-trend',
    goals:             '/api/goals',
    goal:              (id)     => `/api/goals/${encodeURIComponent(id)}`,
    goalAffordability: (id)     => `/api/goals/${encodeURIComponent(id)}/affordability`,
    goalsAffordability:'/api/goals-affordability',
    config:            '/api/config',
    categorise:        '/api/categorise',
    insights:          '/api/insights',
    budgetSuggestions: '/api/budget-suggestions',
    reviewsLatest:     '/api/reviews/latest',
    reviewsHistory:    '/api/reviews/history',
    reviewsGenerate:   '/api/reviews/generate',
    reviewsGenerateMonthly: '/api/reviews/generate-monthly',
    categoriseSuggest: '/api/categorise/suggest',
    categoriseReviewQueue: '/api/categorise/review-queue',
    categoriseApprove: '/api/categorise/approve',
    categoriseOverride: '/api/categorise/override',
    categoriseReject: '/api/categorise/reject',
    categoriseAcceptHighConfidence: '/api/categorise/accept-high-confidence',
    recurringRecompute: '/api/recurring/recompute',
    recurring: '/api/recurring',
    recurringRule: (id) => `/api/recurring/${encodeURIComponent(id)}`,
    recurringUpcoming: '/api/recurring/upcoming',
};
