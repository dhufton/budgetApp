import { Tabs, type TabItem } from "@/components/ui/Tabs";

export type SettingsTab =
  | "accounts"
  | "categories"
  | "recurring"
  | "budgets"
  | "goals";

const SETTINGS_TAB_ITEMS: TabItem<SettingsTab>[] = [
  { value: "accounts", label: "Accounts" },
  { value: "categories", label: "Categories" },
  { value: "recurring", label: "Recurring" },
  { value: "budgets", label: "Budgets" },
  { value: "goals", label: "Goals" },
];

type SettingsTabsProps = {
  value: SettingsTab;
  onChange: (value: SettingsTab) => void;
};

export function SettingsTabs({ onChange, value }: SettingsTabsProps) {
  return (
    <Tabs
      ariaLabel="Settings sections"
      items={SETTINGS_TAB_ITEMS}
      onChange={onChange}
      value={value}
    />
  );
}
