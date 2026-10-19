/**
 * Gate for customer-only pages.
 *
 * Uses the existing StoreProvider session — no second auth system. It waits for
 * `authReady` so a page refresh does not bounce a signed-in customer to /login
 * while the token is still being verified, then redirects with the current path
 * in `redirect` so signing in returns them where they were headed.
 *
 * This is a convenience, not the security boundary: every customer endpoint
 * enforces the same rule server-side from the JWT.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useStore } from "@/contexts/store-context";
import { ErrorPanel } from "@/components/account/error-panel";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, authReady, authUnavailable, retryAuth } = useStore();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // The page the shopper actually asked for, frozen at mount. Reading it live
  // would capture "/login" instead: navigation is asynchronous, so this
  // component re-renders with the new location before it unmounts.
  const requested = useRef(pathname);
  // Distinguishes "you need to sign in" from "you just signed out".
  const wasSignedIn = useRef(false);

  useEffect(() => {
    if (isAuthenticated) wasSignedIn.current = true;
  }, [isAuthenticated]);

  useEffect(() => {
    if (!authReady || isAuthenticated) return;
    // The server could not confirm the session. That is not a sign-out — the
    // token is still held, so keep the shopper here and offer a retry rather
    // than sending them to a login screen they do not need.
    if (authUnavailable) return;
    if (wasSignedIn.current) {
      // Signing out from inside the account area should land on the
      // storefront, not on a login screen demanding the session back.
      void navigate({ to: "/", replace: true });
      return;
    }
    void navigate({ to: "/login", search: { redirect: requested.current }, replace: true });
  }, [authReady, isAuthenticated, authUnavailable, navigate]);

  if (authUnavailable && !isAuthenticated) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <div className="w-full max-w-md">
          <ErrorPanel
            message="We couldn't reach Vielinea to confirm your session. Check your connection and try again — you are still signed in."
            onRetry={retryAuth}
          />
        </div>
      </div>
    );
  }

  if (!authReady || !isAuthenticated) {
    return (
      <div
        className="min-h-[50vh] flex items-center justify-center text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="size-5 animate-spin" />
        <span className="sr-only">Checking your session</span>
      </div>
    );
  }

  return <>{children}</>;
}
