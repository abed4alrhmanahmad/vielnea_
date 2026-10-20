import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/admin/components/admin-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAdminProducts, productsService } from "@/admin/services/products-admin";

export const Route = createFileRoute("/_adminGuard/admin/inventory")({
  head: () => ({
    meta: [{ title: "Inventory — Vielinea Admin" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminInventoryPage,
});

function AdminInventoryPage() {
  const products = useAdminProducts();
  const [filter, setFilter] = useState("all");
  const rows = useMemo(
    () =>
      products.filter(
        (p) =>
          filter === "all" ||
          (filter === "low" && p.stock > 0 && p.stock <= 5) ||
          (filter === "out" && p.stock === 0),
      ),
    [products, filter],
  );
  return (
    <div>
      <PageHeader
        title="Inventory"
        description={`${products.filter((p) => p.stock <= 5).length} products need attention`}
      />
      <Card className="mb-4">
        <CardContent className="p-4">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All products</SelectItem>
              <SelectItem value="low">Low stock (≤ 5)</SelectItem>
              <SelectItem value="out">Out of stock</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-widest text-muted-foreground border-b border-border">
                <th className="p-3">Product</th>
                <th>Category</th>
                <th>Stock</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-b border-border/60 last:border-b-0">
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      {p.images[0] ? (
                        <img
                          src={p.images[0]}
                          alt=""
                          className="size-10 shrink-0 object-cover rounded"
                        />
                      ) : (
                        // Products saved without images: an empty tile, not a broken image.
                        <div className="size-10 shrink-0 rounded bg-secondary" aria-hidden />
                      )}
                      <span>{p.title}</span>
                    </div>
                  </td>
                  <td className="capitalize">{p.category}</td>
                  <td>
                    <Input
                      type="number"
                      className="w-24 h-8"
                      defaultValue={p.stock}
                      onBlur={(e) => productsService.update(p.id, { stock: +e.target.value })}
                    />
                  </td>
                  <td>
                    <Badge
                      variant={
                        p.stock === 0 ? "destructive" : p.stock <= 5 ? "secondary" : "outline"
                      }
                    >
                      {p.stock === 0 ? "Out" : p.stock <= 5 ? "Low" : "OK"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
