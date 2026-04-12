import { NavLink, Outlet } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageContainer } from "@/components/layout/PageContainer";
import { useAccountsQuery } from "@/features/accounts/hooks/useAccountsQuery";
import { useAuth } from "@/features/auth/components/AuthProvider";

const navigationItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/transactions", label: "Transactions" },
  { href: "/settings", label: "Settings" },
];

export function AppShell() {
  const { data, isLoading } = useAccountsQuery();
  const { logout, user } = useAuth();

  return (
    <div className="app-shell">
      <aside className="app-shell__sidebar">
        <div className="app-shell__brand-block">
          <span className="app-shell__eyebrow">BudgetApp</span>
          <h1 className="app-shell__brand">BudgetApp</h1>
          <p className="app-shell__summary">
            Dashboard, transactions, and settings now share one React
            application shell with FastAPI continuing to serve the API and
            authentication configuration.
          </p>
        </div>

        <nav aria-label="Primary navigation" className="app-shell__nav">
          {navigationItems.map((item) => (
            <NavLink
              className={({ isActive }) =>
                `app-shell__nav-link${isActive ? " app-shell__nav-link--active" : ""}`
              }
              key={item.href}
              to={item.href}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="app-shell__content">
        <header className="app-shell__topbar">
          <div>
            <span className="app-shell__topbar-label">Authenticated session</span>
            <div className="app-shell__topbar-value">{user.email ?? "Signed in"}</div>
          </div>
          <div className="app-shell__topbar-actions">
            <span className="status-pill">
              {isLoading
                ? "Loading accounts"
                : `${data?.accounts.length ?? 0} account${
                    data?.accounts.length === 1 ? "" : "s"
                  }`}
            </span>
            <Button onClick={() => void logout()} variant="secondary">
              Log out
            </Button>
          </div>
        </header>

        <main className="app-shell__main">
          {isLoading && !data ? (
            <PageContainer>
              <LoadingState
                title="Loading workspace"
                description="Verifying account-scoped data access for the shared shell."
              />
            </PageContainer>
          ) : (
            <PageContainer>
              <Outlet />
            </PageContainer>
          )}
        </main>
      </div>
    </div>
  );
}
