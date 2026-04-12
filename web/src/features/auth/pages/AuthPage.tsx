import { useMemo, useState, useTransition, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { LoadingState } from "@/components/ui/LoadingState";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
import { useAuth } from "@/features/auth/components/AuthProvider";

type AuthMode = "login" | "register";

const AUTH_TABS: TabItem<AuthMode>[] = [
  { value: "login", label: "Sign in" },
  { value: "register", label: "Register" },
];

export function AuthPage() {
  const navigate = useNavigate();
  const [isNavigating, startTransition] = useTransition();
  const {
    authError,
    clearAuthError,
    isAuthReady,
    isAuthenticating,
    signIn,
    signUp,
    status,
  } = useAuth();
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const submitLabel = useMemo(() => {
    if (isAuthenticating) {
      return mode === "login" ? "Signing in..." : "Creating account...";
    }

    return mode === "login" ? "Sign in" : "Create account";
  }, [isAuthenticating, mode]);

  if (status === "authenticated") {
    return <Navigate replace to="/dashboard" />;
  }

  if (!isAuthReady) {
    return (
      <div className="auth-page">
        <LoadingState
          title="Preparing authentication"
          description="Loading Supabase configuration from FastAPI."
        />
      </div>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearAuthError();
    setNotice(null);

    try {
      if (mode === "login") {
        await signIn({ email, password });
        startTransition(() => {
          navigate("/dashboard", { replace: true });
        });
        return;
      }

      const result = await signUp({ email, password });
      if (result.requiresEmailConfirmation) {
        setNotice("Account created. Check your email to confirm the new user.");
        return;
      }

      startTransition(() => {
        navigate("/dashboard", { replace: true });
      });
    } catch {
      return;
    }
  }

  return (
    <div className="auth-page">
      <section className="auth-page__hero">
        <span className="auth-page__eyebrow">BudgetApp</span>
        <h1 className="auth-page__title">Sign in to your budgeting workspace.</h1>
        <p className="auth-page__description">
          The React app is now the primary interface for dashboard, settings,
          and transactions while FastAPI remains the source of truth for data
          and authentication configuration.
        </p>
        <div className="auth-page__highlights">
          <div>
            <strong>Same auth model</strong>
            <p>Supabase browser auth and bearer-token FastAPI requests remain unchanged.</p>
          </div>
        </div>
      </section>

      <Card className="auth-card" title="Access your account">
        <Tabs
          ariaLabel="Authentication mode"
          items={AUTH_TABS}
          onChange={(nextMode) => {
            clearAuthError();
            setNotice(null);
            setMode(nextMode);
          }}
          value={mode}
        />

        <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
          <label className="field">
            <span className="field__label">Email</span>
            <Input
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              required
              type="email"
              value={email}
            />
          </label>

          <label className="field">
            <span className="field__label">Password</span>
            <Input
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={6}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Minimum 6 characters"
              required
              type="password"
              value={password}
            />
          </label>

          {authError ? <p className="message message--error">{authError}</p> : null}
          {notice ? <p className="message message--success">{notice}</p> : null}

          <Button disabled={isAuthenticating || isNavigating} fullWidth type="submit">
            {submitLabel}
          </Button>
        </form>
      </Card>
    </div>
  );
}
