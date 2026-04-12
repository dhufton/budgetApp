import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api/client";
import { setUnauthorizedHandler } from "@/lib/api/client";
import type { ApiConfig } from "@/lib/api/types";
import {
  clearStoredSession,
  getStoredUser,
  hasStoredSession,
  persistSession,
  type StoredUser,
} from "@/lib/auth/storage";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type AuthStatus = "authenticated" | "unauthenticated";

type AuthContextValue = {
  status: AuthStatus;
  user: StoredUser;
  isAuthReady: boolean;
  isAuthenticating: boolean;
  authError: string | null;
  signIn: (args: { email: string; password: string }) => Promise<void>;
  signUp: (args: { email: string; password: string }) => Promise<{
    requiresEmailConfirmation: boolean;
  }>;
  logout: () => Promise<void>;
  clearAuthError: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>(() =>
    hasStoredSession() ? "authenticated" : "unauthenticated",
  );
  const [user, setUser] = useState<StoredUser>(() => getStoredUser());
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [configPromise, setConfigPromise] = useState<Promise<ApiConfig> | null>(null);

  useEffect(() => {
    const nextConfigPromise = api.getConfig();
    setConfigPromise(nextConfigPromise);

    nextConfigPromise
      .catch((error: unknown) => {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to initialize authentication";
        setAuthError(message);
      })
      .finally(() => {
        setIsAuthReady(true);
      });
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearStoredSession();
      setUser(getStoredUser());
      setStatus("unauthenticated");
      setAuthError(null);
      queryClient.clear();
    });

    return () => {
      setUnauthorizedHandler(null);
    };
  }, [queryClient]);

  async function resolveSupabaseClient() {
    if (!configPromise) {
      throw new Error("Authentication client is still loading");
    }

    const config = await configPromise;
    return createBrowserSupabaseClient(config);
  }

  async function signIn({ email, password }: { email: string; password: string }) {
    setAuthError(null);
    setIsAuthenticating(true);

    try {
      clearStoredSession();
      const supabase = await resolveSupabaseClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!data.session || !data.user?.id) {
        throw new Error("Login failed: session was not created");
      }

      persistSession({
        accessToken: data.session.access_token,
        email,
        userId: data.user.id,
      });
      setUser(getStoredUser());
      setStatus("authenticated");
      queryClient.clear();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Login failed";
      setAuthError(message);
      throw error;
    } finally {
      setIsAuthenticating(false);
    }
  }

  async function signUp({ email, password }: { email: string; password: string }) {
    setAuthError(null);
    setIsAuthenticating(true);

    try {
      const supabase = await resolveSupabaseClient();
      const { data, error } = await supabase.auth.signUp({ email, password });

      if (error) {
        throw new Error(error.message);
      }

      if (data.session && data.user?.id) {
        persistSession({
          accessToken: data.session.access_token,
          email,
          userId: data.user.id,
        });
        setUser(getStoredUser());
        setStatus("authenticated");
        queryClient.clear();
        return { requiresEmailConfirmation: false };
      }

      return { requiresEmailConfirmation: true };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Registration failed";
      setAuthError(message);
      throw error;
    } finally {
      setIsAuthenticating(false);
    }
  }

  async function logout() {
    clearStoredSession();
    setUser(getStoredUser());
    setStatus("unauthenticated");
    setAuthError(null);
    queryClient.clear();
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      isAuthReady,
      isAuthenticating,
      authError,
      signIn,
      signUp,
      logout,
      clearAuthError: () => setAuthError(null),
    }),
    [authError, isAuthReady, isAuthenticating, status, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
