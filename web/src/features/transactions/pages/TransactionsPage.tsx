import { useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { useAccountsQuery } from "@/features/accounts/hooks/useAccountsQuery";
import { TransactionsEmptyState } from "@/features/transactions/components/TransactionsEmptyState";
import { TransactionsFilters } from "@/features/transactions/components/TransactionsFilters";
import { TransactionsLoadingState } from "@/features/transactions/components/TransactionsLoadingState";
import { TransactionsTable } from "@/features/transactions/components/TransactionsTable";
import { useCategoriesQuery } from "@/features/categories/hooks/useCategoriesQuery";
import { useTransactionsQuery } from "@/features/transactions/hooks/useTransactionsQuery";
import { useUpdateTransactionCategoryMutation } from "@/features/transactions/hooks/useUpdateTransactionCategoryMutation";
import {
  filterTransactions,
  getTransactionCounts,
  sortTransactions,
  type TransactionFilter,
} from "@/features/transactions/utils";
import type { TransactionRecord } from "@/lib/api/types";
import "@/features/transactions/transactions.css";

export function TransactionsPage() {
  const [accountId, setAccountId] = useState("all");
  const [currentFilter, setCurrentFilter] = useState<TransactionFilter>("all");

  const accountsQuery = useAccountsQuery();
  const categoriesQuery = useCategoriesQuery();
  const transactionsQuery = useTransactionsQuery(accountId);
  const updateCategoryMutation = useUpdateTransactionCategoryMutation();

  const sortedTransactions = useMemo(
    () => sortTransactions(transactionsQuery.data?.transactions ?? []),
    [transactionsQuery.data?.transactions],
  );
  const counts = useMemo(
    () => getTransactionCounts(sortedTransactions),
    [sortedTransactions],
  );
  const filteredTransactions = useMemo(
    () => filterTransactions(sortedTransactions, currentFilter),
    [currentFilter, sortedTransactions],
  );

  const categoryOptions = useMemo(() => {
    if (categoriesQuery.data?.categories.length) {
      return categoriesQuery.data.categories;
    }

    const fallbackCategories = new Set<string>(["Uncategorized"]);
    sortedTransactions.forEach((transaction) => {
      fallbackCategories.add(transaction.category);
    });
    return [...fallbackCategories];
  }, [categoriesQuery.data?.categories, sortedTransactions]);

  const categoryEditingDisabled =
    categoriesQuery.isLoading || categoriesQuery.isError;

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

  const pageActions = (
    <Button
      onClick={() => {
        window.location.assign("/legacy/transactions");
      }}
      variant="secondary"
    >
      Open legacy transactions
    </Button>
  );

  const content = renderContent({
    categoriesAvailable: !categoryEditingDisabled,
    categoryOptions,
    currentFilter,
    filteredTransactions,
    onCategoryChange: handleCategoryChange,
    onResetFilter: () => setCurrentFilter("all"),
    onRetry: () => {
      void transactionsQuery.refetch();
    },
    pendingTransactionId: updateCategoryMutation.isPending
      ? updateCategoryMutation.variables?.transactionId
      : undefined,
    transactionsHasError: transactionsQuery.isError,
    transactionsError: transactionsQuery.error instanceof Error
      ? transactionsQuery.error.message
      : "Failed to load transactions.",
    transactionsLoading: transactionsQuery.isLoading && !transactionsQuery.data,
    transactionsLoaded: sortedTransactions,
  });

  return (
    <div className="transactions-page">
      <PageHeader
        actions={pageActions}
        description="Review, filter, and recategorize account-scoped transactions inside the shared workspace while preserving the existing FastAPI contracts."
        eyebrow="Activity"
        title="Transactions"
      />

      <Card title="Filters">
        <TransactionsFilters
          accountId={accountId}
          accounts={accountsQuery.data?.accounts ?? []}
          counts={counts}
          currentFilter={currentFilter}
          filteredCount={filteredTransactions.length}
          onAccountChange={(nextAccountId) => {
            setAccountId(nextAccountId);
            setCurrentFilter("all");
          }}
          onFilterChange={setCurrentFilter}
          totalCount={sortedTransactions.length}
        />
      </Card>

      {categoriesQuery.isError ? (
        <p className="transactions-page__notice">
          Categories could not be loaded, so category editing is temporarily
          disabled. Refresh the page and try again.
        </p>
      ) : null}

      {transactionsQuery.isError && sortedTransactions.length ? (
        <p className="transactions-page__notice">
          {transactionsQuery.error instanceof Error
            ? transactionsQuery.error.message
            : "Transactions could not be refreshed. Showing the last loaded result."}
        </p>
      ) : null}

      {updateCategoryMutation.isError ? (
        <p className="transactions-page__notice">
          {updateCategoryMutation.error instanceof Error
            ? updateCategoryMutation.error.message
            : "Failed to update the transaction category."}
        </p>
      ) : null}

      <Card title="All transactions">{content}</Card>
    </div>
  );
}

function renderContent({
  categoriesAvailable,
  categoryOptions,
  currentFilter,
  filteredTransactions,
  onCategoryChange,
  onResetFilter,
  onRetry,
  pendingTransactionId,
  transactionsHasError,
  transactionsError,
  transactionsLoaded,
  transactionsLoading,
}: {
  categoriesAvailable: boolean;
  categoryOptions: string[];
  currentFilter: TransactionFilter;
  filteredTransactions: TransactionRecord[];
  onCategoryChange: (
    transactionId: string,
    currentCategory: string,
    nextCategory: string,
  ) => Promise<void>;
  onResetFilter: () => void;
  onRetry: () => void;
  pendingTransactionId?: string;
  transactionsHasError: boolean;
  transactionsError: string;
  transactionsLoaded: TransactionRecord[];
  transactionsLoading: boolean;
}) {
  if (transactionsLoading) {
    return <TransactionsLoadingState />;
  }

  if (transactionsHasError && !transactionsLoaded.length) {
    return (
      <EmptyState
        action={
          <Button onClick={onRetry} variant="secondary">
            Retry
          </Button>
        }
        description="The existing FastAPI transactions endpoint did not return data for this request."
        title={transactionsError}
      />
    );
  }

  if (!transactionsLoaded.length) {
    return <TransactionsEmptyState kind="no-transactions" />;
  }

  if (!filteredTransactions.length) {
    return (
      <TransactionsEmptyState
        kind="no-results"
        onShowAll={currentFilter !== "all" ? onResetFilter : undefined}
      />
    );
  }

  if (!categoryOptions.length) {
    return (
      <EmptyState
        description="Transactions loaded, but the category options are unavailable right now."
        title="Category options unavailable"
      />
    );
  }

  return (
    <TransactionsTable
      categories={categoryOptions}
      categoryEditingDisabled={!categoriesAvailable}
      onCategoryChange={(transactionId, currentCategory, nextCategory) => {
        void onCategoryChange(transactionId, currentCategory, nextCategory);
      }}
      pendingTransactionId={pendingTransactionId}
      transactions={filteredTransactions}
    />
  );
}
