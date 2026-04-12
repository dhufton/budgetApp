import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { LoadingState } from "@/components/ui/LoadingState";
import { Select } from "@/components/ui/Select";
import { useAccountsQuery } from "@/features/accounts/hooks/useAccountsQuery";
import { useCategoriesQuery } from "@/features/categories/hooks/useCategoriesQuery";
import { useRecurringRulesQuery } from "@/features/settings/hooks/useRecurringRulesQuery";
import {
  formatCurrency,
  formatDate,
  getDefaultAccountId,
  getErrorMessage,
  recurringCadenceLabel,
} from "@/features/settings/utils";
import { api } from "@/lib/api/client";
import type { RecurringRule, RecurringRuleStatus } from "@/lib/api/types";

type RecurringFormState = {
  accountId: string;
  amount: string;
  cadence: string;
  category: string;
  displayName: string;
  nextExpectedDate: string;
};

const RECURRING_STATUS_OPTIONS: RecurringRuleStatus[] = ["active", "ignored"];

function getInitialRecurringForm(categories: string[]): RecurringFormState {
  return {
    accountId: "",
    amount: "",
    cadence: "monthly",
    category: categories[0] ?? "Uncategorized",
    displayName: "",
    nextExpectedDate: "",
  };
}

export function RecurringRulesSection() {
  const queryClient = useQueryClient();
  const accountsQuery = useAccountsQuery();
  const categoriesQuery = useCategoriesQuery();
  const accounts = accountsQuery.data?.accounts ?? [];
  const categories = categoriesQuery.data?.categories ?? ["Uncategorized"];

  const [accountScope, setAccountScope] = useState("all");
  const [statusFilter, setStatusFilter] = useState<RecurringRuleStatus>("active");
  const [formState, setFormState] = useState<RecurringFormState>(() =>
    getInitialRecurringForm(categories),
  );
  const [draftCategories, setDraftCategories] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const rulesQuery = useRecurringRulesQuery(accountScope, statusFilter);
  const rules = rulesQuery.data?.rules ?? [];

  useEffect(() => {
    setFormState((current) => {
      const nextAccountId =
        current.accountId && accounts.some((account) => account.id === current.accountId)
          ? current.accountId
          : getDefaultAccountId(accounts);

      return {
        ...current,
        accountId: nextAccountId,
      };
    });
  }, [accounts]);

  useEffect(() => {
    setFormState((current) => ({
      ...current,
      category:
        categories.includes(current.category) || !categories.length
          ? current.category
          : categories[0] ?? "Uncategorized",
    }));
  }, [categories]);

  useEffect(() => {
    if (accountScope === "all" || accounts.some((account) => account.id === accountScope)) {
      return;
    }

    setAccountScope("all");
  }, [accountScope, accounts]);

  useEffect(() => {
    setDraftCategories(
      Object.fromEntries(rules.map((rule) => [rule.id, rule.category])),
    );
  }, [rules]);

  const accountNameById = useMemo(
    () =>
      Object.fromEntries(accounts.map((account) => [account.id, account.name])),
    [accounts],
  );

  const createRuleMutation = useMutation({
    mutationFn: (payload: {
      account_id: string;
      average_amount: number;
      cadence: string;
      category: string;
      confidence: number;
      display_name: string;
      next_expected_date: string;
      status: RecurringRuleStatus;
    }) => api.createRecurringRule(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["recurring"] });
    },
  });

  const updateRuleMutation = useMutation({
    mutationFn: ({
      payload,
      ruleId,
    }: {
      payload: { category?: string; status?: RecurringRuleStatus };
      ruleId: string;
    }) => api.updateRecurringRule(ruleId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["recurring"] });
    },
  });

  const recomputeMutation = useMutation({
    mutationFn: () =>
      api.recomputeRecurring({
        accountId: accountScope,
        lookbackMonths: 12,
        minOccurrences: 2,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["recurring"] });
    },
  });

  async function handleCreateRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedName = formState.displayName.trim();
    const amount = Number.parseFloat(formState.amount);

    if (!trimmedName) {
      setErrorMessage("Merchant or rule name is required.");
      setNotice(null);
      return;
    }

    if (!formState.accountId) {
      setErrorMessage("Select an account before creating the rule.");
      setNotice(null);
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setErrorMessage("Enter a valid positive amount.");
      setNotice(null);
      return;
    }

    if (!formState.nextExpectedDate) {
      setErrorMessage("Select the next expected date.");
      setNotice(null);
      return;
    }

    try {
      setErrorMessage(null);
      await createRuleMutation.mutateAsync({
        account_id: formState.accountId,
        average_amount: amount,
        cadence: formState.cadence,
        category: formState.category || "Uncategorized",
        confidence: 95,
        display_name: trimmedName,
        next_expected_date: formState.nextExpectedDate,
        status: "active",
      });
      setFormState((current) => ({
        ...current,
        amount: "",
        displayName: "",
        nextExpectedDate: "",
      }));
      setNotice("Recurring rule created.");
    } catch (error) {
      setNotice(null);
      setErrorMessage(getErrorMessage(error, "Failed to create recurring rule."));
    }
  }

  async function handleSaveRule(rule: RecurringRule) {
    const nextCategory = draftCategories[rule.id] ?? rule.category;
    if (nextCategory === rule.category) {
      setNotice("No recurring rule changes to save.");
      setErrorMessage(null);
      return;
    }

    try {
      setErrorMessage(null);
      await updateRuleMutation.mutateAsync({
        payload: { category: nextCategory },
        ruleId: rule.id,
      });
      setNotice("Recurring rule updated.");
    } catch (error) {
      setNotice(null);
      setErrorMessage(getErrorMessage(error, "Failed to update recurring rule."));
    }
  }

  async function handleToggleRuleStatus(rule: RecurringRule) {
    const nextStatus: RecurringRuleStatus =
      rule.status === "active" ? "ignored" : "active";

    try {
      setErrorMessage(null);
      await updateRuleMutation.mutateAsync({
        payload: { status: nextStatus },
        ruleId: rule.id,
      });
      setNotice(`Rule marked ${nextStatus}.`);
    } catch (error) {
      setNotice(null);
      setErrorMessage(getErrorMessage(error, "Failed to update recurring status."));
    }
  }

  async function handleRecompute() {
    try {
      setErrorMessage(null);
      const result = await recomputeMutation.mutateAsync();
      setNotice(
        `Recompute complete: ${result.rules_created} created, ${result.rules_updated} updated, ${result.scanned_transactions} scanned.`,
      );
    } catch (error) {
      setNotice(null);
      setErrorMessage(getErrorMessage(error, "Failed to recompute recurring rules."));
    }
  }

  return (
    <div className="settings-section-stack">
      <Card
        actions={
          <div className="settings-toolbar-actions">
            <Button
              disabled={recomputeMutation.isPending}
              onClick={() => void handleRecompute()}
            >
              {recomputeMutation.isPending ? "Recomputing..." : "Recompute rules"}
            </Button>
            <Button onClick={() => void rulesQuery.refetch()} variant="secondary">
              Refresh
            </Button>
          </div>
        }
        description="Recurring rules stay account-aware, can be recomputed from history, and still support manual rule creation."
        title="Recurring filters"
      >
        <div className="settings-card-stack">
          <div className="settings-form-grid settings-form-grid--filters">
            <label className="field">
              <span className="field__label">Account scope</span>
              <Select
                onChange={(event) => setAccountScope(event.target.value)}
                value={accountScope}
              >
                <option value="all">All accounts</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </Select>
            </label>

            <label className="field">
              <span className="field__label">Status</span>
              <Select
                onChange={(event) =>
                  setStatusFilter(event.target.value as RecurringRuleStatus)
                }
                value={statusFilter}
              >
                {RECURRING_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status === "active" ? "Active" : "Ignored"}
                  </option>
                ))}
              </Select>
            </label>
          </div>

          {notice ? <p className="message message--success">{notice}</p> : null}
          {errorMessage ? <p className="message message--error">{errorMessage}</p> : null}
        </div>
      </Card>

      <Card
        description="Manual rules use the same FastAPI endpoint as the legacy page, so account, cadence, amount, and next-date handling stay unchanged."
        title="Add recurring rule"
      >
        <form className="settings-form-grid settings-form-grid--recurring" onSubmit={(event) => void handleCreateRule(event)}>
          <label className="field">
            <span className="field__label">Merchant or rule name</span>
            <Input
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  displayName: event.target.value,
                }))
              }
              placeholder="Spotify"
              value={formState.displayName}
            />
          </label>

          <label className="field">
            <span className="field__label">Account</span>
            <Select
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  accountId: event.target.value,
                }))
              }
              value={formState.accountId}
            >
              {!accounts.length ? <option value="">No accounts available</option> : null}
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </Select>
          </label>

          <label className="field">
            <span className="field__label">Category</span>
            <Select
              disabled={categoriesQuery.isError}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  category: event.target.value,
                }))
              }
              value={formState.category}
            >
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </Select>
          </label>

          <label className="field">
            <span className="field__label">Cadence</span>
            <Select
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  cadence: event.target.value,
                }))
              }
              value={formState.cadence}
            >
              <option value="weekly">Weekly</option>
              <option value="biweekly">Biweekly</option>
              <option value="monthly">Monthly</option>
              <option value="irregular">Irregular</option>
            </Select>
          </label>

          <label className="field">
            <span className="field__label">Amount</span>
            <Input
              min="0.01"
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  amount: event.target.value,
                }))
              }
              placeholder="12.99"
              step="0.01"
              type="number"
              value={formState.amount}
            />
          </label>

          <label className="field">
            <span className="field__label">Next expected date</span>
            <Input
              min={new Date().toISOString().slice(0, 10)}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  nextExpectedDate: event.target.value,
                }))
              }
              type="date"
              value={formState.nextExpectedDate}
            />
          </label>

          <div className="settings-form-action">
            <Button disabled={createRuleMutation.isPending || !accounts.length} fullWidth type="submit">
              {createRuleMutation.isPending ? "Adding..." : "Add recurring rule"}
            </Button>
          </div>
        </form>
      </Card>

      <Card
        description={`Showing ${rules.length} ${statusFilter} recurring rule${
          rules.length === 1 ? "" : "s"
        } for the selected scope.`}
        title="Recurring rules"
      >
        {rulesQuery.isLoading && !rules.length ? (
          <LoadingState
            title="Loading recurring rules"
            description="Fetching recurring rules for the selected scope and status."
          />
        ) : null}

        {rulesQuery.isError && !rules.length ? (
          <EmptyState
            action={
              <Button onClick={() => void rulesQuery.refetch()} variant="secondary">
                Retry
              </Button>
            }
            description="The recurring rules endpoint did not return data for this request."
            title={getErrorMessage(rulesQuery.error, "Failed to load recurring rules.")}
          />
        ) : null}

        {!rulesQuery.isLoading && !rulesQuery.isError && !rules.length ? (
          <EmptyState
            description="Recompute rules from historical transactions or add one manually above."
            title="No recurring rules found"
          />
        ) : null}

        {rules.length ? (
          <div className="settings-list">
            {rules.map((rule) => {
              const isPending =
                updateRuleMutation.isPending &&
                updateRuleMutation.variables?.ruleId === rule.id;

              const categoryOptions = Array.from(
                new Set([...(categoriesQuery.data?.categories ?? []), rule.category]),
              );

              return (
                <article className="settings-item" key={rule.id}>
                  <div className="settings-item__main">
                    <div className="settings-item__headline">
                      <div className="settings-item__title-row">
                        <h3 className="settings-item__title">{rule.display_name || "Unknown"}</h3>
                        <span
                          className={`settings-badge ${
                            rule.status === "active"
                              ? "settings-badge--success"
                              : "settings-badge--muted"
                          }`}
                        >
                          {rule.status === "active" ? "Active" : "Ignored"}
                        </span>
                        <span className="settings-badge settings-badge--muted">
                          {accountNameById[rule.account_id] ?? "Unknown account"}
                        </span>
                      </div>

                      <div className="settings-stat-grid">
                        <div className="settings-metric">
                          <span className="settings-metric__label">Cadence</span>
                          <strong>{recurringCadenceLabel(rule.cadence)}</strong>
                        </div>
                        <div className="settings-metric">
                          <span className="settings-metric__label">Average</span>
                          <strong>{formatCurrency(rule.average_amount)}</strong>
                        </div>
                        <div className="settings-metric">
                          <span className="settings-metric__label">Next expected</span>
                          <strong>{formatDate(rule.next_expected_date)}</strong>
                        </div>
                        <div className="settings-metric">
                          <span className="settings-metric__label">Confidence</span>
                          <strong>{rule.confidence.toFixed(1)}%</strong>
                        </div>
                      </div>

                      <p className="settings-item__meta">
                        {rule.due_in_days == null
                          ? "Next due date unavailable."
                          : rule.due_in_days >= 0
                            ? `Due in ${rule.due_in_days} day${rule.due_in_days === 1 ? "" : "s"}.`
                            : `Expected ${Math.abs(rule.due_in_days)} day${
                                Math.abs(rule.due_in_days) === 1 ? "" : "s"
                              } ago.`}
                      </p>
                    </div>
                  </div>

                  <div className="settings-item__controls">
                    <label className="field">
                      <span className="field__label">Category</span>
                      <Select
                        disabled={categoriesQuery.isError || isPending}
                        onChange={(event) =>
                          setDraftCategories((current) => ({
                            ...current,
                            [rule.id]: event.target.value,
                          }))
                        }
                        value={draftCategories[rule.id] ?? rule.category}
                      >
                        {categoryOptions.map((category) => (
                          <option key={`${rule.id}-${category}`} value={category}>
                            {category}
                          </option>
                        ))}
                      </Select>
                    </label>

                    <div className="settings-action-row">
                      <Button disabled={isPending} onClick={() => void handleSaveRule(rule)}>
                        {isPending ? "Saving..." : "Save"}
                      </Button>
                      <Button
                        disabled={isPending}
                        onClick={() => void handleToggleRuleStatus(rule)}
                        variant="secondary"
                      >
                        {rule.status === "active" ? "Ignore" : "Restore"}
                      </Button>
                    </div>
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
