import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adminAuth } from "@/admin/services/admin-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/login")({
  head: () => ({
    meta: [{ title: "Admin Sign In — Vielinea" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminLoginPage,
});

function AdminLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (adminAuth.isAuthed()) navigate({ to: "/admin" });
  }, [navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await adminAuth.login(email, password);
    setBusy(false);
    if (res.ok) {
      toast.success("Welcome, admin");
      navigate({ to: "/admin" });
    } else toast.error(res.error ?? "Sign in failed");
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mx-auto size-14 rounded bg-primary text-primary-foreground flex items-center justify-center font-display text-xl mb-4">
            V
          </div>
          <h1 className="font-display text-3xl">Vielinea Admin</h1>
          <p className="mt-2 text-sm text-muted-foreground">Sign in to manage the store</p>
        </div>
        <form onSubmit={onSubmit} className="bg-card border border-border rounded p-8 space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button
            type="submit"
            className="w-full h-11 uppercase tracking-[0.2em] text-xs"
            disabled={busy}
          >
            {busy ? "Signing in..." : "Sign In"}
          </Button>
        </form>
        <p className="mt-6 text-center text-xs">
          <Link to="/" className="text-muted-foreground hover:text-primary">
            ← Back to storefront
          </Link>
        </p>
      </div>
    </div>
  );
}
