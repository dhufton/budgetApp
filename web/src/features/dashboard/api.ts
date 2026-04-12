import { ApiError, apiClient } from "@/lib/api/client";
import { ENDPOINTS } from "@/lib/api/endpoints";

import type {
  BudgetHealthResponse,
  BudgetTrendResponse,
  CategorisationBatchResponse,
  CategoriseSuggestResponse,
  CategoriseTransactionsResponse,
  LatestReviewResponse,
  RecurringUpcomingResponse,
  ReviewHistoryResponse,
  ReviewQueueItem,
  ReviewQueueResponse,
  UpdateRecurringRuleResponse,
  UploadBatchResult,
  UploadStatementResponse,
} from "@/features/dashboard/types";

function normalizeReviewQueueItem(
  item: Record<string, unknown>,
): ReviewQueueItem | null {
  const rawSuggestion =
    item.suggestion && typeof item.suggestion === "object"
      ? (item.suggestion as Record<string, unknown>)
      : item;
  const rawTransaction =
    item.transaction && typeof item.transaction === "object"
      ? (item.transaction as Record<string, unknown>)
      : {};

  const suggestionId = String(rawSuggestion.id ?? "");
  const transactionId = String(
    rawSuggestion.transaction_id ?? rawTransaction.id ?? "",
  );

  if (!suggestionId || !transactionId) {
    return null;
  }

  return {
    id: suggestionId,
    suggestion: {
      id: suggestionId,
      transaction_id: transactionId,
      suggested_category: String(
        rawSuggestion.suggested_category ?? "Uncategorized",
      ),
      confidence: Number(rawSuggestion.confidence ?? 0),
      reason: String(rawSuggestion.reason ?? ""),
      created_at:
        rawSuggestion.created_at != null
          ? String(rawSuggestion.created_at)
          : undefined,
      account_id:
        rawSuggestion.account_id != null
          ? String(rawSuggestion.account_id)
          : null,
    },
    transaction: {
      id: transactionId,
      description: String(rawTransaction.description ?? "-"),
      amount: Number(rawTransaction.amount ?? 0),
      date: String(rawTransaction.date ?? ""),
      account_id:
        rawTransaction.account_id != null
          ? String(rawTransaction.account_id)
          : null,
      category:
        rawTransaction.category != null
          ? String(rawTransaction.category)
          : undefined,
    },
  };
}

export const dashboardApi = {
  getBudgetHealth: (accountId: string, month?: string | null) =>
    apiClient.get<BudgetHealthResponse>(ENDPOINTS.budgetHealth, {
      accountId,
      query: { month: month ?? undefined },
    }),
  getBudgetTrend: (accountId: string, months = 6) =>
    apiClient.get<BudgetTrendResponse>(ENDPOINTS.budgetTrend, {
      accountId,
      query: { months },
    }),
  getLatestReview: (accountId: string) =>
    apiClient.get<LatestReviewResponse>(ENDPOINTS.reviewsLatest, {
      accountId,
    }),
  getReviewHistory: (accountId: string, limit = 6) =>
    apiClient.get<ReviewHistoryResponse>(ENDPOINTS.reviewsHistory, {
      accountId,
      query: { limit },
    }),
  getReviewQueue: async (accountId: string, limit = 100) => {
    const response = await apiClient.get<{ items?: Record<string, unknown>[]; count?: number }>(
      ENDPOINTS.categoriseReviewQueue,
      {
        accountId,
        query: { limit },
      },
    );

    const items = (response.items ?? [])
      .map(normalizeReviewQueueItem)
      .filter((item): item is ReviewQueueItem => item !== null);

    return {
      count: Number(response.count ?? items.length),
      items,
    } satisfies ReviewQueueResponse;
  },
  getRecurringUpcoming: (accountId: string, days = 30) =>
    apiClient.get<RecurringUpcomingResponse>(ENDPOINTS.recurringUpcoming, {
      accountId,
      query: { days },
    }),
  categoriseTransactions: (accountId: string) =>
    apiClient.post<CategoriseTransactionsResponse>(ENDPOINTS.categorise, {
      accountId,
    }),
  categoriseSuggest: (accountId: string, threshold = 85) =>
    apiClient.post<CategoriseSuggestResponse>(ENDPOINTS.categoriseSuggest, {
      body: {
        account_id: accountId,
        threshold,
      },
    }),
  categoriseAcceptHighConfidence: (accountId: string, threshold = 85) =>
    apiClient.post<CategorisationBatchResponse>(
      ENDPOINTS.categoriseAcceptHighConfidence,
      {
        body: {
          account_id: accountId,
          threshold,
        },
      },
    ),
  categoriseApprove: (suggestionIds: string[]) =>
    apiClient.post<CategorisationBatchResponse>(ENDPOINTS.categoriseApprove, {
      body: { suggestion_ids: suggestionIds },
    }),
  categoriseReject: (suggestionIds: string[]) =>
    apiClient.post<CategorisationBatchResponse>(ENDPOINTS.categoriseReject, {
      body: { suggestion_ids: suggestionIds },
    }),
  categoriseOverride: (suggestionId: string, finalCategory: string) =>
    apiClient.post<{ success: boolean }>(ENDPOINTS.categoriseOverride, {
      body: {
        suggestion_id: suggestionId,
        final_category: finalCategory,
      },
    }),
  generateMonthlyReview: (accountId: string) =>
    apiClient.post<{ review: Record<string, unknown> }>(
      ENDPOINTS.reviewsGenerateMonthly,
      { accountId },
    ),
  updateRecurringRule: (ruleId: string, status: "active" | "ignored") =>
    apiClient.patch<UpdateRecurringRuleResponse>(ENDPOINTS.recurringRule(ruleId), {
      body: { status },
    }),
  recomputeRecurring: (accountId: string) =>
    apiClient.post<{ success?: boolean }>(ENDPOINTS.recurringRecompute, {
      body: {
        lookback_months: 12,
        min_occurrences: 2,
        account_id: accountId,
      },
    }),
  uploadStatement: async (file: File, accountId: string) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("account_id", accountId);

    return apiClient.post<UploadStatementResponse>(ENDPOINTS.upload, {
      body: formData,
    });
  },
  uploadStatements: async (files: File[], accountId: string) => {
    let successCount = 0;
    let duplicateCount = 0;
    let errorCount = 0;
    const uploadedFiles: string[] = [];
    const postProcessWarnings: string[] = [];

    for (const file of files) {
      try {
        const response = await dashboardApi.uploadStatement(file, accountId);
        if (response.success) {
          successCount += 1;
          uploadedFiles.push(file.name);
        }
      } catch (error) {
        if (
          error instanceof ApiError &&
          error.status === 409 &&
          /already exists/i.test(error.message)
        ) {
          duplicateCount += 1;
          continue;
        }

        errorCount += 1;
      }
    }

    if (successCount > 0) {
      try {
        await dashboardApi.categoriseTransactions(accountId);
      } catch (error) {
        postProcessWarnings.push(
          error instanceof Error
            ? `Recategorisation refresh failed: ${error.message}`
            : "Recategorisation refresh failed.",
        );
      }

      try {
        await dashboardApi.recomputeRecurring(accountId);
      } catch (error) {
        postProcessWarnings.push(
          error instanceof Error
            ? `Recurring refresh failed: ${error.message}`
            : "Recurring refresh failed.",
        );
      }
    }

    return {
      successCount,
      duplicateCount,
      errorCount,
      uploadedFiles,
      postProcessWarnings,
    } satisfies UploadBatchResult;
  },
};
