import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/admin/components/admin-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  useSettings,
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

function AdminSettingsPage() {
  const s = useSettings();
  const payments = usePaymentMethodSettings();
  const [d, setD] = useState<StoreSettings>(s);
  const upd = (k: keyof StoreSettings, v: string | number) => setD({ ...d, [k]: v });
  const F = ({
    label,
    k,
    type = "text",
  }: {
    label: string;
    k: keyof StoreSettings;
    type?: string;
  }) => (
    <div>
      <Label>{label}</Label>
      <Input
        type={type}
        value={d[k] as string | number}
        onChange={(e) => upd(k, type === "number" ? +e.target.value : e.target.value)}
      />
    </div>
  );
  return (
    <div>
      <PageHeader
        title="Settings"
        actions={
          <Button
            onClick={() => {
              settingsService.save(d);
              toast.success("Saved");
            }}
          >
            Save
          </Button>
        }
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="p-6 space-y-3">
            <h3 className="font-display mb-2">Store</h3>
            <F label="Store name" k="storeName" />
            <F label="Email" k="storeEmail" />
            <F label="Phone" k="storePhone" />
            <F label="Address" k="storeAddress" />
            <F label="Currency" k="currency" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 space-y-3">
            <h3 className="font-display mb-2">Shipping</h3>
            <F label="Standard shipping" k="standardShipping" type="number" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 space-y-3">
            <h3 className="font-display mb-2">Social</h3>
            <F label="Instagram" k="socialInstagram" />
            <F label="Facebook" k="socialFacebook" />
            <F label="Twitter" k="socialTwitter" />
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
        <Card>
          <CardContent className="p-6 space-y-3">
            <h3 className="font-display mb-2">Admin profile</h3>
            <F label="Name" k="adminName" />
            <F label="Email" k="adminEmail" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
