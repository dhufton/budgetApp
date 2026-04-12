import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import type { Account } from "@/lib/api/types";

type DashboardHeaderProps = {
  accountId: string;
  accounts: Account[];
  onAccountChange: (nextAccountId: string) => void;
};

export function DashboardHeader({
  accountId,
  accounts,
  onAccountChange,
}: DashboardHeaderProps) {
  return (
    <div className="dashboard-header">
      <PageHeader
        actions={
          <Button
            onClick={() => {
              window.location.assign("/legacy/dashboard");
            }}
            variant="secondary"
          >
            Open legacy dashboard
          </Button>
        }
        description="Dashboard analytics, uploads, recurring insights, review workflows, and category editing now run inside the shared React shell while keeping the existing FastAPI contracts untouched."
        eyebrow="React migration"
        title="Dashboard"
      />

      <div className="dashboard-toolbar">
        <div className="field">
          <label className="field__label" htmlFor="dashboard-account-scope">
            Account scope
          </label>
          <Select
            id="dashboard-account-scope"
            onChange={(event) => onAccountChange(event.target.value)}
            value={accountId}
          >
            <option value="all">All accounts</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </Select>
        </div>

        <p className="dashboard-toolbar__hint">
          Charts, review panels, metrics, and the transactions table all reload
          against the selected account scope. Uploads keep their own account
          selector so statement files stay account-specific.
        </p>
      </div>
    </div>
  );
}
