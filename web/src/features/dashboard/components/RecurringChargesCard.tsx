import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import type { RecurringUpcomingItem } from "@/features/dashboard/types";
import {
  formatCurrency,
  formatShortDate,
} from "@/features/dashboard/utils";

type RecurringChargesCardProps = {
  errorMessage?: string;
  ignoringRuleId?: string;
  isLoading: boolean;
  items: RecurringUpcomingItem[];
  message?: {
    tone: "error" | "success";
    text: string;
  } | null;
  onIgnoreRule: (ruleId: string) => void;
};

export function RecurringChargesCard({
  errorMessage,
  ignoringRuleId,
  isLoading,
  items,
  message,
  onIgnoreRule,
}: RecurringChargesCardProps) {
  return (
    <Card
      description="Upcoming recurring charges due within the next 30 days."
      title="Upcoming recurring charges"
    >
      {isLoading ? (
        <LoadingState
          description="Loading recurring charges due in the next 30 days."
          title="Loading recurring charges"
        />
      ) : errorMessage ? (
        <EmptyState
          description="Recurring-charge data is temporarily unavailable for the selected account scope."
          title={errorMessage}
        />
      ) : !items.length ? (
        <EmptyState
          description="No recurring charges are currently due in the next 30 days."
          title="Nothing upcoming"
        />
      ) : (
        <div className="stack">
          <p className="dashboard-panel-summary">
            {items.length} due in the next 30 days
          </p>

          <div className="dashboard-table">
            <table>
              <thead>
                <tr>
                  <th>Merchant</th>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Category</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.rule_id}>
                    <td>{item.display_name || "-"}</td>
                    <td>{formatShortDate(item.expected_date)}</td>
                    <td>{formatCurrency(item.expected_amount)}</td>
                    <td>{item.category || "Uncategorized"}</td>
                    <td className="dashboard-table__actions-cell">
                      <Button
                        disabled={ignoringRuleId === item.rule_id}
                        onClick={() => onIgnoreRule(item.rule_id)}
                        variant="ghost"
                      >
                        {ignoringRuleId === item.rule_id ? "Removing…" : "Ignore"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="dashboard-mobile-list">
            {items.map((item) => (
              <div className="dashboard-mobile-card" key={item.rule_id}>
                <div className="dashboard-mobile-card__row">
                  <strong>{item.display_name || "-"}</strong>
                  <span>{formatCurrency(item.expected_amount)}</span>
                </div>
                <div className="dashboard-mobile-card__meta-grid">
                  <span>Date: {formatShortDate(item.expected_date)}</span>
                  <span>Category: {item.category || "Uncategorized"}</span>
                </div>
                <Button
                  disabled={ignoringRuleId === item.rule_id}
                  onClick={() => onIgnoreRule(item.rule_id)}
                  variant="ghost"
                >
                  {ignoringRuleId === item.rule_id ? "Removing…" : "Ignore rule"}
                </Button>
              </div>
            ))}
          </div>

          {message ? (
            <p className={`message message--${message.tone}`}>{message.text}</p>
          ) : null}
        </div>
      )}
    </Card>
  );
}
