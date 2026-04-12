import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { LoadingState } from "@/components/ui/LoadingState";
import { Select } from "@/components/ui/Select";
import { useAccountsQuery } from "@/features/accounts/hooks/useAccountsQuery";
import { api } from "@/lib/api/client";
import type { AccountType } from "@/lib/api/types";
import { getErrorMessage } from "@/features/settings/utils";

const ACCOUNT_TYPE_OPTIONS: Array<{ label: string; value: AccountType }> = [
  { value: "current", label: "Current" },
  { value: "credit", label: "Credit" },
  { value: "savings", label: "Savings" },
  { value: "other", label: "Other" },
];

export function AccountsSection() {
  const queryClient = useQueryClient();
  const accountsQuery = useAccountsQuery();
  const accounts = accountsQuery.data?.accounts ?? [];

  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountType, setNewAccountType] = useState<AccountType>("current");
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingType, setEditingType] = useState<AccountType>("current");
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const createAccountMutation = useMutation({
    mutationFn: (payload: { account_type: AccountType; name: string }) =>
      api.createAccount(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
  });

  const updateAccountMutation = useMutation({
    mutationFn: ({
      accountId,
      payload,
    }: {
      accountId: string;
      payload: {
        account_type?: AccountType;
        is_default?: boolean;
        name?: string;
      };
    }) => api.updateAccount(accountId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: (accountId: string) => api.deleteAccount(accountId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
  });

  async function handleCreateAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = newAccountName.trim();
    if (!trimmedName) {
      setErrorMessage("Account name is required.");
      setNotice(null);
      return;
    }

    try {
      setErrorMessage(null);
      await createAccountMutation.mutateAsync({
        account_type: newAccountType,
        name: trimmedName,
      });
      setNewAccountName("");
      setNewAccountType("current");
      setNotice(`Created ${trimmedName}.`);
    } catch (error) {
      setNotice(null);
      setErrorMessage(getErrorMessage(error, "Failed to create account."));
    }
  }

  function beginEditing(accountId: string, accountName: string, accountType: AccountType) {
    setEditingAccountId(accountId);
    setEditingName(accountName);
    setEditingType(accountType);
    setNotice(null);
    setErrorMessage(null);
  }

  async function handleSaveAccount(accountId: string) {
    const trimmedName = editingName.trim();
    if (!trimmedName) {
      setErrorMessage("Account name is required.");
      setNotice(null);
      return;
    }

    try {
      setErrorMessage(null);
      await updateAccountMutation.mutateAsync({
        accountId,
        payload: {
          account_type: editingType,
          name: trimmedName,
        },
      });
      setEditingAccountId(null);
      setNotice(`Updated ${trimmedName}.`);
    } catch (error) {
      setNotice(null);
      setErrorMessage(getErrorMessage(error, "Failed to update account."));
    }
  }

  async function handleMakeDefault(accountId: string) {
    try {
      setErrorMessage(null);
      await updateAccountMutation.mutateAsync({
        accountId,
        payload: { is_default: true },
      });
      setNotice("Default account updated.");
    } catch (error) {
      setNotice(null);
      setErrorMessage(getErrorMessage(error, "Failed to update the default account."));
    }
  }

  async function handleDeleteAccount(accountId: string, accountName: string) {
    if (!window.confirm("Delete this account? It must be empty and non-default.")) {
      return;
    }

    try {
      setErrorMessage(null);
      await deleteAccountMutation.mutateAsync(accountId);
      if (editingAccountId === accountId) {
        setEditingAccountId(null);
      }
      setNotice(`Deleted ${accountName}.`);
    } catch (error) {
      setNotice(null);
      setErrorMessage(getErrorMessage(error, "Failed to delete account."));
    }
  }

  return (
    <div className="settings-section-stack">
      <Card
        description="Accounts stay fully auth-protected and keep the backend default-account safeguards intact."
        title="Add account"
      >
        <form className="settings-form-grid settings-form-grid--accounts" onSubmit={(event) => void handleCreateAccount(event)}>
          <label className="field">
            <span className="field__label">Account name</span>
            <Input
              onChange={(event) => setNewAccountName(event.target.value)}
              placeholder="Main current account"
              value={newAccountName}
            />
          </label>

          <label className="field">
            <span className="field__label">Type</span>
            <Select
              onChange={(event) => setNewAccountType(event.target.value as AccountType)}
              value={newAccountType}
            >
              {ACCOUNT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>

          <div className="settings-form-action">
            <Button disabled={createAccountMutation.isPending} fullWidth type="submit">
              {createAccountMutation.isPending ? "Adding..." : "Add account"}
            </Button>
          </div>
        </form>

        {notice ? <p className="message message--success">{notice}</p> : null}
        {errorMessage ? <p className="message message--error">{errorMessage}</p> : null}
      </Card>

      <Card
        description="Default accounts remain pinned first. Non-default empty accounts can still be removed."
        title="Configured accounts"
      >
        {accountsQuery.isLoading && !accounts.length ? (
          <LoadingState
            title="Loading accounts"
            description="Reading the account list from the existing FastAPI endpoint."
          />
        ) : null}

        {accountsQuery.isError && !accounts.length ? (
          <EmptyState
            action={
              <Button onClick={() => void accountsQuery.refetch()} variant="secondary">
                Retry
              </Button>
            }
            description="The existing accounts API did not return data for this request."
            title={getErrorMessage(accountsQuery.error, "Failed to load accounts.")}
          />
        ) : null}

        {!accountsQuery.isLoading && !accountsQuery.isError && !accounts.length ? (
          <EmptyState
            description="Create an account first so uploads, recurring rules, and scoped goals have somewhere to land."
            title="No accounts configured"
          />
        ) : null}

        {accounts.length ? (
          <div className="settings-list">
            {accounts.map((account) => {
              const isEditing = editingAccountId === account.id;
              const updatePendingAccountId = updateAccountMutation.isPending
                ? updateAccountMutation.variables?.accountId
                : null;
              const deletePendingAccountId = deleteAccountMutation.isPending
                ? deleteAccountMutation.variables
                : null;
              const isPending =
                updatePendingAccountId === account.id || deletePendingAccountId === account.id;

              return (
                <article className="settings-item" key={account.id}>
                  <div className="settings-item__main">
                    <div className="settings-item__headline">
                      <div className="settings-item__title-row">
                        <h3 className="settings-item__title">{account.name}</h3>
                        <span className="settings-badge settings-badge--muted">
                          {ACCOUNT_TYPE_OPTIONS.find(
                            (option) => option.value === account.account_type,
                          )?.label ?? account.account_type}
                        </span>
                        {account.is_default ? (
                          <span className="settings-badge settings-badge--accent">Default</span>
                        ) : null}
                      </div>
                      <p className="settings-item__meta">
                        {account.is_default
                          ? "Used automatically for uploads and recurring detection when no account is selected."
                          : "Available for scoped uploads, recurring rules, and goals."}
                      </p>
                    </div>

                    {isEditing ? (
                      <div className="settings-form-grid settings-form-grid--inline">
                        <label className="field">
                          <span className="field__label">Account name</span>
                          <Input
                            onChange={(event) => setEditingName(event.target.value)}
                            value={editingName}
                          />
                        </label>

                        <label className="field">
                          <span className="field__label">Type</span>
                          <Select
                            onChange={(event) =>
                              setEditingType(event.target.value as AccountType)
                            }
                            value={editingType}
                          >
                            {ACCOUNT_TYPE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </Select>
                        </label>
                      </div>
                    ) : null}
                  </div>

                  <div className="settings-item__actions">
                    {isEditing ? (
                      <>
                        <Button
                          disabled={isPending}
                          onClick={() => void handleSaveAccount(account.id)}
                        >
                          {isPending ? "Saving..." : "Save"}
                        </Button>
                        <Button
                          onClick={() => setEditingAccountId(null)}
                          variant="secondary"
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          onClick={() =>
                            beginEditing(account.id, account.name, account.account_type)
                          }
                          variant="ghost"
                        >
                          Edit
                        </Button>
                        {!account.is_default ? (
                          <Button
                            disabled={isPending}
                            onClick={() => void handleMakeDefault(account.id)}
                            variant="secondary"
                          >
                            {isPending ? "Updating..." : "Make default"}
                          </Button>
                        ) : null}
                        {!account.is_default ? (
                          <Button
                            disabled={isPending}
                            onClick={() =>
                              void handleDeleteAccount(account.id, account.name)
                            }
                            variant="danger"
                          >
                            {isPending ? "Deleting..." : "Delete"}
                          </Button>
                        ) : null}
                      </>
                    )}
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
