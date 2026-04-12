import { useDeferredValue, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { LoadingState } from "@/components/ui/LoadingState";
import { Select } from "@/components/ui/Select";
import { TransactionCategorySelect } from "@/features/transactions/components/TransactionCategorySelect";
import type { DashboardTransaction } from "@/features/dashboard/types";
import {
  formatCurrency,
  formatShortDate,
} from "@/features/dashboard/utils";

type SortColumn = "amount" | "category" | "date";
type SortDirection = "asc" | "desc";

type DashboardTransactionsTableProps = {
  categories: string[];
  errorMessage?: string;
  isLoading: boolean;
  onCategoryChange: (
    transactionId: string,
    currentCategory: string,
    nextCategory: string,
  ) => Promise<void>;
  pendingTransactionId?: string;
  transactions: DashboardTransaction[];
};

export function DashboardTransactionsTable({
  categories,
  errorMessage,
  isLoading,
  onCategoryChange,
  pendingTransactionId,
  transactions,
}: DashboardTransactionsTableProps) {
  const [searchValue, setSearchValue] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortColumn, setSortColumn] = useState<SortColumn>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [pageSize, setPageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);
  const deferredSearchValue = useDeferredValue(searchValue);

  const filteredTransactions = useMemo(() => {
    const normalizedSearch = deferredSearchValue.trim().toLowerCase();

    return transactions.filter((transaction) => {
      const matchesSearch = normalizedSearch
        ? transaction.description.toLowerCase().includes(normalizedSearch)
        : true;
      const matchesCategory =
        categoryFilter === "all" ? true : transaction.category === categoryFilter;

      return matchesSearch && matchesCategory;
    });
  }, [categoryFilter, deferredSearchValue, transactions]);

  const sortedTransactions = useMemo(() => {
    const nextTransactions = [...filteredTransactions];

    nextTransactions.sort((left, right) => {
      let leftValue: number | string;
      let rightValue: number | string;

      if (sortColumn === "date") {
        leftValue = new Date(left.date).getTime();
        rightValue = new Date(right.date).getTime();
      } else if (sortColumn === "amount") {
        leftValue = Math.abs(left.amount);
        rightValue = Math.abs(right.amount);
      } else {
        leftValue = left.category.toLowerCase();
        rightValue = right.category.toLowerCase();
      }

      if (leftValue < rightValue) {
        return sortDirection === "asc" ? -1 : 1;
      }

      if (leftValue > rightValue) {
        return sortDirection === "asc" ? 1 : -1;
      }

      return 0;
    });

    return nextTransactions;
  }, [filteredTransactions, sortColumn, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sortedTransactions.length / pageSize));

  useEffect(() => {
    setCurrentPage(1);
  }, [categoryFilter, deferredSearchValue, pageSize, sortColumn, sortDirection]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedTransactions = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return sortedTransactions.slice(startIndex, startIndex + pageSize);
  }, [currentPage, pageSize, sortedTransactions]);

  function handleSort(nextColumn: SortColumn) {
    if (sortColumn === nextColumn) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortColumn(nextColumn);
    setSortDirection(nextColumn === "date" ? "desc" : "asc");
  }

  function renderSortIndicator(column: SortColumn) {
    if (sortColumn !== column) {
      return null;
    }

    return sortDirection === "asc" ? "↑" : "↓";
  }

  const countSummary = `${sortedTransactions.length.toLocaleString()} transaction${
    sortedTransactions.length === 1 ? "" : "s"
  }${
    sortedTransactions.length !== transactions.length
      ? ` (filtered from ${transactions.length.toLocaleString()})`
      : ""
  }`;

  const pageSummary = sortedTransactions.length
    ? `Page ${currentPage} of ${totalPages}`
    : "";

  return (
    <Card
      description="Local search, category filtering, sort order, pagination, and inline category editing all stay client-side on top of the existing transactions API."
      title="Transactions"
    >
      {isLoading ? (
        <LoadingState
          description="Loading the dashboard transactions table."
          title="Loading transactions"
        />
      ) : errorMessage && !transactions.length ? (
        <EmptyState
          description="The transactions endpoint did not return data for the selected account scope."
          title={errorMessage}
        />
      ) : !transactions.length ? (
        <EmptyState
          description="Upload a statement to populate the dashboard transactions table."
          title="No transactions yet"
        />
      ) : (
        <div className="stack">
          <div className="filter-grid dashboard-transactions__filters">
            <div className="field">
              <label className="field__label" htmlFor="dashboard-search">
                Search descriptions
              </label>
              <Input
                id="dashboard-search"
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="Search transactions"
                value={searchValue}
              />
            </div>

            <div className="field">
              <label className="field__label" htmlFor="dashboard-category-filter">
                Filter category
              </label>
              <Select
                id="dashboard-category-filter"
                onChange={(event) => setCategoryFilter(event.target.value)}
                value={categoryFilter}
              >
                <option value="all">All categories</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="dashboard-transactions__summary">
            <span>{countSummary}</span>
            <div className="dashboard-transactions__summary-controls">
              <label className="dashboard-transactions__page-size">
                <span>Rows</span>
                <Select
                  onChange={(event) => setPageSize(Number(event.target.value))}
                  value={String(pageSize)}
                >
                  {[25, 50, 100].map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </Select>
              </label>
              <span>{pageSummary}</span>
            </div>
          </div>

          {errorMessage && transactions.length ? (
            <p className="message message--error">
              {errorMessage} Showing the last loaded transaction result.
            </p>
          ) : null}

          {!sortedTransactions.length ? (
            <EmptyState
              action={
                <Button
                  onClick={() => {
                    setSearchValue("");
                    setCategoryFilter("all");
                  }}
                  variant="secondary"
                >
                  Reset filters
                </Button>
              }
              description="No transactions match the current table filters."
              title="No matching transactions"
            />
          ) : (
            <>
              <div className="dashboard-table dashboard-table--transactions">
                <table>
                  <thead>
                    <tr>
                      <th>
                        <button
                          className="dashboard-table__sort-button"
                          onClick={() => handleSort("date")}
                          type="button"
                        >
                          Date {renderSortIndicator("date")}
                        </button>
                      </th>
                      <th>Description</th>
                      <th>
                        <button
                          className="dashboard-table__sort-button"
                          onClick={() => handleSort("category")}
                          type="button"
                        >
                          Category {renderSortIndicator("category")}
                        </button>
                      </th>
                      <th className="dashboard-table__amount-column">
                        <button
                          className="dashboard-table__sort-button"
                          onClick={() => handleSort("amount")}
                          type="button"
                        >
                          Amount {renderSortIndicator("amount")}
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedTransactions.map((transaction) => (
                      <tr
                        className={
                          transaction.category === "Uncategorized"
                            ? "dashboard-table__row--uncategorized"
                            : undefined
                        }
                        key={transaction.id}
                      >
                        <td>{formatShortDate(transaction.date)}</td>
                        <td className="dashboard-table__description-cell">
                          {transaction.description}
                        </td>
                        <td className="dashboard-table__category-cell">
                          <TransactionCategorySelect
                            categories={categories}
                            isPending={pendingTransactionId === transaction.id}
                            onChange={(nextCategory) => {
                              void onCategoryChange(
                                transaction.id,
                                transaction.category,
                                nextCategory,
                              );
                            }}
                            value={transaction.category}
                          />
                        </td>
                        <td
                          className={`dashboard-table__amount ${
                            transaction.amount >= 0
                              ? "dashboard-table__amount--positive"
                              : "dashboard-table__amount--negative"
                          }`}
                        >
                          {formatCurrency(transaction.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="dashboard-mobile-list">
                {paginatedTransactions.map((transaction) => (
                  <div className="dashboard-mobile-card" key={transaction.id}>
                    <div className="dashboard-mobile-card__row">
                      <strong>{transaction.description}</strong>
                      <span
                        className={
                          transaction.amount >= 0
                            ? "dashboard-table__amount dashboard-table__amount--positive"
                            : "dashboard-table__amount dashboard-table__amount--negative"
                        }
                      >
                        {formatCurrency(transaction.amount)}
                      </span>
                    </div>
                    <div className="dashboard-mobile-card__meta-grid">
                      <span>Date: {formatShortDate(transaction.date)}</span>
                      <span>Category:</span>
                    </div>
                    <TransactionCategorySelect
                      categories={categories}
                      isPending={pendingTransactionId === transaction.id}
                      onChange={(nextCategory) => {
                        void onCategoryChange(
                          transaction.id,
                          transaction.category,
                          nextCategory,
                        );
                      }}
                      value={transaction.category}
                    />
                  </div>
                ))}
              </div>

              <div className="dashboard-transactions__pagination">
                <Button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(1)}
                  variant="secondary"
                >
                  First
                </Button>
                <Button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  variant="secondary"
                >
                  Prev
                </Button>
                <span>{pageSummary}</span>
                <Button
                  disabled={currentPage === totalPages}
                  onClick={() =>
                    setCurrentPage((page) => Math.min(totalPages, page + 1))
                  }
                  variant="secondary"
                >
                  Next
                </Button>
                <Button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(totalPages)}
                  variant="secondary"
                >
                  Last
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
