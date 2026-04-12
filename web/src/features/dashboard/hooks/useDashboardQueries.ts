import { useQuery, useQueryClient } from "@tanstack/react-query";

import { dashboardApi } from "@/features/dashboard/api";

export const dashboardQueryKeys = {
  root: ["dashboard"] as const,
  budgetHealth: (accountId: string) =>
    [...dashboardQueryKeys.root, "budget-health", accountId] as const,
  budgetTrend: (accountId: string) =>
    [...dashboardQueryKeys.root, "budget-trend", accountId] as const,
  latestReview: (accountId: string) =>
    [...dashboardQueryKeys.root, "latest-review", accountId] as const,
  reviewHistory: (accountId: string) =>
    [...dashboardQueryKeys.root, "review-history", accountId] as const,
  aiReviewQueue: (accountId: string) =>
    [...dashboardQueryKeys.root, "ai-review-queue", accountId] as const,
  recurringUpcoming: (accountId: string) =>
    [...dashboardQueryKeys.root, "recurring-upcoming", accountId] as const,
};

export function useBudgetHealthQuery(accountId: string) {
  return useQuery({
    queryKey: dashboardQueryKeys.budgetHealth(accountId),
    queryFn: () => dashboardApi.getBudgetHealth(accountId),
  });
}

export function useBudgetTrendQuery(accountId: string) {
  return useQuery({
    queryKey: dashboardQueryKeys.budgetTrend(accountId),
    queryFn: () => dashboardApi.getBudgetTrend(accountId),
  });
}

export function useLatestReviewQuery(accountId: string) {
  return useQuery({
    queryKey: dashboardQueryKeys.latestReview(accountId),
    queryFn: () => dashboardApi.getLatestReview(accountId),
  });
}

export function useReviewHistoryQuery(accountId: string) {
  return useQuery({
    queryKey: dashboardQueryKeys.reviewHistory(accountId),
    queryFn: () => dashboardApi.getReviewHistory(accountId),
  });
}

export function useAiReviewQueueQuery(accountId: string) {
  return useQuery({
    queryKey: dashboardQueryKeys.aiReviewQueue(accountId),
    queryFn: () => dashboardApi.getReviewQueue(accountId),
  });
}

export function useRecurringUpcomingQuery(accountId: string) {
  return useQuery({
    queryKey: dashboardQueryKeys.recurringUpcoming(accountId),
    queryFn: () => dashboardApi.getRecurringUpcoming(accountId),
  });
}

export function useDashboardDataRefresh() {
  const queryClient = useQueryClient();

  return async function refreshDashboardData(options?: {
    includeAccounts?: boolean;
    includeCategories?: boolean;
  }) {
    const invalidations = [
      queryClient.invalidateQueries({ queryKey: ["transactions"] }),
      queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.root }),
    ];

    if (options?.includeAccounts) {
      invalidations.push(
        queryClient.invalidateQueries({ queryKey: ["accounts"] }),
      );
    }

    if (options?.includeCategories) {
      invalidations.push(
        queryClient.invalidateQueries({ queryKey: ["categories"] }),
      );
    }

    await Promise.all(invalidations);
  };
}
