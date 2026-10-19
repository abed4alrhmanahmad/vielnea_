import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { PageHeader } from "@/admin/components/admin-shell";
import { Card, CardContent } from "@/components/ui/card";
import { useOrders } from "@/admin/services/orders";
import { useAdminProducts } from "@/admin/services/products-admin";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/_adminGuard/admin/analytics")({
  head: () => ({
    meta: [{ title: "Analytics — Vielinea Admin" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminAnalyticsPage,
});

function AdminAnalyticsPage() {
  const orders = useOrders();
  const products = useAdminProducts();
  const daily = useMemo(() => {
    const buckets = new Map<string, number>();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      buckets.set(d.toLocaleDateString(undefined, { month: "short", day: "numeric" }), 0);
    }
    for (const o of orders) {
      if (o.status === "cancelled") continue;
      const k = new Date(o.createdAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
      if (buckets.has(k)) buckets.set(k, (buckets.get(k) ?? 0) + o.total);
    }
    return Array.from(buckets, ([date, revenue]) => ({ date, revenue: Math.round(revenue) }));
  }, [orders]);
  const productSales = useMemo(() => {
    const m = new Map<string, { title: string; qty: number }>();
    for (const o of orders)
      for (const it of o.items) {
        const cur = m.get(it.productId) ?? { title: it.title, qty: 0 };
        cur.qty += it.quantity;
        m.set(it.productId, cur);
      }
    return Array.from(m.values());
  }, [orders]);
  const top = productSales
    .slice()
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);
  const bottom = productSales
    .slice()
    .sort((a, b) => a.qty - b.qty)
    .slice(0, 5);
  const lowStock = products.filter((p) => p.stock <= 5);
  return (
    <div>
      <PageHeader title="Analytics" description="Sales, product and customer insights" />
      <Card className="mb-4">
        <CardContent className="p-4">
          <h3 className="font-display mb-3">Revenue — last 30 days</h3>
          <ChartContainer
            config={{ revenue: { label: "Revenue", color: "hsl(var(--primary))" } }}
            className="h-64 w-full"
          >
            <LineChart data={daily}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line dataKey="revenue" stroke="var(--color-revenue)" />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <h3 className="font-display mb-3">Top sellers</h3>
            <ChartContainer
              config={{ qty: { label: "Sold", color: "hsl(var(--primary))" } }}
              className="h-56 w-full"
            >
              <BarChart data={top} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="title" type="category" tick={{ fontSize: 10 }} width={110} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="qty" fill="var(--color-qty)" />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <h3 className="font-display mb-3">Slow movers</h3>
            <ul className="text-sm divide-y divide-border">
              {bottom.map((p) => (
                <li key={p.title} className="py-2 flex justify-between">
                  <span>{p.title}</span>
                  <span className="text-muted-foreground">{p.qty} sold</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardContent className="p-4">
            <h3 className="font-display mb-3">Low stock ({lowStock.length})</h3>
            <ul className="text-sm divide-y divide-border">
              {lowStock.map((p) => (
                <li key={p.id} className="py-2 flex justify-between">
                  <span>{p.title}</span>
                  <span className="text-muted-foreground">{p.stock} left</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
