import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { Select } from "@/components/ui/Select";
import type { ReviewQueueItem } from "@/features/dashboard/types";
import {
  formatCurrency,
  formatShortDate,
} from "@/features/dashboard/utils";

type AiReviewQueueProps = {
  categories: string[];
  errorMessage?: string;
  isAcceptingHighConfidence: boolean;
  isApproving: boolean;
  isLoading: boolean;
  isRejecting: boolean;
  items: ReviewQueueItem[];
  message?: {
    tone: "error" | "success";
    text: string;
  } | null;
  onAcceptHighConfidence: () => Promise<void>;
  onApproveSelected: (suggestionIds: string[]) => Promise<void>;
  onApplyOverride: (suggestionId: string, finalCategory: string) => Promise<void>;
  onRejectSelected: (suggestionIds: string[]) => Promise<void>;
  overridePendingId?: string;
};

export function AiReviewQueue({
  categories,
  errorMessage,
  isAcceptingHighConfidence,
  isApproving,
  isLoading,
  isRejecting,
  items,
  message,
  onAcceptHighConfidence,
  onApproveSelected,
  onApplyOverride,
  onRejectSelected,
  overridePendingId,
}: AiReviewQueueProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [overrideValues, setOverrideValues] = useState<Record<string, string>>({});

  useEffect(() => {
    const itemIds = new Set(items.map((item) => item.id));

    setSelectedIds((current) => current.filter((id) => itemIds.has(id)));
    setOverrideValues((current) => {
      const nextValues: Record<string, string> = {};

      items.forEach((item) => {
        nextValues[item.id] = current[item.id] ?? item.suggestion.suggested_category;
      });

      return nextValues;
    });
  }, [items]);

  const allSelected = useMemo(
    () => items.length > 0 && selectedIds.length === items.length,
    [items.length, selectedIds.length],
  );

  function toggleSelection(suggestionId: string) {
    setSelectedIds((current) =>
      current.includes(suggestionId)
        ? current.filter((id) => id !== suggestionId)
        : [...current, suggestionId],
    );
  }

  function toggleAll(nextChecked: boolean) {
    setSelectedIds(nextChecked ? items.map((item) => item.id) : []);
  }

  async function handleApprove() {
    if (!selectedIds.length) {
      return;
    }

    await onApproveSelected(selectedIds);
    setSelectedIds([]);
  }

  async function handleReject() {
    if (!selectedIds.length) {
      return;
    }

    await onRejectSelected(selectedIds);
    setSelectedIds([]);
  }

  return (
    <Card
      actions={
        <div className="dashboard-ai-review__header-actions">
          <Button
            disabled={isAcceptingHighConfidence || !items.length}
            onClick={() => {
              void onAcceptHighConfidence();
            }}
            variant="secondary"
          >
            {isAcceptingHighConfidence
              ? "Applying…"
              : "Accept high confidence"}
          </Button>
          <Button
            disabled={isApproving || !selectedIds.length}
            onClick={() => {
              void handleApprove();
            }}
          >
            {isApproving ? "Approving…" : "Approve selected"}
          </Button>
          <Button
            disabled={isRejecting || !selectedIds.length}
            onClick={() => {
              void handleReject();
            }}
            variant="ghost"
          >
            {isRejecting ? "Rejecting…" : "Reject selected"}
          </Button>
        </div>
      }
      description="Pending AI categorisation suggestions that still need human review."
      title="AI review queue"
    >
      {isLoading ? (
        <LoadingState
          description="Loading pending AI categorisation suggestions."
          title="Loading AI review queue"
        />
      ) : errorMessage ? (
        <EmptyState
          description="The review queue could not be loaded for the current account scope."
          title={errorMessage}
        />
      ) : !items.length ? (
        <EmptyState
          description="No pending AI suggestions need review right now."
          title="Queue is clear"
        />
      ) : (
        <div className="stack">
          <p className="dashboard-panel-summary">
            {items.length} suggestion{items.length === 1 ? "" : "s"} awaiting
            review
          </p>

          <div className="dashboard-table dashboard-table--review">
            <table>
              <thead>
                <tr>
                  <th className="dashboard-table__checkbox-column">
                    <input
                      aria-label="Select all suggestions"
                      checked={allSelected}
                      onChange={(event) => toggleAll(event.target.checked)}
                      type="checkbox"
                    />
                  </th>
                  <th>Transaction</th>
                  <th>Suggested</th>
                  <th>Confidence</th>
                  <th>Reason</th>
                  <th>Override</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="dashboard-table__checkbox-column">
                      <input
                        aria-label={`Select suggestion for ${item.transaction.description}`}
                        checked={selectedIds.includes(item.id)}
                        onChange={() => toggleSelection(item.id)}
                        type="checkbox"
                      />
                    </td>
                    <td>
                      <div className="stack">
                        <strong>{item.transaction.description}</strong>
                        <span className="supporting-copy">
                          {formatShortDate(item.transaction.date)} |{" "}
                          {formatCurrency(item.transaction.amount)}
                        </span>
                      </div>
                    </td>
                    <td>{item.suggestion.suggested_category}</td>
                    <td>{item.suggestion.confidence.toFixed(1)}%</td>
                    <td>{item.suggestion.reason || "-"}</td>
                    <td>
                      <div className="dashboard-ai-review__override">
                        <Select
                          onChange={(event) =>
                            setOverrideValues((current) => ({
                              ...current,
                              [item.id]: event.target.value,
                            }))
                          }
                          value={
                            overrideValues[item.id] ??
                            item.suggestion.suggested_category
                          }
                        >
                          {categories.map((category) => (
                            <option key={`${item.id}-${category}`} value={category}>
                              {category}
                            </option>
                          ))}
                        </Select>
                        <Button
                          disabled={overridePendingId === item.id}
                          onClick={() => {
                            void onApplyOverride(
                              item.id,
                              overrideValues[item.id] ??
                                item.suggestion.suggested_category,
                            );
                          }}
                          variant="secondary"
                        >
                          {overridePendingId === item.id ? "Applying…" : "Apply"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="dashboard-mobile-list">
            {items.map((item) => (
              <div className="dashboard-mobile-card" key={item.id}>
                <div className="dashboard-mobile-card__row">
                  <label className="dashboard-mobile-card__checkbox">
                    <input
                      checked={selectedIds.includes(item.id)}
                      onChange={() => toggleSelection(item.id)}
                      type="checkbox"
                    />
                    <span>{item.transaction.description}</span>
                  </label>
                  <strong>{formatCurrency(item.transaction.amount)}</strong>
                </div>
                <div className="dashboard-mobile-card__meta-grid">
                  <span>Date: {formatShortDate(item.transaction.date)}</span>
                  <span>Suggested: {item.suggestion.suggested_category}</span>
                  <span>Confidence: {item.suggestion.confidence.toFixed(1)}%</span>
                  <span>Reason: {item.suggestion.reason || "-"}</span>
                </div>
                <div className="dashboard-ai-review__override">
                  <Select
                    onChange={(event) =>
                      setOverrideValues((current) => ({
                        ...current,
                        [item.id]: event.target.value,
                      }))
                    }
                    value={
                      overrideValues[item.id] ?? item.suggestion.suggested_category
                    }
                  >
                    {categories.map((category) => (
                      <option key={`${item.id}-mobile-${category}`} value={category}>
                        {category}
                      </option>
                    ))}
                  </Select>
                  <Button
                    disabled={overridePendingId === item.id}
                    onClick={() => {
                      void onApplyOverride(
                        item.id,
                        overrideValues[item.id] ??
                          item.suggestion.suggested_category,
                      );
                    }}
                    variant="secondary"
                  >
                    {overridePendingId === item.id ? "Applying…" : "Apply"}
                  </Button>
                </div>
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
