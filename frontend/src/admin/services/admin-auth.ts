/**
 * Admin authentication, backed by the Express API.
 *
 * Sign-in goes through POST /api/auth/login and is accepted only when the
 * account's role is `admin` — the check is enforced again on every admin
 * endpoint server-side, so this is a UX gate, not the security boundary.
 */
import { apiClient, errorMessage, getToken, setToken } from "@/lib/api/client";
import type { ApiAuthResult, ApiUser } from "@/lib/api/types";
import { getJSON, setJSON } from "../lib/storage";

export interface AdminSession {
  email: string;
  name: string;
  loggedInAt: number;
}

const KEY = "vielinea_admin_session";

export const adminAuth = {
  current(): AdminSession | null {
    return getJSON<AdminSession | null>(KEY, null);
  },

  /**
   * Synchronous because the route guard calls it during render. It reflects the
   * last verified sign-in; `verify()` re-checks against the API.
   */
  isAuthed(): boolean {
    return Boolean(getJSON<AdminSession | null>(KEY, null)) && Boolean(getToken());
  },

  async login(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const result = await apiClient.post<ApiAuthResult>("/auth/login", { email, password });

      if (result.user.role !== "admin") {
        return { ok: false, error: "That account does not have administrator access." };
      }

      setToken(result.token);
      setJSON<AdminSession>(KEY, {
        email: result.user.email,
        name: result.user.name,
        loggedInAt: Date.now(),
      });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: errorMessage(error, "Could not sign in") };
    }
  },

  /** Confirms the stored session still corresponds to a live admin token. */
  async verify(): Promise<boolean> {
    if (!getToken()) return false;
    try {
      const { user } = await apiClient.get<{ user: ApiUser }>("/auth/me");
      if (user.role !== "admin") {
        this.logout();
        return false;
      }
      setJSON<AdminSession>(KEY, {
        email: user.email,
        name: user.name,
        loggedInAt: this.current()?.loggedInAt ?? Date.now(),
      });
      return true;
    } catch {
      this.logout();
      return false;
    }
  },

  logout(): void {
    void apiClient.post("/auth/logout").catch(() => {
      // Clearing local state matters more than the server acknowledging.
    });
    setToken(null);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(KEY);
      window.dispatchEvent(new CustomEvent("admin:storage", { detail: { key: KEY } }));
    }
  },
};

export const ADMIN_SESSION_KEY = KEY;
