import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { AccountsSection } from "@/features/settings/components/AccountsSection";
import { BudgetTargetsSection } from "@/features/settings/components/BudgetTargetsSection";
import { CategoriesSection } from "@/features/settings/components/CategoriesSection";
import { GoalsSection } from "@/features/settings/components/GoalsSection";
import { RecurringRulesSection } from "@/features/settings/components/RecurringRulesSection";
import {
  SettingsTabs,
  type SettingsTab,
} from "@/features/settings/components/SettingsTabs";
import "@/features/settings/settings.css";

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("accounts");

  return (
    <div className="settings-page">
      <PageHeader
        actions={
          <Button
            onClick={() => {
              window.location.assign("/legacy/settings");
            }}
            variant="secondary"
          >
            Open legacy page
          </Button>
        }
        description="Settings now runs on the shared React shell while keeping the existing FastAPI payloads and auth model intact. Accounts, categories, recurring rules, budgets, and goals still use the current backend contracts."
        eyebrow="React migration"
        title="Settings"
      />

      <div className="settings-page__tabs">
        <SettingsTabs onChange={setActiveTab} value={activeTab} />
      </div>

      <section className="settings-page__panel">
        {activeTab === "accounts" ? <AccountsSection /> : null}
        {activeTab === "categories" ? <CategoriesSection /> : null}
        {activeTab === "recurring" ? <RecurringRulesSection /> : null}
        {activeTab === "budgets" ? <BudgetTargetsSection /> : null}
        {activeTab === "goals" ? <GoalsSection /> : null}
      </section>
    </div>
  );
}
