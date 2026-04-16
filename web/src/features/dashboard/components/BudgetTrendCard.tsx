import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { LineChartGraphic } from "@/features/dashboard/components/LineChartGraphic";
import type { BudgetTrendResponse } from "@/features/dashboard/types";
import { getBudgetTrendCategorySeries } from "@/features/dashboard/utils";

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
  const chart = getBudgetTrendCategorySeries(data);

  return (
    <Card
      description="Click a category in the legend to hide it. Double-click a category to isolate it. Solid lines show actual spend and matching dashed lines show budget targets."
      title="Budget trend"
    >
      {isLoading ? (
        <LoadingState
          description="Loading monthly target-versus-actual trends by category."
          title="Loading budget trend"
        />
      ) : errorMessage ? (
        <EmptyState
          description="Budget trend data is temporarily unavailable for the selected account scope."
          title={errorMessage}
        />
      ) : !chart.labels.length || !chart.series.length ? (
        <EmptyState
          description="Add budget targets or upload spending data to compare actual and budgeted spend by category."
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
