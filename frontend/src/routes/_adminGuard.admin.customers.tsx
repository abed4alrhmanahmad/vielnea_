import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, Eye } from "lucide-react";
import { PageHeader } from "@/admin/components/admin-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCustomers, useCustomerOrders, type AdminCustomer } from "@/admin/services/customers";

export const Route = createFileRoute("/_adminGuard/admin/customers")({
  head: () => ({
    meta: [{ title: "Customers — Vielinea Admin" }, { name: "robots", content: "noindex" }],
  }),
  component: CustomersPage,
});

function CustomersPage() {
  const customers = useCustomers();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AdminCustomer | null>(null);
  const rows = useMemo(
    () =>
      customers.filter(
        (c) => !query || `${c.name} ${c.email}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [customers, query],
  );
  return (
    <div>
      <PageHeader title="Customers" description={`${customers.length} customers`} />
      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
            <Input
              placeholder="Search customers"
              className="pl-8"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-widest text-muted-foreground border-b border-border">
                <th className="p-3">Name</th>
                <th>Email</th>
                <th>Orders</th>
                <th>Total spent</th>
                <th>Last order</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-b border-border/60 last:border-b-0">
                  <td className="p-3 font-medium">{c.name}</td>
                  <td className="text-muted-foreground">{c.email}</td>
                  <td>{c.ordersCount}</td>
                  <td>${c.totalSpent.toFixed(0)}</td>
                  <td className="text-muted-foreground">
                    {c.lastOrderAt ? new Date(c.lastOrderAt).toLocaleDateString() : "—"}
                  </td>
                  <td className="text-right pr-3">
                    <Button size="sm" variant="ghost" onClick={() => setSelected(c)}>
                      <Eye className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      {selected && <CustomerDetail customer={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function CustomerDetail({ customer, onClose }: { customer: AdminCustomer; onClose: () => void }) {
  const orders = useCustomerOrders(customer.id);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{customer.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Email</div>
              <div>{customer.email}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Orders</div>
              <div>{customer.ordersCount}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">
                Total spent
              </div>
              <div>${customer.totalSpent.toFixed(2)}</div>
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
              Order history
            </div>
            <div className="border border-border rounded divide-y divide-border max-h-64 overflow-y-auto">
              {orders.map((o) => (
                <div key={o.id} className="p-3 flex justify-between text-sm">
                  <span className="font-mono text-xs">{o.id}</span>
                  <span>${o.total.toFixed(2)}</span>
                  <span className="text-muted-foreground">{o.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
