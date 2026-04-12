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
        description="Uploads, analytics, review workflows, recurring insights, and inline category editing all use the existing FastAPI endpoints inside the shared workspace."
        eyebrow="Overview"
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
