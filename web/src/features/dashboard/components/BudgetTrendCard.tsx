import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { LineChartGraphic } from "@/features/dashboard/components/LineChartGraphic";
import type { BudgetTrendResponse } from "@/features/dashboard/types";
import { getBudgetTrendTotals } from "@/features/dashboard/utils";

type BudgetTrendCardProps = {
  data?: BudgetTrendResponse;
  errorMessage?: string;
  isLoading: boolean;
};

export function BudgetTrendCard({
  data,
  errorMessage,
  isLoading,
}: BudgetTrendCardProps) {
  const chart = getBudgetTrendTotals(data);

  return (
    <Card
      description="Monthly target-versus-actual totals aggregated from the existing budget trend endpoint."
      title="Budget trend"
    >
      {isLoading ? (
        <LoadingState
          description="Loading monthly target-versus-actual totals."
          title="Loading budget trend"
        />
      ) : errorMessage ? (
        <EmptyState
          description="Budget trend data is temporarily unavailable for the selected account scope."
          title={errorMessage}
        />
      ) : !chart.labels.length || !chart.series.length ? (
        <EmptyState
          description="Add budget targets or upload spending data to build a monthly target-versus-actual history."
          title="No budget trend data yet"
        />
      ) : (
        <LineChartGraphic
          ariaLabel="Budget trend chart"
          labels={chart.labels}
          series={chart.series}
        />
      )}
    </Card>
  );
}
