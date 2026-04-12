import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useAccountsQuery } from "@/features/accounts/hooks/useAccountsQuery";
import { dashboardApi } from "@/features/dashboard/api";
import { AiReviewQueue } from "@/features/dashboard/components/AiReviewQueue";
import { BudgetHealthCard } from "@/features/dashboard/components/BudgetHealthCard";
import { BudgetTrendCard } from "@/features/dashboard/components/BudgetTrendCard";
import { CategorySpendingChart } from "@/features/dashboard/components/CategorySpendingChart";
import { DashboardHeader } from "@/features/dashboard/components/DashboardHeader";
import { DashboardTransactionsTable } from "@/features/dashboard/components/DashboardTransactionsTable";
import { MetricsCards } from "@/features/dashboard/components/MetricsCards";
import { MonthlyReviewCard } from "@/features/dashboard/components/MonthlyReviewCard";
import { MonthlySpendChart } from "@/features/dashboard/components/MonthlySpendChart";
import { RecurringChargesCard } from "@/features/dashboard/components/RecurringChargesCard";
import { SpendingPieChart } from "@/features/dashboard/components/SpendingPieChart";
import { UncategorizedAlert } from "@/features/dashboard/components/UncategorizedAlert";
import { UploadPanel } from "@/features/dashboard/components/UploadPanel";
import {
  dashboardQueryKeys,
  useAiReviewQueueQuery,
  useBudgetHealthQuery,
  useBudgetTrendQuery,
  useDashboardDataRefresh,
  useLatestReviewQuery,
  useRecurringUpcomingQuery,
  useReviewHistoryQuery,
} from "@/features/dashboard/hooks/useDashboardQueries";
import {
  buildDashboardCategoryList,
  getDashboardMetrics,
  getDefaultUploadAccountId,
} from "@/features/dashboard/utils";
import { useCategoriesQuery } from "@/features/transactions/hooks/useCategoriesQuery";
import { useTransactionsQuery } from "@/features/transactions/hooks/useTransactionsQuery";
import { useUpdateTransactionCategoryMutation } from "@/features/transactions/hooks/useUpdateTransactionCategoryMutation";
import "@/features/dashboard/dashboard.css";

