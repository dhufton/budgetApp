import { useDeferredValue, useState } from "react";

import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";

export function TransactionsPage() {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);

  return (
    <div className="stack-xl">
      <PageHeader
        description="The transactions table, filters, inline category editing, and pagination will move in the dedicated transactions branch. This page only establishes the shared page chrome and form controls."
        eyebrow="Foundation"
        title="Transactions"
      />

      <Card title="Filter bar placeholder">
        <div className="filter-grid">
          <label className="field">
            <span className="field__label">Search descriptions</span>
            <Input
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Merchant, memo, or keyword"
              value={search}
            />
          </label>

          <label className="field">
            <span className="field__label">Account scope</span>
            <Select defaultValue="all">
              <option value="all">All accounts</option>
              <option value="placeholder">Feature branch will populate this</option>
            </Select>
          </label>
        </div>
        <p className="supporting-copy">
          Deferred search state is wired for the future table implementation. Current value:
          <strong> {deferredSearch || "none"}</strong>
        </p>
      </Card>

      <Card title="Transactions table placeholder">
        <EmptyState
          description="The `react-transactions` branch can plug account-aware queries, filters, editing, and pagination into this space without revisiting shell/auth concerns."
          title="No transactions UI has moved yet"
        />
      </Card>
    </div>
  );
}
