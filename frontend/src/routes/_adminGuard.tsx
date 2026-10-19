import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { adminAuth } from "@/admin/services/admin-auth";
import { AdminShell } from "@/admin/components/admin-shell";

export const Route = createFileRoute("/_adminGuard")({
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  component: AdminGuard,
});

function AdminGuard() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // The stored session is only a hint. Confirm with the API that the token is
    // still valid and still belongs to an admin before rendering anything —
    // and note every admin endpoint enforces this again server-side.
    if (!adminAuth.isAuthed()) {
      navigate({ to: "/admin/login" });
      return;
    }
    let cancelled = false;
    void adminAuth.verify().then((ok) => {
      if (cancelled) return;
      if (ok) setReady(true);
      else navigate({ to: "/admin/login" });
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground text-sm">
        Loading admin...
      </div>
    );
  }
  return (
    <AdminShell>
      <Outlet />
    </AdminShell>
  );
}
