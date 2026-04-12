const AUTH_STORAGE_KEYS = {
  accessToken: "access_token",
  userEmail: "user_email",
  userId: "user_id",
} as const;

export type StoredUser = {
  accessToken: string | null;
  email: string | null;
  id: string | null;
};

export function getStoredUser(): StoredUser {
  return {
    accessToken: window.localStorage.getItem(AUTH_STORAGE_KEYS.accessToken),
    email: window.localStorage.getItem(AUTH_STORAGE_KEYS.userEmail),
    id: window.localStorage.getItem(AUTH_STORAGE_KEYS.userId),
  };
}

export function hasStoredSession() {
  return Boolean(window.localStorage.getItem(AUTH_STORAGE_KEYS.accessToken));
}

export function persistSession(session: {
  accessToken: string;
  email: string;
  userId: string;
}) {
  window.localStorage.setItem(AUTH_STORAGE_KEYS.accessToken, session.accessToken);
  window.localStorage.setItem(AUTH_STORAGE_KEYS.userEmail, session.email);
  window.localStorage.setItem(AUTH_STORAGE_KEYS.userId, session.userId);
}

export function clearStoredSession() {
  window.localStorage.removeItem(AUTH_STORAGE_KEYS.accessToken);
  window.localStorage.removeItem(AUTH_STORAGE_KEYS.userEmail);
  window.localStorage.removeItem(AUTH_STORAGE_KEYS.userId);
}
