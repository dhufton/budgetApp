import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import type { ReviewRecord } from "@/features/dashboard/types";
import {
  buildReviewHighlights,
  formatCurrency,
  formatDateTime,
  formatShortDate,
} from "@/features/dashboard/utils";

type MonthlyReviewCardProps = {
  history: ReviewRecord[];
  isGenerating: boolean;
  isLoading: boolean;
  latestReview: ReviewRecord | null;
  message?: {
    tone: "error" | "success";
    text: string;
  } | null;
  onGeneratePreviousMonth: () => void;
};

function getReviewTypeLabel(reviewType: string) {
  if (reviewType === "monthly_closeout") {
    return "Monthly closeout review";
  }

  if (reviewType === "upload_snapshot") {
    return "Upload snapshot review";
  }

  return "Review";
}

export function MonthlyReviewCard({
  history,
  isGenerating,
  isLoading,
  latestReview,
  message,
  onGeneratePreviousMonth,
}: MonthlyReviewCardProps) {
  const totals = latestReview?.summary?.totals;
  const highlights = buildReviewHighlights(latestReview?.summary);
  const merchants = latestReview?.summary?.top_merchants ?? [];

  return (
    <Card
      actions={
        <Button disabled={isGenerating} onClick={onGeneratePreviousMonth}>
          {isGenerating ? "Generating…" : "Generate previous month review"}
        </Button>
      }
      description="Latest review insights and recent review history from the existing monthly reviews endpoints."
      title="Monthly review"
    >
      {isLoading ? (
        <LoadingState
          description="Fetching the latest review and recent history for the selected account scope."
          title="Loading review"
        />
      ) : !latestReview && message?.tone === "error" ? (
        <EmptyState
          action={
            <Button disabled={isGenerating} onClick={onGeneratePreviousMonth}>
              {isGenerating ? "Generating…" : "Generate previous month review"}
            </Button>
          }
          description="The dashboard could not load review data for this account scope."
          title={message.text}
        />
      ) : !latestReview ? (
        <EmptyState
          action={
            <Button disabled={isGenerating} onClick={onGeneratePreviousMonth}>
              {isGenerating ? "Generating…" : "Generate previous month review"}
            </Button>
          }
          description="No reviews exist yet for this account scope."
          title="No review yet"
        />
      ) : (
        <div className="stack">
          <div className="dashboard-review-card__headline">
            <strong>{getReviewTypeLabel(latestReview.review_type)}</strong>
            <span>Generated {formatDateTime(latestReview.created_at)}</span>
          </div>

          <p className="dashboard-panel-summary">
            {formatShortDate(latestReview.period_start)} to{" "}
            {formatShortDate(latestReview.period_end)}
          </p>

          <div className="dashboard-review-card__totals">
            <div className="dashboard-review-card__total">
              <span>Spent</span>
              <strong>{formatCurrency(totals?.spent ?? 0)}</strong>
            </div>
            <div className="dashboard-review-card__total">
              <span>Income</span>
              <strong>{formatCurrency(totals?.income ?? 0)}</strong>
            </div>
            <div className="dashboard-review-card__total">
              <span>Net</span>
              <strong>{formatCurrency(totals?.net ?? 0)}</strong>
            </div>
          </div>

          <div className="two-column-grid dashboard-review-card__details">
            <div>
              <h4 className="dashboard-subheading">Top merchants</h4>
              {merchants.length ? (
                <ul className="detail-list">
                  {merchants.slice(0, 5).map((merchant) => (
                    <li key={merchant.merchant}>
                      {merchant.merchant}: {formatCurrency(merchant.amount)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="supporting-copy">No merchant highlights yet.</p>
              )}
            </div>

            <div>
              <h4 className="dashboard-subheading">Notable changes</h4>
              {highlights.length ? (
                <ul className="detail-list">
                  {highlights.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="supporting-copy">No notable changes.</p>
              )}
            </div>
          </div>

          {history.length ? (
            <div className="stack">
              <h4 className="dashboard-subheading">Recent history</h4>
              <div className="dashboard-history-list">
                {history.slice(0, 6).map((review) => (
                  <div className="dashboard-history-list__row" key={review.id}>
                    <span>
                      {review.review_type === "monthly_closeout"
                        ? "Monthly"
                        : "Upload"}{" "}
                      | {formatShortDate(review.period_start)} -{" "}
                      {formatShortDate(review.period_end)}
                    </span>
                    <strong>
                      {formatCurrency(review.summary?.totals?.spent ?? 0)}
                    </strong>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {message ? (
            <p className={`message message--${message.tone}`}>{message.text}</p>
          ) : null}
        </div>
      )}
    </Card>
  );
}