type Notice = {
  tone: "error" | "success";
  text: string;
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function DashboardPage() {
  const queryClient = useQueryClient();
  const refreshDashboardData = useDashboardDataRefresh();
  const [accountId, setAccountId] = useState("all");
  const [uploadAccountId, setUploadAccountId] = useState("");
  const [uploadNotice, setUploadNotice] = useState<Notice | null>(null);
  const [uncategorizedNotice, setUncategorizedNotice] = useState<Notice | null>(
    null,
  );
  const [aiNotice, setAiNotice] = useState<Notice | null>(null);
  const [reviewNotice, setReviewNotice] = useState<Notice | null>(null);
  const [recurringNotice, setRecurringNotice] = useState<Notice | null>(null);

  const accountsQuery = useAccountsQuery();
  const categoriesQuery = useCategoriesQuery();
  const transactionsQuery = useTransactionsQuery(accountId);
  const budgetHealthQuery = useBudgetHealthQuery(accountId);
  const budgetTrendQuery = useBudgetTrendQuery(accountId);
  const latestReviewQuery = useLatestReviewQuery(accountId);
  const reviewHistoryQuery = useReviewHistoryQuery(accountId);
  const aiReviewQueueQuery = useAiReviewQueueQuery(accountId);
  const recurringUpcomingQuery = useRecurringUpcomingQuery(accountId);

  const transactions = transactionsQuery.data?.transactions ?? [];
  const accounts = accountsQuery.data?.accounts ?? [];
  const metrics = useMemo(
    () => getDashboardMetrics(transactions),
    [transactions],
  );
  const categoryOptions = useMemo(
    () =>
      buildDashboardCategoryList(categoriesQuery.data?.categories ?? [], transactions),
    [categoriesQuery.data?.categories, transactions],
  );

  useEffect(() => {
    if (!accounts.length) {
      setUploadAccountId("");
      return;
    }

    setUploadAccountId((currentAccountId) => {
      if (
        currentAccountId &&
        accounts.some((account) => account.id === currentAccountId)
      ) {
        return currentAccountId;
      }

      return getDefaultUploadAccountId(accounts);
    });
  }, [accounts]);

  useEffect(() => {
    setUncategorizedNotice(null);
    setAiNotice(null);
    setReviewNotice(null);
    setRecurringNotice(null);
  }, [accountId]);

  const uploadMutation = useMutation({
    mutationFn: ({
      accountId: nextAccountId,
      files,
    }: {
      accountId: string;
      files: File[];
    }) => dashboardApi.uploadStatements(files, nextAccountId),
    onMutate: () => {
      setUploadNotice(null);
    },
    onSuccess: async (result) => {
      const parts: string[] = [];

      if (result.successCount) {
        parts.push(`${result.successCount} file(s) uploaded`);
      }
      if (result.duplicateCount) {
        parts.push(`${result.duplicateCount} duplicate(s) skipped`);
      }
      if (result.errorCount) {
        parts.push(`${result.errorCount} upload error(s)`);
      }
      if (result.postProcessWarnings.length) {
        parts.push(result.postProcessWarnings.join(" "));
      }

      setUploadNotice({
        tone: result.successCount > 0 ? "success" : "error",
        text: parts.join(", ") || "No files were uploaded.",
      });

      await refreshDashboardData({ includeCategories: true });
    },
    onError: (error) => {
      setUploadNotice({
        tone: "error",
        text: getErrorMessage(error, "Upload failed."),
      });
    },
  });

  const recategoriseMutation = useMutation({
    mutationFn: () => dashboardApi.categoriseTransactions(accountId),
    onMutate: () => {
      setUncategorizedNotice(null);
    },
    onSuccess: async (response) => {
      setUncategorizedNotice({
        tone: "success",
        text:
          response.message ??
          `Categorised ${response.changed ?? 0} transaction(s).`,
      });
      await refreshDashboardData();
    },
    onError: (error) => {
      setUncategorizedNotice({
        tone: "error",
        text: getErrorMessage(error, "Recategorisation failed."),
      });
    },
  });

  const generateSuggestionsMutation = useMutation({
    mutationFn: () => dashboardApi.categoriseSuggest(accountId, 85),
    onMutate: () => {
      setUncategorizedNotice(null);
    },
    onSuccess: async (response) => {
      setUncategorizedNotice({
        tone: "success",
        text: `AI run: ${response.uncategorised_total} uncategorised, ${response.auto_applied} auto-applied, ${response.needs_review} need review.`,
      });
      await refreshDashboardData();
    },
    onError: (error) => {
      setUncategorizedNotice({
        tone: "error",
        text: getErrorMessage(error, "AI suggestion generation failed."),
      });
    },
  });

  const acceptHighConfidenceMutation = useMutation({
    mutationFn: () => dashboardApi.categoriseAcceptHighConfidence(accountId, 85),
    onMutate: () => {
      setAiNotice(null);
    },
    onSuccess: async (response) => {
      setAiNotice({
        tone: "success",
        text: `Applied ${response.changed ?? 0} high-confidence suggestion(s).`,
      });
      await refreshDashboardData();
    },
    onError: (error) => {
      setAiNotice({
        tone: "error",
        text: getErrorMessage(error, "Failed to apply high-confidence suggestions."),
      });
    },
  });

  const approveSuggestionsMutation = useMutation({
    mutationFn: (suggestionIds: string[]) =>
      dashboardApi.categoriseApprove(suggestionIds),
    onMutate: () => {
      setAiNotice(null);
    },
    onSuccess: async (response) => {
      setAiNotice({
        tone: "success",
        text: `Approved ${response.changed ?? 0} suggestion(s).`,
      });
      await refreshDashboardData();
    },
    onError: (error) => {
      setAiNotice({
        tone: "error",
        text: getErrorMessage(error, "Failed to approve suggestions."),
      });
    },
  });

  const rejectSuggestionsMutation = useMutation({
    mutationFn: (suggestionIds: string[]) =>
      dashboardApi.categoriseReject(suggestionIds),
    onMutate: () => {
      setAiNotice(null);
    },
    onSuccess: async (response) => {
      setAiNotice({
        tone: "success",
        text: `Rejected ${response.changed ?? 0} suggestion(s).`,
      });
      await refreshDashboardData();
    },
    onError: (error) => {
      setAiNotice({
        tone: "error",
        text: getErrorMessage(error, "Failed to reject suggestions."),
      });
    },
  });

  const overrideSuggestionMutation = useMutation({
    mutationFn: ({
      finalCategory,
      suggestionId,
    }: {
      finalCategory: string;
      suggestionId: string;
    }) => dashboardApi.categoriseOverride(suggestionId, finalCategory),
    onMutate: () => {
      setAiNotice(null);
    },
    onSuccess: async () => {
      setAiNotice({
        tone: "success",
        text: "Suggestion updated with the selected category.",
      });
      await refreshDashboardData();
    },
    onError: (error) => {
      setAiNotice({
        tone: "error",
        text: getErrorMessage(error, "Failed to override the suggestion."),
      });
    },
  });

  const generateMonthlyReviewMutation = useMutation({
    mutationFn: () => dashboardApi.generateMonthlyReview(accountId),
    onMutate: () => {
      setReviewNotice(null);
    },
    onSuccess: async () => {
      setReviewNotice({
        tone: "success",
        text: "Previous month review generated.",
      });
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: dashboardQueryKeys.latestReview(accountId),
        }),
        queryClient.invalidateQueries({
          queryKey: dashboardQueryKeys.reviewHistory(accountId),
        }),
      ]);
    },
    onError: (error) => {
      setReviewNotice({
        tone: "error",
        text: getErrorMessage(error, "Failed to generate the previous month review."),
      });
    },
  });

  const ignoreRecurringRuleMutation = useMutation({
    mutationFn: (ruleId: string) => dashboardApi.updateRecurringRule(ruleId, "ignored"),
    onMutate: () => {
      setRecurringNotice(null);
    },
    onSuccess: async () => {
      setRecurringNotice({
        tone: "success",
        text: "Recurring rule removed from the upcoming list.",
      });
      await queryClient.invalidateQueries({
        queryKey: dashboardQueryKeys.recurringUpcoming(accountId),
      });
    },
    onError: (error) => {
      setRecurringNotice({
        tone: "error",
        text: getErrorMessage(error, "Failed to update the recurring rule."),
      });
    },
  });

  const updateCategoryMutation = useUpdateTransactionCategoryMutation({
    additionalInvalidationKeys: [
      dashboardQueryKeys.budgetHealth(accountId),
      dashboardQueryKeys.budgetTrend(accountId),
    ],
  });

  const blockingTransactionsError =
    transactionsQuery.isError && !transactions.length
      ? getErrorMessage(transactionsQuery.error, "Failed to load transactions.")
      : undefined;
  const staleTransactionsError =
    transactionsQuery.isError && transactions.length
      ? getErrorMessage(
          transactionsQuery.error,
          "Transactions could not be refreshed.",
        )
      : undefined;

  async function handleUpload(files: File[], nextAccountId: string) {
    await uploadMutation.mutateAsync({ files, accountId: nextAccountId });
  }

  async function handleCategoryChange(
    transactionId: string,
    currentCategory: string,
    nextCategory: string,
  ) {
    if (currentCategory === nextCategory) {
      return;
    }

    await updateCategoryMutation.mutateAsync({
      transactionId,
      category: nextCategory,
    });
  }

  return (
    <div className="dashboard-page">
      <DashboardHeader
        accountId={accountId}
        accounts={accounts}
        onAccountChange={setAccountId}
      />

      {staleTransactionsError ? (
        <p className="message message--error">{staleTransactionsError}</p>
      ) : null}

      {categoriesQuery.isError ? (
        <p className="message message--error">
          Category options could not be fully refreshed. The dashboard is using
          the categories available from the current dataset.
        </p>
      ) : null}

      {updateCategoryMutation.isError ? (
        <p className="message message--error">
          {getErrorMessage(
            updateCategoryMutation.error,
            "Failed to update the transaction category.",
          )}
        </p>
      ) : null}

      <MetricsCards
        isLoading={transactionsQuery.isLoading && !transactions.length}
        netSaved={metrics.netSaved}
        totalSpent={metrics.totalSpent}
        totalTransactions={metrics.totalTransactions}
      />

      <UncategorizedAlert
        count={metrics.uncategorizedCount}
        isGeneratingSuggestions={generateSuggestionsMutation.isPending}
        isRecategorising={recategoriseMutation.isPending}
        message={uncategorizedNotice}
        onGenerateSuggestions={() => {
          void generateSuggestionsMutation.mutateAsync();
        }}
        onRecategorise={() => {
          void recategoriseMutation.mutateAsync();
        }}
      />

      <div className="dashboard-grid">
        <UploadPanel
          accounts={accounts}
          isUploading={uploadMutation.isPending}
          message={uploadNotice}
          onUpload={handleUpload}
          onUploadAccountChange={setUploadAccountId}
          uploadAccountId={uploadAccountId}
        />

        <MonthlyReviewCard
          history={reviewHistoryQuery.data?.reviews ?? []}
          isGenerating={generateMonthlyReviewMutation.isPending}
          isLoading={
            latestReviewQuery.isLoading &&
            !latestReviewQuery.data &&
            reviewHistoryQuery.isLoading
          }
          latestReview={latestReviewQuery.data?.review ?? null}
          message={
            reviewNotice ??
            (latestReviewQuery.isError || reviewHistoryQuery.isError
              ? {
                  tone: "error",
                  text:
                    latestReviewQuery.isError || !reviewHistoryQuery.error
                      ? getErrorMessage(
                          latestReviewQuery.error,
                          "Review data unavailable.",
                        )
                      : getErrorMessage(
                          reviewHistoryQuery.error,
                          "Review history unavailable.",
                        ),
                }
              : null)
          }
          onGeneratePreviousMonth={() => {
            void generateMonthlyReviewMutation.mutateAsync();
          }}
        />
      </div>

      <AiReviewQueue
        categories={categoryOptions}
        errorMessage={
          aiReviewQueueQuery.isError
            ? getErrorMessage(
                aiReviewQueueQuery.error,
                "Failed to load the AI review queue.",
              )
            : undefined
        }
        isAcceptingHighConfidence={acceptHighConfidenceMutation.isPending}
        isApproving={approveSuggestionsMutation.isPending}
        isLoading={aiReviewQueueQuery.isLoading && !aiReviewQueueQuery.data}
        isRejecting={rejectSuggestionsMutation.isPending}
        items={aiReviewQueueQuery.data?.items ?? []}
        message={aiNotice}
        onAcceptHighConfidence={async () => {
          await acceptHighConfidenceMutation.mutateAsync();
        }}
        onApproveSelected={async (suggestionIds) => {
          await approveSuggestionsMutation.mutateAsync(suggestionIds);
        }}
        onApplyOverride={async (suggestionId, finalCategory) => {
          await overrideSuggestionMutation.mutateAsync({
            suggestionId,
            finalCategory,
          });
        }}
        onRejectSelected={async (suggestionIds) => {
          await rejectSuggestionsMutation.mutateAsync(suggestionIds);
        }}
        overridePendingId={
          overrideSuggestionMutation.isPending
            ? overrideSuggestionMutation.variables?.suggestionId
            : undefined
        }
      />

      <div className="dashboard-grid">
        <RecurringChargesCard
          errorMessage={
            recurringUpcomingQuery.isError
              ? getErrorMessage(
                  recurringUpcomingQuery.error,
                  "Failed to load recurring charges.",
                )
              : undefined
          }
          ignoringRuleId={
            ignoreRecurringRuleMutation.isPending
              ? ignoreRecurringRuleMutation.variables
              : undefined
          }
          isLoading={
            recurringUpcomingQuery.isLoading && !recurringUpcomingQuery.data
          }
          items={recurringUpcomingQuery.data?.items ?? []}
          message={recurringNotice}
          onIgnoreRule={(ruleId) => {
            void ignoreRecurringRuleMutation.mutateAsync(ruleId);
          }}
        />

        <BudgetHealthCard
          data={budgetHealthQuery.data}
          errorMessage={
            budgetHealthQuery.isError
              ? getErrorMessage(
                  budgetHealthQuery.error,
                  "Failed to load budget health.",
                )
              : undefined
          }
          isLoading={budgetHealthQuery.isLoading && !budgetHealthQuery.data}
        />
      </div>

      <div className="dashboard-grid">
        <BudgetTrendCard
          data={budgetTrendQuery.data}
          errorMessage={
            budgetTrendQuery.isError
              ? getErrorMessage(
                  budgetTrendQuery.error,
                  "Failed to load budget trend.",
                )
              : undefined
          }
          isLoading={budgetTrendQuery.isLoading && !budgetTrendQuery.data}
        />

        <SpendingPieChart
          errorMessage={blockingTransactionsError}
          isLoading={transactionsQuery.isLoading && !transactions.length}
          transactions={transactions}
        />

        <MonthlySpendChart
          errorMessage={blockingTransactionsError}
          isLoading={transactionsQuery.isLoading && !transactions.length}
          transactions={transactions}
        />

        <CategorySpendingChart
          errorMessage={blockingTransactionsError}
          isLoading={transactionsQuery.isLoading && !transactions.length}
          transactions={transactions}
        />
      </div>

      <DashboardTransactionsTable
        categories={categoryOptions}
        errorMessage={blockingTransactionsError}
        isLoading={transactionsQuery.isLoading && !transactions.length}
        onCategoryChange={handleCategoryChange}
        pendingTransactionId={
          updateCategoryMutation.isPending
            ? updateCategoryMutation.variables?.transactionId
            : undefined
        }
        transactions={transactions}
      />
    </div>
  );
}
