import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { LineChartGraphic } from "@/features/dashboard/components/LineChartGraphic";
import type { DashboardTransaction } from "@/features/dashboard/types";
import {
  getMonthlySpendSeries,
} from "@/features/dashboard/utils";

type MonthlySpendChartProps = {
  errorMessage?: string;
  isLoading: boolean;
  transactions: DashboardTransaction[];
};

export function MonthlySpendChart({
  errorMessage,
  isLoading,
  transactions,
}: MonthlySpendChartProps) {
  const monthlySpend = getMonthlySpendSeries(transactions);

  return (
    <Card
      description="Month-by-month spend trend excluding transfers."
      title="Monthly spend trend"
    >
      {isLoading ? (
        <LoadingState
          description="Preparing the month-by-month spend series."
          title="Loading monthly spend"
        />
      ) : errorMessage ? (
        <EmptyState
          description="The underlying transactions query did not return data for this chart."
          title={errorMessage}
        />
      ) : !monthlySpend.length ? (
        <EmptyState
          description="Upload statements to see a monthly spending trend."
          title="No monthly spend data yet"
        />
      ) : (
        <LineChartGraphic
          ariaLabel="Monthly spend trend chart"
          labels={monthlySpend.map((point) => point.label)}
          series={[
            {
              id: "monthly-spend",
              label: "Monthly spend",
              color: "#17695d",
              values: monthlySpend.map((point) => point.value),
            },
          ]}
        />
      )}
    </Card>
  );
}
