import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { LoadingState } from "@/components/ui/LoadingState";
import { Select } from "@/components/ui/Select";
import { useAccountsQuery } from "@/features/accounts/hooks/useAccountsQuery";
import { settingsQueryKeys } from "@/features/settings/hooks/queryKeys";
import { useGoalsAffordabilityQuery } from "@/features/settings/hooks/useGoalsAffordabilityQuery";
import {
  formatAccountScope,
  formatCurrency,
  formatDate,
  getErrorMessage,
  goalTypeLabel,
  goalVerdictMeta,
} from "@/features/settings/utils";
import { api } from "@/lib/api/client";

type GoalFormState = {
  accountScope: string;
  currentSaved: string;
  goalType: string;
  name: string;
  targetAmount: string;
  targetDate: string;
};

function getInitialGoalForm(): GoalFormState {
  return {
    accountScope: "all",
    currentSaved: "",
    goalType: "planned_purchase",
    name: "",
    targetAmount: "",
    targetDate: "",
  };
}

export function GoalsSection() {
  const queryClient = useQueryClient();
  const accountsQuery = useAccountsQuery();
  const accounts = accountsQuery.data?.accounts ?? [];
  const goalsQuery = useGoalsAffordabilityQuery("active");
  const goalItems = goalsQuery.data?.items ?? [];

  const [formState, setFormState] = useState<GoalFormState>(() => getInitialGoalForm());
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const createGoalMutation = useMutation({
    mutationFn: (payload: {
      account_scope: string;
      current_saved: number;
      goal_type: string;
      name: string;
      target_amount: number;
      target_date: string;
    }) => api.createGoal(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: settingsQueryKeys.goalsAffordability("active"),
      });
    },
  });

  const archiveGoalMutation = useMutation({
    mutationFn: (goalId: string) => api.archiveGoal(goalId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: settingsQueryKeys.goalsAffordability("active"),
      });
    },
  });

  async function handleCreateGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = formState.name.trim();
    const targetAmount = Number.parseFloat(formState.targetAmount);
    const currentSaved = Number.parseFloat(formState.currentSaved || "0");

    if (!trimmedName) {
      setErrorMessage("Goal name is required.");
      setNotice(null);
      return;
    }

    if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
      setErrorMessage("Enter a valid target amount.");
      setNotice(null);
      return;
    }

    if (!Number.isFinite(currentSaved) || currentSaved < 0) {
      setErrorMessage("Current saved must be zero or greater.");
      setNotice(null);
      return;
    }

    if (!formState.targetDate) {
      setErrorMessage("Select a target date.");
      setNotice(null);
      return;
    }

    try {
      setErrorMessage(null);
      await createGoalMutation.mutateAsync({
        account_scope: formState.accountScope,
        current_saved: currentSaved,
        goal_type: formState.goalType,
        name: trimmedName,
        target_amount: targetAmount,
        target_date: formState.targetDate,
      });
      setFormState(getInitialGoalForm());
      setNotice("Goal created.");
    } catch (error) {
      setNotice(null);
      setErrorMessage(getErrorMessage(error, "Failed to create goal."));
    }
  }

  async function handleArchiveGoal(goalId: string, goalName: string) {
    if (!window.confirm(`Archive "${goalName}"?`)) {
      return;
    }

    try {
      setErrorMessage(null);
      await archiveGoalMutation.mutateAsync(goalId);
      setNotice(`Archived ${goalName}.`);
    } catch (error) {
      setNotice(null);
      setErrorMessage(getErrorMessage(error, "Failed to archive goal."));
    }
  }

  return (
    <div className="settings-section-stack">
      <Card
        description="Goals keep the existing affordability model and account-scope selection, while the form now stacks cleanly on smaller screens."
        title="Add goal"
      >
        <form className="settings-form-grid settings-form-grid--goals" onSubmit={(event) => void handleCreateGoal(event)}>
          <label className="field">
            <span className="field__label">Goal name</span>
            <Input
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              placeholder="New laptop"
              value={formState.name}
            />
          </label>

          <label className="field">
            <span className="field__label">Goal type</span>
            <Select
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  goalType: event.target.value,
                }))
              }
              value={formState.goalType}
            >
              <option value="planned_purchase">Planned purchase</option>
              <option value="savings_target">Savings target</option>
            </Select>
          </label>

          <label className="field">
            <span className="field__label">Target amount</span>
            <Input
              min="0.01"
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  targetAmount: event.target.value,
                }))
              }
              placeholder="1200"
              step="0.01"
              type="number"
              value={formState.targetAmount}
            />
          </label>

          <label className="field">
            <span className="field__label">Current saved</span>
            <Input
              min="0"
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  currentSaved: event.target.value,
                }))
              }
              placeholder="200"
              step="0.01"
              type="number"
              value={formState.currentSaved}
            />
          </label>

          <label className="field">
            <span className="field__label">Target date</span>
            <Input
              min={new Date().toISOString().slice(0, 10)}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  targetDate: event.target.value,
                }))
              }
              type="date"
              value={formState.targetDate}
            />
          </label>

          <label className="field">
            <span className="field__label">Account scope</span>
            <Select
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  accountScope: event.target.value,
                }))
              }
              value={formState.accountScope}
            >
              <option value="all">All accounts</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </Select>
          </label>

          <div className="settings-form-action">
            <Button disabled={createGoalMutation.isPending} fullWidth type="submit">
              {createGoalMutation.isPending ? "Saving..." : "Add goal"}
            </Button>
          </div>
        </form>

        {notice ? <p className="message message--success">{notice}</p> : null}
        {errorMessage ? <p className="message message--error">{errorMessage}</p> : null}
      </Card>

      <Card
        description="Affordability still comes from the existing backend calculation, including required monthly saving and average net monthly saving."
        title="Active goals"
      >
        {goalsQuery.isLoading && !goalItems.length ? (
          <LoadingState
            title="Loading goals"
            description="Fetching active goals and their affordability projections."
          />
        ) : null}

        {goalsQuery.isError && !goalItems.length ? (
          <EmptyState
            action={
              <Button onClick={() => void goalsQuery.refetch()} variant="secondary">
                Retry
              </Button>
            }
            description="The goals affordability endpoint did not return data for this request."
            title={getErrorMessage(goalsQuery.error, "Failed to load goals.")}
          />
        ) : null}

        {!goalsQuery.isLoading && !goalsQuery.isError && !goalItems.length ? (
          <EmptyState
            description="Add a goal above to see savings progress and affordability guidance."
            title="No active goals"
          />
        ) : null}

        {goalItems.length ? (
          <div className="settings-list">
            {goalItems.map((item) => {
              const verdictMeta = goalVerdictMeta(item.affordability.verdict);
              const isArchiving =
                archiveGoalMutation.isPending &&
                archiveGoalMutation.variables === item.goal.id;

              return (
                <article className="settings-item" key={item.goal.id}>
                  <div className="settings-item__main">
                    <div className="settings-item__headline">
                      <div className="settings-item__title-row">
                        <h3 className="settings-item__title">{item.goal.name}</h3>
                        <span className="settings-badge settings-badge--muted">
                          {goalTypeLabel(item.goal.goal_type)}
                        </span>
                        <span className={`settings-badge settings-badge--${verdictMeta.tone}`}>
                          {verdictMeta.label}
                        </span>
                        <span className="settings-badge settings-badge--muted">
                          {formatAccountScope(item.goal.account_scope, accounts)}
                        </span>
                      </div>

                      <p className="settings-item__meta">
                        Target {formatCurrency(item.goal.target_amount)} by{" "}
                        {formatDate(item.goal.target_date)}. Saved so far{" "}
                        {formatCurrency(item.goal.current_saved)}.
                      </p>
                    </div>

                    <div className="settings-stat-grid">
                      <div className="settings-metric">
                        <span className="settings-metric__label">Required / month</span>
                        <strong>
                          {formatCurrency(item.affordability.required_monthly_saving)}
                        </strong>
                      </div>
                      <div className="settings-metric">
                        <span className="settings-metric__label">Average net / month</span>
                        <strong>
                          {formatCurrency(item.affordability.avg_net_monthly_saving)}
                        </strong>
                      </div>
                      <div className="settings-metric">
                        <span className="settings-metric__label">Projected by date</span>
                        <strong>
                          {formatCurrency(item.affordability.projected_saved_by_date)}
                        </strong>
                      </div>
                      <div className="settings-metric">
                        <span className="settings-metric__label">Months remaining</span>
                        <strong>{item.affordability.months_remaining}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="settings-item__actions">
                    <Button
                      disabled={isArchiving}
                      onClick={() =>
                        void handleArchiveGoal(item.goal.id, item.goal.name)
                      }
                      variant="danger"
                    >
                      {isArchiving ? "Archiving..." : "Archive"}
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
