import { useState } from "react";

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
        description="Manage accounts, categories, recurring rules, budgets, and goals with the existing FastAPI payloads and the shared workspace layout."
        eyebrow="Management"
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
