import { Card } from "@/components/ui/Card";
import { formatCurrency } from "@/features/dashboard/utils";

type MetricsCardsProps = {
  isLoading?: boolean;
  netSaved: number;
  totalSpent: number;
  totalTransactions: number;
};

export function MetricsCards({
  isLoading = false,
  netSaved,
  totalSpent,
  totalTransactions,
}: MetricsCardsProps) {
  return (
    <div className="dashboard-metrics-grid">
      <Card className="dashboard-metric-card" title="Total transactions">
        <p className="dashboard-metric-card__value">
          {isLoading ? "…" : totalTransactions.toLocaleString()}
        </p>
        <p className="dashboard-metric-card__caption">
          Account-scoped transactions currently loaded into the dashboard.
        </p>
      </Card>

      <Card className="dashboard-metric-card" title="Total spent">
        <p className="dashboard-metric-card__value">
          {isLoading ? "…" : formatCurrency(totalSpent)}
        </p>
        <p className="dashboard-metric-card__caption">
          Expense-only spend excluding transfers.
        </p>
      </Card>

      <Card className="dashboard-metric-card" title="Net saved">
        <p
          className={`dashboard-metric-card__value ${
            netSaved >= 0
              ? "dashboard-metric-card__value--positive"
              : "dashboard-metric-card__value--negative"
          }`}
        >
          {isLoading ? "…" : formatCurrency(netSaved)}
        </p>
        <p className="dashboard-metric-card__caption">
          Income minus spend within the current dashboard scope.
        </p>
      </Card>
    </div>
  );
}
