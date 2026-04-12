import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import type { BudgetHealthResponse } from "@/features/dashboard/types";
import {
  formatCurrency,
  getBudgetStatusLabel,
} from "@/features/dashboard/utils";

type BudgetHealthCardProps = {
  data?: BudgetHealthResponse;
  errorMessage?: string;
  isLoading: boolean;
};

export function BudgetHealthCard({
  data,
  errorMessage,
  isLoading,
}: BudgetHealthCardProps) {
  return (
    <Card
      description="Current-month budget target tracking across categories in scope."
      title="Budget health"
    >
      {isLoading ? (
        <LoadingState
          description="Loading current-month budget targets and actual spend."
          title="Loading budget health"
        />
      ) : errorMessage ? (
        <EmptyState
          description="Budget-health data is temporarily unavailable for the selected account scope."
          title={errorMessage}
        />
      ) : !data?.categories.length ? (
        <EmptyState
          description="Add budget targets or upload spending data to populate this panel."
          title="No budget data yet"
        />
      ) : (
        <div className="stack">
          <p className="dashboard-panel-summary">
            {data.month} | Target {formatCurrency(data.summary.target_total)} |
            Actual {formatCurrency(data.summary.actual_total)}
          </p>

          <div className="dashboard-table dashboard-table--budget">
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Target</th>
                  <th>Actual</th>
                  <th>Used</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.categories.map((category) => (
                  <tr key={category.category}>
                    <td>{category.category}</td>
                    <td>{formatCurrency(category.target)}</td>
                    <td>{formatCurrency(category.actual)}</td>
                    <td>{category.percent_used.toFixed(1)}%</td>
                    <td>
                      <span
                        className={`dashboard-status-badge dashboard-status-badge--${category.status}`}
                      >
                        {getBudgetStatusLabel(category.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="dashboard-mobile-list">
            {data.categories.map((category) => (
              <div className="dashboard-mobile-card" key={category.category}>
                <div className="dashboard-mobile-card__row">
                  <strong>{category.category}</strong>
                  <span
                    className={`dashboard-status-badge dashboard-status-badge--${category.status}`}
                  >
                    {getBudgetStatusLabel(category.status)}
                  </span>
                </div>
                <div className="dashboard-mobile-card__meta-grid">
                  <span>Target: {formatCurrency(category.target)}</span>
                  <span>Actual: {formatCurrency(category.actual)}</span>
                  <span>Used: {category.percent_used.toFixed(1)}%</span>
                  <span>Remaining: {formatCurrency(category.remaining)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
