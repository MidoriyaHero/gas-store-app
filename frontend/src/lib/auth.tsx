import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";

/** Authenticated user returned by ``/api/auth/me``. */
export interface AuthUser {
  id: number;
  username: string;
  role: "admin" | "user";
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Read current session from cookie-backed backend auth. */
async function readSession(): Promise<AuthUser | null> {
  try {
    const data = await apiGet<{ user: AuthUser }>("/api/auth/me");
    return data.user;
  } catch {
    return null;
  }
}

/** Manage auth state for route guards and role-based UI. */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshMe = async () => {
    const next = await readSession();
    setUser(next);
  };

  useEffect(() => {
    (async () => {
      await refreshMe();
      setLoading(false);
    })();
  }, []);

  const login = async (username: string, password: string) => {
    const data = await apiPost<{ user: AuthUser }>("/api/auth/login", { username, password });
    setUser(data.user);
  };

  const logout = async () => {
    await apiPost("/api/auth/logout", {});
    setUser(null);
  };

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, login, logout, refreshMe }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Hook to consume auth state in pages and layout. */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
