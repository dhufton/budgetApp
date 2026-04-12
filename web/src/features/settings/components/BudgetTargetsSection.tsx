import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { LoadingState } from "@/components/ui/LoadingState";
import { Select } from "@/components/ui/Select";
import { useCategoriesQuery } from "@/features/categories/hooks/useCategoriesQuery";
import { settingsQueryKeys } from "@/features/settings/hooks/queryKeys";
import { useBudgetTargetsQuery } from "@/features/settings/hooks/useBudgetTargetsQuery";
import { formatCurrency, getErrorMessage } from "@/features/settings/utils";
import { api } from "@/lib/api/client";

type BudgetDraft = {
  targetAmount: string;
  threshold: string;
};

export function BudgetTargetsSection() {
  const queryClient = useQueryClient();
  const categoriesQuery = useCategoriesQuery();
  const targetsQuery = useBudgetTargetsQuery();
  const targets = targetsQuery.data?.targets ?? [];

  const categoryOptions = useMemo(
    () =>
      (categoriesQuery.data?.categories ?? []).filter(
        (category) => category !== "Transfer" && category !== "Uncategorized",
      ),
    [categoriesQuery.data?.categories],
  );

  const [selectedCategory, setSelectedCategory] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [threshold, setThreshold] = useState("80");
  const [drafts, setDrafts] = useState<Record<string, BudgetDraft>>({});
  const [suggestions, setSuggestions] = useState<Record<string, number>>({});
  const [suggestionMonths, setSuggestionMonths] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedCategory || categoryOptions.includes(selectedCategory)) {
      return;
    }

    setSelectedCategory(categoryOptions[0] ?? "");
  }, [categoryOptions, selectedCategory]);

  useEffect(() => {
    if (selectedCategory || !categoryOptions.length) {
      return;
    }

    setSelectedCategory(categoryOptions[0]);
  }, [categoryOptions, selectedCategory]);

  useEffect(() => {
    setDrafts(
      Object.fromEntries(
        targets.map((target) => [
          target.category,
          {
            targetAmount: String(target.target_amount ?? ""),
            threshold: String(target.threshold_percent ?? 80),
          },
        ]),
      ),
    );
  }, [targets]);

  const createTargetMutation = useMutation({
    mutationFn: (payload: {
      category: string;
      targetAmount: number;
      thresholdPercent: number;
    }) => api.setBudgetTarget(payload.category, payload.targetAmount, payload.thresholdPercent),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: settingsQueryKeys.budgetTargets });
    },
  });

  const updateTargetMutation = useMutation({
    mutationFn: ({
      category,
      payload,
    }: {
      category: string;
      payload: {
        target_amount: number;
        threshold_percent: number;
      };
    }) => api.updateBudgetTarget(category, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: settingsQueryKeys.budgetTargets });
    },
  });

  const deleteTargetMutation = useMutation({
    mutationFn: (category: string) => api.deleteBudgetTarget(category),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: settingsQueryKeys.budgetTargets });
    },
  });

  const generateSuggestionsMutation = useMutation({
    mutationFn: () => api.getBudgetSuggestions(),
  });

  const applySuggestionsMutation = useMutation({
    mutationFn: (nextSuggestions: Record<string, number>) =>
      Promise.all(
        Object.entries(nextSuggestions).map(([category, amount]) =>
          api.setBudgetTarget(category, amount),
        ),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: settingsQueryKeys.budgetTargets });
    },
  });

  async function handleCreateTarget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number.parseFloat(targetAmount);
    const parsedThreshold = Number.parseFloat(threshold);

    if (!selectedCategory) {
      setErrorMessage("Select a category before saving a target.");
      setNotice(null);
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setErrorMessage("Enter a valid positive monthly target.");
      setNotice(null);
      return;
    }

    if (!Number.isFinite(parsedThreshold) || parsedThreshold < 1 || parsedThreshold > 100) {
      setErrorMessage("Threshold must be between 1 and 100.");
      setNotice(null);
      return;
    }

    try {
      setErrorMessage(null);
      await createTargetMutation.mutateAsync({
        category: selectedCategory,
        targetAmount: amount,
        thresholdPercent: parsedThreshold,
      });
      setTargetAmount("");
      setThreshold("80");
      setNotice(`Budget target saved for ${selectedCategory}.`);
    } catch (error) {
      setNotice(null);
      setErrorMessage(getErrorMessage(error, "Failed to save budget target."));
    }
  }

  async function handleSaveInline(category: string) {
    const draft = drafts[category];
    const amount = Number.parseFloat(draft?.targetAmount ?? "");
    const parsedThreshold = Number.parseFloat(draft?.threshold ?? "");

    if (!Number.isFinite(amount) || amount <= 0) {
      setErrorMessage("Inline target amounts must be positive numbers.");
      setNotice(null);
      return;
    }

    if (!Number.isFinite(parsedThreshold) || parsedThreshold < 1 || parsedThreshold > 100) {
      setErrorMessage("Inline thresholds must stay between 1 and 100.");
      setNotice(null);
      return;
    }

    try {
      setErrorMessage(null);
      await updateTargetMutation.mutateAsync({
        category,
        payload: {
          target_amount: amount,
          threshold_percent: parsedThreshold,
        },
      });
      setNotice(`Updated ${category}.`);
    } catch (error) {
      setNotice(null);
      setErrorMessage(getErrorMessage(error, "Failed to update budget target."));
    }
  }

  async function handleDeleteTarget(category: string) {
    if (!window.confirm(`Remove the budget target for "${category}"?`)) {
      return;
    }

    try {
      setErrorMessage(null);
      await deleteTargetMutation.mutateAsync(category);
      setNotice(`Removed target for ${category}.`);
    } catch (error) {
      setNotice(null);
      setErrorMessage(getErrorMessage(error, "Failed to delete budget target."));
    }
  }

  async function handleGenerateSuggestions() {
    try {
      setErrorMessage(null);
      const result = await generateSuggestionsMutation.mutateAsync();
      setSuggestions(result.suggestions ?? {});
      setSuggestionMonths(result.based_on_months ?? null);
      if (!Object.keys(result.suggestions ?? {}).length) {
        setNotice("Not enough spending history to generate suggestions yet.");
      } else {
        setNotice("Budget suggestions generated.");
      }
    } catch (error) {
      setSuggestions({});
      setSuggestionMonths(null);
      setNotice(null);
      setErrorMessage(getErrorMessage(error, "Failed to generate budget suggestions."));
    }
  }

  async function handleApplySuggestions() {
    if (!Object.keys(suggestions).length) {
      return;
    }

    try {
      setErrorMessage(null);
      await applySuggestionsMutation.mutateAsync(suggestions);
      setSuggestions({});
      setSuggestionMonths(null);
      setNotice("Applied all suggested budget targets.");
    } catch (error) {
      setNotice(null);
      setErrorMessage(getErrorMessage(error, "Failed to apply budget suggestions."));
    }
  }

  return (
    <div className="settings-section-stack">
      <Card
        description="Targets and threshold percentages continue to use the existing budget target endpoints without changing payload shapes."
        title="Add budget target"
      >
        <form className="settings-form-grid settings-form-grid--budget" onSubmit={(event) => void handleCreateTarget(event)}>
          <label className="field">
            <span className="field__label">Category</span>
            <Select
              disabled={!categoryOptions.length || categoriesQuery.isError}
              onChange={(event) => setSelectedCategory(event.target.value)}
              value={selectedCategory}
            >
              {!categoryOptions.length ? <option value="">No categories available</option> : null}
              {categoryOptions.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </Select>
          </label>

          <label className="field">
            <span className="field__label">Monthly target</span>
            <Input
              min="0"
              onChange={(event) => setTargetAmount(event.target.value)}
              placeholder="500"
              step="0.01"
              type="number"
              value={targetAmount}
            />
          </label>

          <label className="field">
            <span className="field__label">Alert threshold (%)</span>
            <Input
              max="100"
              min="1"
              onChange={(event) => setThreshold(event.target.value)}
              step="1"
              type="number"
              value={threshold}
            />
          </label>

          <div className="settings-form-action">
            <Button
              disabled={createTargetMutation.isPending || !categoryOptions.length}
              fullWidth
              type="submit"
            >
              {createTargetMutation.isPending ? "Saving..." : "Set target"}
            </Button>
          </div>
        </form>

        {notice ? <p className="message message--success">{notice}</p> : null}
        {errorMessage ? <p className="message message--error">{errorMessage}</p> : null}
      </Card>

      <Card
        actions={
          <div className="settings-toolbar-actions">
            <Button
              disabled={generateSuggestionsMutation.isPending}
              onClick={() => void handleGenerateSuggestions()}
              variant="secondary"
            >
              {generateSuggestionsMutation.isPending
                ? "Generating..."
                : "Generate suggestions"}
            </Button>
            <Button
              disabled={
                applySuggestionsMutation.isPending || !Object.keys(suggestions).length
              }
              onClick={() => void handleApplySuggestions()}
            >
              {applySuggestionsMutation.isPending ? "Applying..." : "Apply all"}
            </Button>
          </div>
        }
        description="AI suggestions stay optional and continue to write through the existing budget target POST route."
        title="Suggested targets"
      >
        {Object.keys(suggestions).length ? (
          <div className="settings-list">
            {suggestionMonths ? (
              <p className="supporting-copy">
                Based on roughly {suggestionMonths} month{suggestionMonths === 1 ? "" : "s"}{" "}
                of spending history.
              </p>
            ) : null}

            {Object.entries(suggestions).map(([category, amount]) => (
              <article className="settings-item settings-item--compact" key={category}>
                <div className="settings-item__main">
                  <h3 className="settings-item__title">{category}</h3>
                </div>
                <div className="settings-item__actions">
                  <span className="settings-badge settings-badge--accent">
                    {formatCurrency(amount)}
                  </span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            description="Generate suggestions to review AI-backed monthly targets before applying them."
            title="No budget suggestions loaded"
          />
        )}
      </Card>

      <Card
        description="Targets can still be adjusted inline, including alert thresholds, without leaving the settings page."
        title="Current budget targets"
      >
        {targetsQuery.isLoading && !targets.length ? (
          <LoadingState
            title="Loading budget targets"
            description="Fetching current target amounts and alert thresholds."
          />
        ) : null}

        {targetsQuery.isError && !targets.length ? (
          <EmptyState
            action={
              <Button onClick={() => void targetsQuery.refetch()} variant="secondary">
                Retry
              </Button>
            }
            description="The budget target endpoint did not return data for this request."
            title={getErrorMessage(targetsQuery.error, "Failed to load budget targets.")}
          />
        ) : null}

        {!targetsQuery.isLoading && !targetsQuery.isError && !targets.length ? (
          <EmptyState
            description="Create your first target above or apply a suggestion to get started."
            title="No budget targets configured"
          />
        ) : null}

        {targets.length ? (
          <div className="settings-list">
            {targets.map((target) => {
              const isUpdating =
                updateTargetMutation.isPending &&
                updateTargetMutation.variables?.category === target.category;
              const isDeleting =
                deleteTargetMutation.isPending &&
                deleteTargetMutation.variables === target.category;

              return (
                <article className="settings-item" key={target.category}>
                  <div className="settings-item__main">
                    <div className="settings-item__headline">
                      <div className="settings-item__title-row">
                        <h3 className="settings-item__title">{target.category}</h3>
                        <span className="settings-badge settings-badge--muted">
                          Alert at {Number(target.threshold_percent ?? 80).toFixed(0)}%
                        </span>
                      </div>
                      <p className="settings-item__meta">
                        Current target {formatCurrency(Number(target.target_amount ?? 0))} per
                        month.
                      </p>
                    </div>

                    <div className="settings-form-grid settings-form-grid--inline">
                      <label className="field">
                        <span className="field__label">Monthly target</span>
                        <Input
                          min="0"
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [target.category]: {
                                ...current[target.category],
                                targetAmount: event.target.value,
                              },
                            }))
                          }
                          step="0.01"
                          type="number"
                          value={drafts[target.category]?.targetAmount ?? ""}
                        />
                      </label>

                      <label className="field">
                        <span className="field__label">Threshold (%)</span>
                        <Input
                          max="100"
                          min="1"
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [target.category]: {
                                ...current[target.category],
                                threshold: event.target.value,
                              },
                            }))
                          }
                          step="1"
                          type="number"
                          value={drafts[target.category]?.threshold ?? ""}
                        />
                      </label>
                    </div>
                  </div>

                  <div className="settings-item__actions">
                    <Button
                      disabled={isUpdating || isDeleting}
                      onClick={() => void handleSaveInline(target.category)}
                    >
                      {isUpdating ? "Saving..." : "Save"}
                    </Button>
                    <Button
                      disabled={isUpdating || isDeleting}
                      onClick={() => void handleDeleteTarget(target.category)}
                      variant="danger"
                    >
                      {isDeleting ? "Removing..." : "Remove"}
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
