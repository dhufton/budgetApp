export const ENDPOINTS = {
  transactions: "/api/transactions",
  transactionCategory: (id: string) =>
    `/api/transactions/${encodeURIComponent(id)}/category`,
  upload: "/api/upload",
  categories: "/api/categories",
  category: (name: string) => `/api/categories/${encodeURIComponent(name)}`,
  categoryKeywords: (name: string) =>
    `/api/categories/${encodeURIComponent(name)}/keywords`,
  categoriesRecategoriseAll: "/api/categories/recategorise-all",
  budgetTargets: "/api/budget-targets",
  budgetTarget: (name: string) =>
    `/api/budget-targets/${encodeURIComponent(name)}`,
  budgetComparison: "/api/budget-comparison",
  accounts: "/api/accounts",
  account: (id: string) => `/api/accounts/${encodeURIComponent(id)}`,
  budgetHealth: "/api/budget-health",
  budgetTrend: "/api/budget-trend",
  goals: "/api/goals",
  goal: (id: string) => `/api/goals/${encodeURIComponent(id)}`,
  goalAffordability: (id: string) =>
    `/api/goals/${encodeURIComponent(id)}/affordability`,
  goalsAffordability: "/api/goals-affordability",
  config: "/api/config",
  categorise: "/api/categorise",
  insights: "/api/insights",
  budgetSuggestions: "/api/budget-suggestions",
  reviewsLatest: "/api/reviews/latest",
  reviewsHistory: "/api/reviews/history",
  reviewsGenerate: "/api/reviews/generate",
  reviewsGenerateMonthly: "/api/reviews/generate-monthly",
  categoriseSuggest: "/api/categorise/suggest",
  categoriseReviewQueue: "/api/categorise/review-queue",
  categoriseApprove: "/api/categorise/approve",
  categoriseOverride: "/api/categorise/override",
  categoriseReject: "/api/categorise/reject",
  categoriseAcceptHighConfidence: "/api/categorise/accept-high-confidence",
  recurringRecompute: "/api/recurring/recompute",
  recurring: "/api/recurring",
  recurringRule: (id: string) => `/api/recurring/${encodeURIComponent(id)}`,
  recurringUpcoming: "/api/recurring/upcoming",
} as const;

export function withAccountId(path: string, accountId?: string | null) {
  if (!accountId || accountId === "all") {
    return path;
  }

  const url = new URL(path, window.location.origin);
  url.searchParams.set("account_id", accountId);
  return `${url.pathname}${url.search}`;
}
