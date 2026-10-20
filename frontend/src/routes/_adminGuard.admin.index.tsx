import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { ShoppingBag, Users, Package, DollarSign, AlertTriangle, Clock } from "lucide-react";
import { PageHeader } from "@/admin/components/admin-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAdminProducts } from "@/admin/services/products-admin";
import { useOrders } from "@/admin/services/orders";
import { useCustomers } from "@/admin/services/customers";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  BarChart,
  Bar,
} from "recharts";

export const Route = createFileRoute("/_adminGuard/admin/")({
  head: () => ({
    meta: [{ title: "Dashboard — Vielinea Admin" }, { name: "robots", content: "noindex" }],
  }),
  component: DashboardPage,
});

function fmt(n: number) {
  return n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function DashboardPage() {
  const products = useAdminProducts();
  const orders = useOrders();
  const customers = useCustomers();

  const totals = useMemo(() => {
    const delivered = orders.filter((o) => o.status !== "cancelled");
    return {
      revenue: delivered.reduce((s, o) => s + o.total, 0),
      orders: orders.length,
      customers: customers.length,
      products: products.length,
      pending: orders.filter((o) => o.status === "pending").length,
      lowStock: products.filter((p) => p.stock > 0 && p.stock <= 5).length,
    };
  }, [orders, customers, products]);

  const revenueByDay = useMemo(() => {
    const buckets = new Map<string, number>();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const k = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      buckets.set(k, 0);
    }
    for (const o of orders) {
      if (o.status === "cancelled") continue;
      const d = new Date(o.createdAt);
      const k = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      if (buckets.has(k)) buckets.set(k, (buckets.get(k) ?? 0) + o.total);
    }
    return Array.from(buckets, ([date, revenue]) => ({ date, revenue: Math.round(revenue) }));
  }, [orders]);

  const bestSellers = useMemo(() => {
    const counts = new Map<string, { qty: number; title: string }>();
    for (const o of orders)
      for (const it of o.items) {
        const cur = counts.get(it.productId) ?? { qty: 0, title: it.title };
        cur.qty += it.quantity;
        counts.set(it.productId, cur);
      }
    return Array.from(counts, ([productId, v]) => ({ productId, ...v }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
  }, [orders]);

  const kpis = [
    { label: "Revenue", value: fmt(totals.revenue), icon: DollarSign },
    { label: "Orders", value: totals.orders, icon: ShoppingBag },
    { label: "Customers", value: totals.customers, icon: Users },
    { label: "Products", value: totals.products, icon: Package },
    { label: "Pending Orders", value: totals.pending, icon: Clock },
    { label: "Low Stock", value: totals.lowStock, icon: AlertTriangle },
  ];

  return (
    <div>
      <PageHeader title="Dashboard" description="At-a-glance store performance" />
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6 mb-6">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-widest text-muted-foreground">{k.label}</p>
                <k.icon className="size-4 text-primary" />
              </div>
              <p className="mt-2 font-display text-2xl">{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg">Revenue — last 14 days</h3>
            </div>
            <ChartContainer
              config={{ revenue: { label: "Revenue", color: "hsl(var(--primary))" } }}
              className="h-64 w-full aspect-auto"
            >
              <AreaChart data={revenueByDay}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="var(--color-revenue)"
                  fill="var(--color-revenue)"
                  fillOpacity={0.2}
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <h3 className="font-display text-lg mb-4">Best Sellers</h3>
            <ChartContainer
              config={{ qty: { label: "Units sold", color: "hsl(var(--primary))" } }}
              className="h-64 w-full aspect-auto"
            >
              <BarChart data={bestSellers} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="title" type="category" tick={{ fontSize: 10 }} width={110} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="qty" fill="var(--color-qty)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-lg">Recent Orders</h3>
            <Link
              to="/admin/orders"
              className="text-xs uppercase tracking-widest text-primary hover:underline"
            >
              View all
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-widest text-muted-foreground border-b border-border">
                  <th className="py-2">Order</th>
                  <th>Customer</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Placed</th>
                </tr>
              </thead>
              <tbody>
                {orders.slice(0, 6).map((o) => (
                  <tr key={o.id} className="border-b border-border/60 last:border-b-0">
                    <td className="py-3 font-mono text-xs">{o.id}</td>
                    <td>{o.customerName}</td>
                    <td>{fmt(o.total)}</td>
                    <td>
                      <Badge
                        variant={
                          o.status === "cancelled"
                            ? "destructive"
                            : o.status === "delivered"
                              ? "default"
                              : "secondary"
                        }
                      >
                        {o.status}
                      </Badge>
                    </td>
                    <td className="text-muted-foreground">
                      {new Date(o.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
