import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, Eye } from "lucide-react";
import { PageHeader } from "@/admin/components/admin-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useOrders, ordersService, type Order, type OrderStatus } from "@/admin/services/orders";
import { paymentMethodLabel, paymentStatusLabel, type PaymentStatus } from "@/lib/payment";
import { toast } from "sonner";

export const Route = createFileRoute("/_adminGuard/admin/orders")({
  head: () => ({
    meta: [{ title: "Orders — Vielinea Admin" }, { name: "robots", content: "noindex" }],
  }),
  component: OrdersPage,
});

// Every status the database accepts, so an order can be moved through the
// whole lifecycle and the customer sees the same value the admin selected.
const STATUSES: OrderStatus[] = [
  "pending",
  "paid",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
];

function OrdersPage() {
  const orders = useOrders();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Order | null>(null);
  const rows = useMemo(
    () =>
      orders.filter((o) => {
        if (filter !== "all" && o.status !== filter) return false;
        // The order number is what a customer quotes, so it has to be
        // searchable here — the internal uuid is kept as a fallback.
        if (
          query.trim() &&
          !`${o.orderNumber} ${o.id} ${o.customerName} ${o.customerEmail}`
            .toLowerCase()
            .includes(query.toLowerCase())
        )
          return false;
        return true;
      }),
    [orders, query, filter],
  );
  return (
    <div>
      <PageHeader title="Orders" description={`${orders.length} orders`} />
      <Card className="mb-4">
        <CardContent className="p-4 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-64">
            <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
            <Input
              placeholder="Search by order number or customer"
              className="pl-8"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-widest text-muted-foreground border-b border-border">
                <th className="p-3">Order</th>
                <th>Customer</th>
                <th>Items</th>
                <th>Total</th>
                <th>Payment</th>
                <th>Status</th>
                <th>Placed</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className="border-b border-border/60 last:border-b-0">
                  {/* The order number, not the uuid — this is the reference
                      the customer sees on their account and quotes to support. */}
                  <td className="p-3 font-mono text-xs">{o.orderNumber}</td>
                  <td>
                    <div>{o.customerName}</div>
                    <div className="text-xs text-muted-foreground">{o.customerEmail}</div>
                  </td>
                  <td>{o.items.reduce((s, i) => s + i.quantity, 0)}</td>
                  <td>${o.total.toFixed(2)}</td>
                  {/* Cash on Delivery orders arrive unpaid, so the method and
                      the money's whereabouts both belong in the list — an
                      admin should not have to open a row to spot one. */}
                  <td>
                    <div className="text-xs">{paymentMethodLabel(o.paymentMethod)}</div>
                    <Select
                      value={o.paymentStatus}
                      onValueChange={(v) => {
                        ordersService.updatePaymentStatus(o.id, v as PaymentStatus);
                      }}
                    >
                      <SelectTrigger className="w-28 h-8 mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="paid">Paid</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td>
                    <Select
                      value={o.status}
                      onValueChange={(v) => {
                        ordersService.updateStatus(o.id, v as OrderStatus);
                        toast.success("Updated");
                      }}
                    >
                      <SelectTrigger className="w-32 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="text-muted-foreground">
                    {new Date(o.createdAt).toLocaleDateString()}
                  </td>
                  <td className="text-right pr-3">
                    <Button size="sm" variant="ghost" onClick={() => setSelected(o)}>
                      <Eye className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {selected && (
        <Dialog open onOpenChange={(o) => !o && setSelected(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Order {selected.orderNumber}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">
                    Customer
                  </div>
                  <div>{selected.customerName}</div>
                  <div className="text-muted-foreground">{selected.customerEmail}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">
                    Shipping
                  </div>
                  <div>{selected.address}</div>
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
                  Items
                </div>
                <div className="border border-border rounded divide-y divide-border">
                  {selected.items.map((it, i) => (
                    <div key={i} className="p-3 flex justify-between">
                      <span>
                        {it.title}{" "}
                        <span className="text-muted-foreground text-xs">
                          · {it.size} × {it.quantity}
                        </span>
                      </span>
                      <span>${(it.price * it.quantity).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-between border-t border-border pt-3">
                <span>Subtotal</span>
                <span>${selected.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Shipping</span>
                <span>${selected.shipping.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span>Total</span>
                <span>${selected.total.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-3">
                <span>Payment method</span>
                <span>{paymentMethodLabel(selected.paymentMethod)}</span>
              </div>
              <div className="flex justify-between">
                <span>Payment status</span>
                <span>{paymentStatusLabel(selected.paymentStatus)}</span>
              </div>
              {selected.cardLast4 && (
                <div className="flex justify-between">
                  <span>Card</span>
                  <span>
                    {selected.cardBrand} •••• {selected.cardLast4}
                  </span>
                </div>
              )}
              {selected.paymentReference && (
                <div className="flex justify-between">
                  <span>Provider reference</span>
                  <span className="font-mono text-xs">{selected.paymentReference}</span>
                </div>
              )}
              <div className="pt-2 flex items-center gap-2">
                <Badge>{selected.status}</Badge>
                <Badge variant={selected.paymentStatus === "paid" ? "default" : "outline"}>
                  {paymentStatusLabel(selected.paymentStatus)}
                </Badge>
                {selected.paymentStatus === "pending" && (
                  <Button
                    size="sm"
                    className="ml-auto"
                    onClick={() => ordersService.updatePaymentStatus(selected.id, "paid")}
                  >
                    Mark paid
                  </Button>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
