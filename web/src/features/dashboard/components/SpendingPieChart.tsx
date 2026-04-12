import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { PieChartGraphic } from "@/features/dashboard/components/PieChartGraphic";
import type { DashboardTransaction } from "@/features/dashboard/types";
import {
  formatCurrency,
  getSpendingPieData,
} from "@/features/dashboard/utils";

type SpendingPieChartProps = {
  errorMessage?: string;
  isLoading: boolean;
  transactions: DashboardTransaction[];
};

export function SpendingPieChart({
  errorMessage,
  isLoading,
  transactions,
}: SpendingPieChartProps) {
  const slices = getSpendingPieData(transactions);

  return (
    <Card
      description="Expense-only breakdown for the currently selected account scope."
      title="Spending breakdown"
    >
      {isLoading ? (
        <LoadingState
          description="Calculating category totals from the latest transactions."
          title="Loading spending breakdown"
        />
      ) : errorMessage ? (
        <EmptyState
          description="The dashboard transactions dataset did not load, so this chart is temporarily unavailable."
          title={errorMessage}
        />
      ) : !slices.length ? (
        <EmptyState
          description="Upload statements to see category spend distribution."
          title="No spending data yet"
        />
      ) : (
        <div className="dashboard-chart-card">
          <PieChartGraphic slices={slices} />
          <div className="dashboard-chart-card__summary">
            {slices.slice(0, 5).map((slice) => (
              <div className="dashboard-chart-card__summary-row" key={slice.label}>
                <span>{slice.label}</span>
                <strong>{formatCurrency(slice.value)}</strong>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
