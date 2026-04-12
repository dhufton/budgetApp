import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { LineChartGraphic } from "@/features/dashboard/components/LineChartGraphic";
import type { DashboardTransaction } from "@/features/dashboard/types";
import { getCategorySpendingSeries } from "@/features/dashboard/utils";

type CategorySpendingChartProps = {
  errorMessage?: string;
  isLoading: boolean;
  transactions: DashboardTransaction[];
};

export function CategorySpendingChart({
  errorMessage,
  isLoading,
  transactions,
}: CategorySpendingChartProps) {
  const chart = getCategorySpendingSeries(transactions);

  return (
    <Card
      description="Category-level spend trends across recent statement months."
      title="Category spending chart"
    >
      {isLoading ? (
        <LoadingState
          description="Grouping spend by month and category."
          title="Loading category trend"
        />
      ) : errorMessage ? (
        <EmptyState
          description="The underlying transactions query did not return data for this chart."
          title={errorMessage}
        />
      ) : !chart.labels.length || !chart.series.length ? (
        <EmptyState
          description="Upload statements to compare category-level spend over time."
          title="No category trend data yet"
        />
      ) : (
        <LineChartGraphic
          ariaLabel="Category spending chart"
          labels={chart.labels}
          series={chart.series}
        />
      )}
    </Card>
  );
}
