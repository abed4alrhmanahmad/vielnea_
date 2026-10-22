/**
 * Sign-in email and password for the signed-in administrator.
 *
 * Both call the existing /auth endpoints (the same account system customers
 * use); the server identifies the account from the token, re-checks the
 * current password, and applies the rules. Passwords live only in component
 * state for the moment of submission and are cleared afterwards.
 */
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { adminAuth } from "@/admin/services/admin-auth";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

function Message({ kind, children }: { kind: "error" | "success"; children: string }) {
  return (
    <p
      role={kind === "error" ? "alert" : "status"}
      className={`text-xs ${kind === "error" ? "text-destructive" : "text-primary"}`}
    >
      {children}
    </p>
  );
}

export function AdminAccountCards() {
  const [currentEmail, setCurrentEmail] = useState(adminAuth.current()?.email ?? "");
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailError, setEmailError] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  async function submitEmail(event: React.FormEvent) {
    event.preventDefault();
    setEmailError("");
    const email = newEmail.trim();
    if (!EMAIL_PATTERN.test(email)) return setEmailError("Enter a valid email address.");
    if (!emailPassword) return setEmailError("Enter your current password to confirm.");
    setEmailBusy(true);
    const result = await adminAuth.changeEmail(email, emailPassword);
    setEmailBusy(false);
    setEmailPassword("");
    if (!result.ok) return setEmailError(result.error ?? "Could not change the email.");
    setCurrentEmail(result.email ?? email);
    setNewEmail("");
    toast.success("Sign-in email updated");
  }

  async function submitPassword(event: React.FormEvent) {
    event.preventDefault();
    setPasswordError("");
    if (!currentPassword) return setPasswordError("Enter your current password.");
    if (newPassword.length < MIN_PASSWORD_LENGTH)
      return setPasswordError(
        `The new password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      );
    if (newPassword === currentPassword)
      return setPasswordError("Choose a password different from your current one.");
    if (newPassword !== confirmPassword) return setPasswordError("The new passwords do not match.");
    setPasswordBusy(true);
    const result = await adminAuth.changePassword(currentPassword, newPassword);
    setPasswordBusy(false);
    if (!result.ok) return setPasswordError(result.error ?? "Could not change the password.");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    toast.success("Password updated");
  }

  return (
    <>
      <Card>
        <CardContent className="p-6">
          <form onSubmit={submitEmail} className="space-y-3" noValidate>
            <h3 className="font-display mb-2">Sign-in email</h3>
            <p className="text-xs text-muted-foreground">
              Current: <span className="text-foreground break-all">{currentEmail || "—"}</span>
            </p>
            <div>
              <Label htmlFor="new-email">New email</Label>
              <Input
                id="new-email"
                type="email"
                autoComplete="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="email-password">Current password</Label>
              <Input
                id="email-password"
                type="password"
                autoComplete="current-password"
                value={emailPassword}
                onChange={(e) => setEmailPassword(e.target.value)}
              />
            </div>
            {emailError && <Message kind="error">{emailError}</Message>}
            <Button type="submit" disabled={emailBusy}>
              {emailBusy ? "Updating…" : "Update email"}
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-6">
          <form onSubmit={submitPassword} className="space-y-3" noValidate>
            <h3 className="font-display mb-2">Change password</h3>
            <div>
              <Label htmlFor="current-password">Current password</Label>
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                At least {MIN_PASSWORD_LENGTH} characters.
              </p>
            </div>
            <div>
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            {passwordError && <Message kind="error">{passwordError}</Message>}
            <Button type="submit" disabled={passwordBusy}>
              {passwordBusy ? "Updating…" : "Update password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
