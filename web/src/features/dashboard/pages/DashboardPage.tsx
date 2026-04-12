import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";

export function DashboardPage() {
  return (
    <div className="stack-xl">
      <PageHeader
        actions={
          <Button
            onClick={() => {
              window.location.assign("/dashboard");
            }}
            variant="secondary"
          >
            Open legacy dashboard
          </Button>
        }
        description="This placeholder confirms the shared shell, navigation, auth guard, and query wiring. Analytics, uploads, charts, and review workflows stay in the legacy page for now."
        eyebrow="Foundation"
        title="Dashboard"
      />

      <div className="two-column-grid">
        <Card
          description="Later branches can compose charts, upload flows, and review panels on top of the shared API/query foundation."
          title="What is already migrated"
        >
          <ul className="detail-list">
            <li>Protected routing under the React app namespace.</li>
            <li>TanStack Query provider and authenticated API client.</li>
            <li>Reusable layout primitives and neutral design tokens.</li>
          </ul>
        </Card>

        <Card
          description="The dashboard migration branch can focus on page behavior instead of re-solving auth, layout, or styling."
          title="What stays for later"
        >
          <ul className="detail-list">
            <li>Statement upload and duplicate-file handling.</li>
            <li>Budget health, recurring, and monthly review visualizations.</li>
            <li>AI categorisation review queues and analytics tables.</li>
          </ul>
        </Card>
      </div>

      <Card title="Dashboard surface placeholder">
        <EmptyState
          description="Charts, upload controls, and review modules will be added in a dedicated dashboard migration branch using this shared shell."
          title="No dashboard widgets have moved yet"
        />
      </Card>
    </div>
  );
}
