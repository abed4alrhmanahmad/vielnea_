import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/admin/components/admin-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminAccountCards } from "@/admin/components/admin-account-cards";
import { changedFields } from "@/admin/lib/changed-fields";
import { adminAuth } from "@/admin/services/admin-auth";
import {
  useSettingsQuery,
  settingsService,
  usePaymentMethodSettings,
  paymentMethodsService,
  type StoreSettings,
} from "@/admin/services/misc";
import { toast } from "sonner";

export const Route = createFileRoute("/_adminGuard/admin/settings")({
  head: () => ({
    meta: [{ title: "Settings — Vielinea Admin" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminSettingsPage,
});

/**
 * One labelled field. Defined at module level: declared inside the page it was
 * a new component type on every render, so React remounted the input after
 * each keystroke and focus was lost after one character.
 */
function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function AdminSettingsPage() {
  const { data, isPending, isError } = useSettingsQuery();
  if (isPending || !data) {
    return (
      <div>
        <PageHeader
          title="Settings"
          description={
            isError ? "Could not load the settings. Refresh to try again." : "Loading settings…"
          }
        />
        {!isError && <Skeleton className="h-64 w-full" />}
      </div>
    );
  }
  // Mounted only once the saved values are here, so the form starts from them.
  return <SettingsForm initial={data} />;
}

function SettingsForm({ initial }: { initial: StoreSettings }) {
  const payments = usePaymentMethodSettings();
  const [d, setD] = useState<StoreSettings>(initial);
  // What the server last confirmed. Save sends only the fields that differ
  // from it, so this form never writes back a value it merely loaded.
  const [saved, setSaved] = useState<StoreSettings>(initial);
  const [busy, setBusy] = useState(false);

  async function save() {
    const changes = changedFields(saved, d);
    setBusy(true);
    // save() raises its own success / failure / "no changes" toast.
    const ok = await settingsService.save(changes);
    setBusy(false);
    if (ok) setSaved(d);
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        actions={
          <Button onClick={() => void save()} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        }
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="p-6 space-y-3">
            <h3 className="font-display mb-2">Store</h3>
            <Field
              label="Store name"
              value={d.storeName}
              onChange={(v) => setD((prev) => ({ ...prev, storeName: v }))}
            />
            <Field
              label="Currency"
              value={d.currency}
              onChange={(v) => setD((prev) => ({ ...prev, currency: v.toUpperCase() }))}
            />
            <p className="text-xs text-muted-foreground">
              Saved for the store record. The storefront does not display these two yet: prices are
              shown in $, and the footer copyright is edited under Site Content → Footer.
            </p>
            <p className="text-xs text-muted-foreground">
              Customer-facing email, phone and address are edited under{" "}
              <Link to="/admin/content" className="text-primary hover:underline">
                Site Content → Contact
              </Link>
              ; social links under Site Content → Footer.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 space-y-3">
            <h3 className="font-display mb-2">Shipping</h3>
            <Field
              label="Standard shipping"
              type="number"
              value={d.standardShipping}
              onChange={(v) => setD((prev) => ({ ...prev, standardShipping: Number(v) }))}
            />
            <p className="text-xs text-muted-foreground">
              Charged on every order by the cart and checkout.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 space-y-3">
            <h3 className="font-display mb-2">Payment Methods</h3>
            {/* Each switch saves immediately; the server enforces it at checkout. */}
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="pay-card">Visa / Card</Label>
                <p className="text-xs text-muted-foreground">Paid now, at checkout</p>
              </div>
              <Switch
                id="pay-card"
                checked={payments.cardEnabled}
                disabled={!payments.loaded}
                onCheckedChange={(on) =>
                  paymentMethodsService.save({ cardEnabled: on, codEnabled: payments.codEnabled })
                }
              />
            </div>
            {payments.loaded && payments.cardEnabled && !payments.cardReady && (
              <p className="text-xs text-destructive">
                No live card processor is connected, so card stays hidden at checkout until one is
                configured.
              </p>
            )}
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="pay-cod">Cash on Delivery</Label>
                <p className="text-xs text-muted-foreground">Pay the courier when it arrives</p>
              </div>
              <Switch
                id="pay-cod"
                checked={payments.codEnabled}
                disabled={!payments.loaded}
                onCheckedChange={(on) =>
                  paymentMethodsService.save({ cardEnabled: payments.cardEnabled, codEnabled: on })
                }
              />
            </div>
            {payments.loaded &&
              !payments.codEnabled &&
              (!payments.cardEnabled || !payments.cardReady) && (
                <p className="text-xs text-destructive">
                  No payment method is available, so customers cannot check out.
                </p>
              )}
          </CardContent>
        </Card>
        <AdminProfileCard />
        <AdminAccountCards />
      </div>
    </div>
  );
}

/**
 * The signed-in admin's display name, saved to their account. (These fields
 * used to sit in the store form, where Save ignored them.) The sign-in email
 * is changed in its own card below, which re-checks the password.
 */
function AdminProfileCard() {
  const [name, setName] = useState(adminAuth.current()?.name ?? "");
  const [busy, setBusy] = useState(false);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (name.trim().length < 2) {
      toast.error("Name must be at least 2 characters");
      return;
    }
    setBusy(true);
    const result = await adminAuth.changeName(name.trim());
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error ?? "Could not change the name");
      return;
    }
    setName(result.name ?? name.trim());
    toast.success("Name updated");
  }
  return (
    <Card>
      <CardContent className="p-6">
        <form onSubmit={save} className="space-y-3" noValidate>
          <h3 className="font-display mb-2">Admin profile</h3>
          <Field label="Name" value={name} onChange={setName} />
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save name"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
