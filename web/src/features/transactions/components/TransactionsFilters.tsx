import { Select } from "@/components/ui/Select";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
import type { Account } from "@/lib/api/types";
import type { TransactionFilter } from "@/features/transactions/utils";

type TransactionsFiltersProps = {
  accountId: string;
  accounts: Account[];
  currentFilter: TransactionFilter;
  filteredCount: number;
  totalCount: number;
  counts: Record<TransactionFilter, number>;
  onAccountChange: (accountId: string) => void;
  onFilterChange: (filter: TransactionFilter) => void;
};

export function TransactionsFilters({
  accountId,
  accounts,
  counts,
  currentFilter,
  filteredCount,
  onAccountChange,
  onFilterChange,
  totalCount,
}: TransactionsFiltersProps) {
  const filterTabs: TabItem<TransactionFilter>[] = [
    { value: "all", label: `All (${counts.all})` },
    { value: "uncategorized", label: `Uncategorized (${counts.uncategorized})` },
    { value: "categorized", label: `Categorized (${counts.categorized})` },
  ];

  const showingCopy =
    filteredCount === totalCount
      ? `Showing all ${totalCount} transactions`
      : `Showing ${filteredCount} of ${totalCount} transactions`;

  return (
    <section className="transactions-filters">
      <div className="transactions-filters__controls">
        <label className="field">
          <span className="field__label">Account</span>
          <Select
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
        </label>

        <div className="transactions-filters__tabs">
          <span className="field__label">Category status</span>
          <Tabs
            ariaLabel="Transaction filter"
            items={filterTabs}
            onChange={onFilterChange}
            value={currentFilter}
          />
        </div>
      </div>

      <p className="transactions-filters__summary">{showingCopy}</p>
    </section>
  );
}
