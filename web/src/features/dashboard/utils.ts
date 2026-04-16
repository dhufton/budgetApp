import { DEFAULT_CATEGORIES } from "@/lib/constants/categories";

import type {
  BudgetTrendResponse,
  DashboardTransaction,
  ReviewSummary,
} from "@/features/dashboard/types";

type ChartPoint = {
  label: string;
  value: number;
};

type MultiSeriesChart = {
  labels: string[];
  series: Array<{
    id: string;
    label: string;
    color: string;
    legendGroup?: string;
    strokeDasharray?: string;
    values: number[];
  }>;
};

export const DASHBOARD_CHART_COLORS = [
  "#17695d",
  "#0f766e",
  "#d97706",
  "#2563eb",
  "#dc2626",
  "#7c3aed",
  "#c2410c",
  "#0891b2",
] as const;

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-GB", {
    currency: "GBP",
    style: "currency",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount ?? 0));
}

export function formatShortDate(value: string) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

export function formatDateTime(value: string) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function formatMonthLabel(value: string) {
  if (!value) {
    return "-";
  }

  const [year, month] = value.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);

  return new Intl.DateTimeFormat("en-GB", {
    month: "short",
    year: "2-digit",
  }).format(date);
}

export function getDashboardMetrics(transactions: DashboardTransaction[]) {
  const spending = transactions
    .filter((transaction) => transaction.amount < 0 && transaction.category !== "Transfer")
    .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
  const income = transactions
    .filter((transaction) => transaction.amount > 0)
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const uncategorizedCount = transactions.filter(
    (transaction) => transaction.category === "Uncategorized",
  ).length;

  return {
    totalTransactions: transactions.length,
    totalSpent: spending,
    netSaved: income - spending,
    uncategorizedCount,
  };
}

export function buildDashboardCategoryList(
  apiCategories: string[],
  transactions: DashboardTransaction[],
) {
  const seen = new Set<string>();

  const addCategory = (value: string | undefined | null) => {
    const nextValue = String(value ?? "").trim();
    if (nextValue) {
      seen.add(nextValue);
    }
  };

  DEFAULT_CATEGORIES.forEach(addCategory);
  apiCategories.forEach(addCategory);
  transactions.forEach((transaction) => addCategory(transaction.category));

  const orderedDefaults = DEFAULT_CATEGORIES.filter((category) =>
    seen.has(category),
  );
  const customCategories = [...seen]
    .filter(
      (category) =>
        !DEFAULT_CATEGORIES.some((defaultCategory) => defaultCategory === category),
    )
    .sort((left, right) => left.localeCompare(right));

  return [...orderedDefaults, ...customCategories];
}

export function getDefaultUploadAccountId(
  accounts: Array<{ id: string; is_default: boolean }>,
) {
  return accounts.find((account) => account.is_default)?.id ?? accounts[0]?.id ?? "";
}

export function getSpendingPieData(transactions: DashboardTransaction[]) {
  const totals = new Map<string, number>();

  transactions
    .filter((transaction) => transaction.amount < 0 && transaction.category !== "Transfer")
    .forEach((transaction) => {
      const category = transaction.category || "Uncategorized";
      totals.set(category, (totals.get(category) ?? 0) + Math.abs(transaction.amount));
    });

  return [...totals.entries()]
    .map(([label, value], index) => ({
      label,
      value,
      color: DASHBOARD_CHART_COLORS[index % DASHBOARD_CHART_COLORS.length],
    }))
    .sort((left, right) => right.value - left.value);
}

export function getMonthlySpendSeries(
  transactions: DashboardTransaction[],
): ChartPoint[] {
  const monthlyTotals = new Map<string, number>();

  transactions
    .filter((transaction) => transaction.amount < 0 && transaction.category !== "Transfer")
    .forEach((transaction) => {
      const month = transaction.date.slice(0, 7);
      monthlyTotals.set(
        month,
        (monthlyTotals.get(month) ?? 0) + Math.abs(transaction.amount),
      );
    });

  return [...monthlyTotals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([label, value]) => ({ label, value }));
}

