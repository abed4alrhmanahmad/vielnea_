/**
 * Profile.
 *
 * Reads the signed-in user from the same session the whole app uses and writes
 * through PUT /api/auth/me and PUT /api/auth/password. Both endpoints take the
 * account id from the verified token, so there is no way to address another
 * customer from here.
 */
import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStore } from "@/contexts/store-context";
import { useChangePassword, useUpdateProfile } from "@/services/account";
import { errorMessage } from "@/lib/api/client";

export const Route = createFileRoute("/account/profile")({
  head: () => ({
    meta: [{ title: "Profile — Vielinea" }, { name: "robots", content: "noindex" }],
  }),
  component: ProfilePage,
});

const profileSchema = z.object({
  name: z.string().trim().min(2, "Enter your name"),
  email: z.string().trim().email("Enter a valid email"),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: z.string().min(6, "At least 6 characters"),
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  });

function ProfilePage() {
  const { user, logout } = useStore();
  const navigate = useNavigate();
  const updateProfile = useUpdateProfile();
  const changePassword = useChangePassword();

  const profileForm = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    values: { name: user?.name ?? "", email: user?.email ?? "" },
  });

  const passwordForm = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirm: "" },
  });

  // `values` keeps the form in step with the session once /auth/me resolves.
  useEffect(() => {
    if (user) profileForm.clearErrors();
  }, [user, profileForm]);

  return (
    <div className="space-y-8">
      <section>
        <h2 className="font-display text-2xl">Profile</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Your details, as they appear on your orders.
        </p>

        <form
          className="mt-6 border border-border rounded bg-card p-5 space-y-4"
          onSubmit={profileForm.handleSubmit(async (values) => {
            try {
              await updateProfile.mutateAsync(values);
              toast.success("Profile updated");
            } catch (error) {
              toast.error(errorMessage(error, "Could not update your profile"));
            }
          })}
        >
          <div>
            <Label htmlFor="name">Full name</Label>
            <Input id="name" {...profileForm.register("name")} />
            {profileForm.formState.errors.name && (
              <p className="text-xs text-destructive mt-1">
                {profileForm.formState.errors.name.message}
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" {...profileForm.register("email")} />
            {profileForm.formState.errors.email && (
              <p className="text-xs text-destructive mt-1">
                {profileForm.formState.errors.email.message}
              </p>
            )}
          </div>
          <Button
            type="submit"
            disabled={updateProfile.isPending}
            className="uppercase tracking-[0.2em] text-xs h-11"
          >
            {updateProfile.isPending ? "Saving…" : "Save changes"}
          </Button>
        </form>
      </section>

      <section>
        <h2 className="font-display text-2xl">Password</h2>
        <form
          className="mt-6 border border-border rounded bg-card p-5 space-y-4"
          onSubmit={passwordForm.handleSubmit(async (values) => {
            try {
              await changePassword.mutateAsync({
                currentPassword: values.currentPassword,
                newPassword: values.newPassword,
              });
              passwordForm.reset();
              toast.success("Password updated");
            } catch (error) {
              toast.error(errorMessage(error, "Could not update your password"));
            }
          })}
        >
          <div>
            <Label htmlFor="currentPassword">Current password</Label>
            <Input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              {...passwordForm.register("currentPassword")}
            />
            {passwordForm.formState.errors.currentPassword && (
              <p className="text-xs text-destructive mt-1">
                {passwordForm.formState.errors.currentPassword.message}
              </p>
            )}
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="newPassword">New password</Label>
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                {...passwordForm.register("newPassword")}
              />
              {passwordForm.formState.errors.newPassword && (
                <p className="text-xs text-destructive mt-1">
                  {passwordForm.formState.errors.newPassword.message}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="confirm">Confirm new password</Label>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                {...passwordForm.register("confirm")}
              />
              {passwordForm.formState.errors.confirm && (
                <p className="text-xs text-destructive mt-1">
                  {passwordForm.formState.errors.confirm.message}
                </p>
              )}
            </div>
          </div>
          <Button
            type="submit"
            disabled={changePassword.isPending}
            variant="outline"
            className="border-primary text-primary uppercase tracking-[0.2em] text-xs h-11"
          >
            {changePassword.isPending ? "Updating…" : "Update password"}
          </Button>
        </form>
      </section>

      <section className="border border-border rounded bg-card p-5">
        <h2 className="font-display text-xl">Sign out</h2>
        <p className="text-sm text-muted-foreground mt-1">
          You'll need to sign in again to see your orders and saved pieces.
        </p>
        <Button
          variant="outline"
          onClick={() => {
            logout();
            void navigate({ to: "/" });
          }}
          className="mt-4 uppercase tracking-[0.2em] text-xs"
        >
          <LogOut className="size-3.5" /> Logout
        </Button>
      </section>
    </div>
  );
}
