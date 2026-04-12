import type { TransactionRecord } from "@/lib/api/types";

export type TransactionFilter = "all" | "uncategorized" | "categorized";

export function sortTransactions(transactions: TransactionRecord[]) {
  return [...transactions].sort(
    (left, right) =>
      new Date(right.date).getTime() - new Date(left.date).getTime(),
  );
}

export function filterTransactions(
  transactions: TransactionRecord[],
  filter: TransactionFilter,
) {
  switch (filter) {
    case "uncategorized":
      return transactions.filter(
        (transaction) => transaction.category === "Uncategorized",
      );
    case "categorized":
      return transactions.filter(
        (transaction) => transaction.category !== "Uncategorized",
      );
    case "all":
    default:
      return transactions;
  }
}

export function getTransactionCounts(transactions: TransactionRecord[]) {
  const uncategorized = transactions.filter(
    (transaction) => transaction.category === "Uncategorized",
  ).length;

  return {
    all: transactions.length,
    uncategorized,
    categorized: transactions.length - uncategorized,
  } satisfies Record<TransactionFilter, number>;
}

export function formatTransactionDate(value: string) {
  if (!value) {
    return "N/A";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function formatTransactionAmount(amount: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(Number(amount)));
}