export function getCategorySpendingSeries(
  transactions: DashboardTransaction[],
): MultiSeriesChart {
  const spendingTransactions = transactions.filter(
    (transaction) => transaction.amount < 0 && transaction.category !== "Transfer",
  );
  const labels = [...new Set(spendingTransactions.map((transaction) => transaction.date.slice(0, 7)))].sort();
  const categories = [...new Set(spendingTransactions.map((transaction) => transaction.category || "Uncategorized"))].sort(
    (left, right) => left.localeCompare(right),
  );

  const monthCategoryTotals = new Map<string, Map<string, number>>();

  spendingTransactions.forEach((transaction) => {
    const month = transaction.date.slice(0, 7);
    const category = transaction.category || "Uncategorized";
    const monthTotals = monthCategoryTotals.get(month) ?? new Map<string, number>();

    monthTotals.set(
      category,
      (monthTotals.get(category) ?? 0) + Math.abs(transaction.amount),
    );
    monthCategoryTotals.set(month, monthTotals);
  });

  return {
    labels,
    series: categories.map((category, index) => ({
      id: category,
      label: category,
      color: DASHBOARD_CHART_COLORS[index % DASHBOARD_CHART_COLORS.length],
      legendGroup: category,
      values: labels.map(
        (label) => monthCategoryTotals.get(label)?.get(category) ?? 0,
      ),
    })),
  };
}

export function getBudgetTrendCategorySeries(
  data?: BudgetTrendResponse | null,
): MultiSeriesChart {
  if (!data) {
    return { labels: [], series: [] };
  }

  const monthCategoryTotals = new Map<
    string,
    Map<string, { actual: number; target: number }>
  >();
  const categories = (data.categories ?? [])
    .filter((category) => category && category !== "Transfer")
    .sort((left, right) => left.localeCompare(right));

  data.months.forEach((month) => {
    monthCategoryTotals.set(month, new Map());
  });

  data.series.forEach((point) => {
    if (!point.category || point.category === "Transfer") {
      return;
    }

    const monthTotals =
      monthCategoryTotals.get(point.month) ?? new Map<string, { actual: number; target: number }>();
    const existing = monthTotals.get(point.category) ?? { actual: 0, target: 0 };
    existing.actual += Number(point.actual ?? 0);
    existing.target += Number(point.target ?? 0);
    monthTotals.set(point.category, existing);
    monthCategoryTotals.set(point.month, monthTotals);
  });

  const categoriesWithValues = categories.filter((category) =>
    data.months.some((month) => {
      const totals = monthCategoryTotals.get(month)?.get(category);
      return Boolean((totals?.actual ?? 0) || (totals?.target ?? 0));
    }),
  );

  return {
    labels: data.months,
    series: categoriesWithValues.flatMap((category, index) => {
      const color = DASHBOARD_CHART_COLORS[index % DASHBOARD_CHART_COLORS.length];
      const values = data.months.map((month) => monthCategoryTotals.get(month)?.get(category));

      return [
        {
          id: `${category}-actual`,
          label: `${category} actual`,
          color,
          legendGroup: category,
          values: values.map((value) => Number((value?.actual ?? 0).toFixed(2))),
        },
        {
          id: `${category}-target`,
          label: `${category} target`,
          color,
          legendGroup: category,
          strokeDasharray: "5 4",
          values: values.map((value) => Number((value?.target ?? 0).toFixed(2))),
        },
      ];
    }),
  };
}

export function buildReviewHighlights(summary?: ReviewSummary) {
  const items: string[] = [];
  const flags = summary?.flags ?? [];
  const categoryChanges = summary?.category_changes_vs_previous ?? [];
  const budgetVariance = summary?.budget_variance ?? [];

  flags.forEach((flag) => {
    const category = String(flag.category ?? "Uncategorized");

    if (flag.type === "spike_vs_previous") {
      const change = categoryChanges.find((entry) => entry.category === category);
      const deltaPercent = Number(change?.delta_pct ?? 0);

      items.push(
        deltaPercent > 0
          ? `${category}: up ${deltaPercent.toFixed(1)}% vs previous period`
          : `Increase in ${category.toLowerCase()} spending`,
      );
      return;
    }

    if (flag.type === "over_budget") {
      const variance = budgetVariance.find((entry) => entry.category === category);
      const overspend = Math.max(
        0,
        Number(variance?.actual ?? 0) - Number(variance?.target ?? 0),
      );

      items.push(
        overspend > 0
          ? `${category}: over budget by ${formatCurrency(overspend)}`
          : `Over budget in ${category.toLowerCase()}`,
      );
    }
  });

  return [...new Set(items)];
}

export function getBudgetStatusLabel(
  status: "on_track" | "at_risk" | "over_budget" | "no_target",
) {
  switch (status) {
    case "on_track":
      return "On track";
    case "at_risk":
      return "At risk";
    case "over_budget":
      return "Over budget";
    case "no_target":
    default:
      return "No target";
  }
}
