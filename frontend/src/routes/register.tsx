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

const schema = z
  .object({
    name: z.string().min(2, "Enter your name"),
    email: z.string().email("Enter a valid email"),
    password: z.string().min(6, "At least 6 characters"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  });

export const Route = createFileRoute("/register")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => {
    const value = search["redirect"];
    return typeof value === "string" ? { redirect: value } : {};
  },
  head: () => ({
    meta: [
      { title: "Create Account — Vielinea" },
      { name: "description", content: "Create your Vielinea account." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RegisterPage,
});

function RegisterPage() {
  const { register, isAuthenticated, authReady } = useStore();
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  const destination = safeRedirect(redirect);

  useEffect(() => {
    if (authReady && isAuthenticated) {
      void navigate({ to: destination as never, replace: true });
    }
  }, [authReady, isAuthenticated, destination, navigate]);

  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  return (
    <Shell>
      <div className="container-luxe py-20 max-w-md mx-auto">
        <h1 className="font-display text-4xl text-center">Create Account</h1>
        <p className="text-center text-muted-foreground mt-3">Join the Vielinea circle</p>
        <form
          className="mt-10 space-y-4 bg-card border border-border p-8 rounded"
          onSubmit={form.handleSubmit(async (v) => {
            const ok = await register(v.name, v.email, v.password);
            if (ok) void navigate({ to: destination as never, replace: true });
          })}
        >
          <div>
            <Label htmlFor="name">Full Name</Label>
            <Input id="name" {...form.register("name")} />
            {form.formState.errors.name && (
              <p className="text-xs text-destructive mt-1">{form.formState.errors.name.message}</p>
            )}
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" {...form.register("email")} />
            {form.formState.errors.email && (
              <p className="text-xs text-destructive mt-1">{form.formState.errors.email.message}</p>
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
          <div>
            <Label htmlFor="confirm">Confirm Password</Label>
            <Input id="confirm" type="password" {...form.register("confirm")} />
            {form.formState.errors.confirm && (
              <p className="text-xs text-destructive mt-1">
                {form.formState.errors.confirm.message}
              </p>
            )}
          </div>
          <Button
            type="submit"
            className="w-full h-11 uppercase tracking-[0.2em] text-xs"
            disabled={form.formState.isSubmitting}
          >
            Create Account
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link
              to="/login"
              search={redirect ? { redirect } : {}}
              className="text-primary hover:underline"
            >
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </Shell>
  );
}
