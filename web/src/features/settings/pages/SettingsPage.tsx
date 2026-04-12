import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs, type TabItem } from "@/components/ui/Tabs";

type SettingsTab = "shared" | "next";

const SETTINGS_TABS: TabItem<SettingsTab>[] = [
  { value: "shared", label: "Shared foundation" },
  { value: "next", label: "Next migration slice" },
];

export function SettingsPage() {
  const [tab, setTab] = useState<SettingsTab>("shared");
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div className="stack-xl">
      <PageHeader
        actions={
          <Button onClick={() => setIsModalOpen(true)} variant="secondary">
            View handoff notes
          </Button>
        }
        description="Settings is the staging ground for accounts, categories, budgets, goals, and recurring rules. This branch only establishes the shared React scaffolding."
        eyebrow="Foundation"
        title="Settings"
      />

      <Tabs
        ariaLabel="Settings migration status"
        items={SETTINGS_TABS}
        onChange={setTab}
        value={tab}
      />

      {tab === "shared" ? (
        <div className="two-column-grid">
          <Card
            description="Shared primitives are ready to support form-heavy settings workflows without carrying legacy global scripts forward."
            title="Ready for reuse"
          >
            <ul className="detail-list">
              <li>Buttons, inputs, selects, cards, tabs, modal shell.</li>
              <li>Authenticated layout and typed API entry points.</li>
              <li>Mobile-first spacing, typography, and surface tokens.</li>
            </ul>
          </Card>
          <Card
            description="The legacy settings screen remains responsible for real account and category management until those modules are ported."
            title="Still on legacy"
          >
            <ul className="detail-list">
              <li>Accounts CRUD and default-account safeguards.</li>
              <li>Category keywords and recategorisation actions.</li>
              <li>Budget targets, goal planner, and recurring rules.</li>
            </ul>
          </Card>
        </div>
      ) : (
        <Card
          description="The next feature branch can isolate transactions first or split settings into smaller slices like accounts/categories and budgets/recurring."
          title="Suggested follow-up work"
        >
          <ul className="detail-list">
            <li>Build typed feature hooks around account, category, and budget endpoints.</li>
            <li>Move each settings section into its own feature module under <code>src/features</code>.</li>
            <li>Replace local placeholder state with query + mutation flows incrementally.</li>
          </ul>
        </Card>
      )}

      <Modal
        description="These notes are intended for the next branch so the migration stays incremental."
        footer={
          <Button onClick={() => setIsModalOpen(false)} variant="primary">
            Close notes
          </Button>
        }
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Settings migration handoff"
      >
        <ul className="detail-list">
          <li>Keep feature ownership narrow and preserve existing FastAPI payload shapes.</li>
          <li>Prefer dedicated hooks for accounts, categories, budgets, and recurring sections.</li>
          <li>Leave the legacy page live until each React replacement reaches parity.</li>
        </ul>
      </Modal>
    </div>
  );
}
