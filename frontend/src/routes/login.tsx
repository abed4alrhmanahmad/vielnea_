import { useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Shell } from "@/components/layout/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStore } from "@/contexts/store-context";
import { safeRedirect } from "@/lib/safe-redirect";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "At least 6 characters"),
});

export const Route = createFileRoute("/login")({
  // Set by the account guard so signing in returns you where you were headed.
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => {
    const value = search["redirect"];
    return typeof value === "string" ? { redirect: value } : {};
  },
  head: () => ({
    meta: [
      { title: "Sign In — Vielinea" },
      { name: "description", content: "Sign in to your Vielinea account." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { login, isAuthenticated, authReady } = useStore();
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  const destination = safeRedirect(redirect);

  // Nothing to do here if the session is already valid.
  useEffect(() => {
    if (authReady && isAuthenticated) {
      void navigate({ to: destination as never, replace: true });
    }
  }, [authReady, isAuthenticated, destination, navigate]);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: "demo@vielinea.com", password: "123456" },
  });

  return (
    <Shell>
      <div className="container-luxe py-20 grid md:grid-cols-2 gap-12 max-w-5xl mx-auto">
        <div className="hidden md:block">
          <h1 className="font-display text-4xl md:text-5xl">Welcome back</h1>
          <p className="mt-4 text-muted-foreground leading-relaxed">
            Sign in to see your saved pieces, orders and private previews.
          </p>
          <p className="mt-8 text-xs uppercase tracking-[0.2em] text-primary">Demo access</p>
          <p className="text-sm text-muted-foreground mt-2">demo@vielinea.com · 123456</p>
        </div>
        <div className="bg-card border border-border p-8 rounded">
          <h2 className="font-display text-2xl mb-6">Sign In</h2>
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit(async (v) => {
              const ok = await login(v.email, v.password);
              if (ok) void navigate({ to: destination as never, replace: true });
            })}
          >
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...form.register("email")} />
              {form.formState.errors.email && (
                <p className="text-xs text-destructive mt-1">
                  {form.formState.errors.email.message}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" {...form.register("password")} />
              {form.formState.errors.password && (
                <p className="text-xs text-destructive mt-1">
                  {form.formState.errors.password.message}
                </p>
              )}
            </div>
            <Button
              type="submit"
              className="w-full h-11 uppercase tracking-[0.2em] text-xs"
              disabled={form.formState.isSubmitting}
            >
              Login
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Don't have an account?{" "}
              <Link
                to="/register"
                search={redirect ? { redirect } : {}}
                className="text-primary hover:underline"
              >
                Sign up
              </Link>
            </p>
          </form>
        </div>
      </div>
    </Shell>
  );
}
