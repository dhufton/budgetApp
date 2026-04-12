import { createBrowserRouter, Navigate } from "react-router-dom";

import { AppShell } from "@/components/layout/AppShell";
import { ProtectedRoute } from "@/features/auth/components/ProtectedRoute";
import { AuthPage } from "@/features/auth/pages/AuthPage";
import { DashboardPage } from "@/features/dashboard/pages/DashboardPage";
import { SettingsPage } from "@/features/settings/pages/SettingsPage";
import { TransactionsPage } from "@/features/transactions/pages/TransactionsPage";

const basename = import.meta.env.BASE_URL.replace(/\/$/, "");

export const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <AuthPage />,
    },
    {
      element: <ProtectedRoute />,
      children: [
        {
          element: <AppShell />,
          children: [
            {
              path: "/dashboard",
              element: <DashboardPage />,
            },
            {
              path: "/settings",
              element: <SettingsPage />,
            },
            {
              path: "/transactions",
              element: <TransactionsPage />,
            },
          ],
        },
      ],
    },
    {
      path: "*",
      element: <Navigate replace to="/dashboard" />,
    },
  ],
  { basename },
);
