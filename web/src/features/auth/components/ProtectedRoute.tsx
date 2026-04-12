import { Navigate, Outlet, useLocation } from "react-router-dom";

import { LoadingState } from "@/components/ui/LoadingState";
import { useAuth } from "@/features/auth/components/AuthProvider";

export function ProtectedRoute() {
  const location = useLocation();
  const { status, isAuthReady } = useAuth();

  if (!isAuthReady) {
    return (
      <div className="route-loading">
        <LoadingState
          title="Preparing workspace"
          description="Loading authentication configuration."
        />
      </div>
    );
  }

  if (status !== "authenticated") {
    return <Navigate replace state={{ from: location }} to="/" />;
  }

  return <Outlet />;
}
