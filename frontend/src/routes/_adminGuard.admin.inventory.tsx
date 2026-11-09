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
import {
  useAdminProducts,
  productsService,
  type AdminProduct,
} from "@/admin/services/products-admin";

export const Route = createFileRoute("/_adminGuard/admin/inventory")({
  head: () => ({
    meta: [{ title: "Inventory — Vielinea Admin" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminInventoryPage,
});

/**
 * Stock for one product. Sized products are stocked per size — checkout sells
 * min(size stock, product stock), so raising only the total never made a
 * sold-out size buyable again. Saves on blur, and only when a value changed.
 */
function StockEditor({ product }: { product: AdminProduct }) {
  const sizes = product.sizes;
  if (sizes.length === 0) {
    return (
      <Input
        type="number"
        min={0}
        className="w-24 h-8"
        defaultValue={product.stock}
        aria-label={`Stock for ${product.title}`}
        onBlur={(e) => {
          const next = Number(e.target.value);
          if (e.target.value === "" || next === product.stock) return;
          productsService.update(product.id, { stock: next });
        }}
      />
    );
  }
  const current = (s: string) => product.sizeStock?.[s] ?? 0;
  return (
    <div className="flex flex-wrap gap-1.5 py-2">
      {sizes.map((s) => (
        <label key={s} className="flex items-center gap-1 text-xs text-muted-foreground">
          {s}
          <Input
            type="number"
            min={0}
            className="w-16 h-8"
            defaultValue={current(s)}
            aria-label={`Stock for ${product.title}, size ${s}`}
            onBlur={(e) => {
              const next = Number(e.target.value);
              if (e.target.value === "" || next === current(s)) return;
              const sizeStock = Object.fromEntries(
                sizes.map((x) => [x, x === s ? next : current(x)]),
              );
              productsService.update(product.id, {
                sizes,
                sizeStock,
                stock: Object.values(sizeStock).reduce((a, b) => a + b, 0),
              });
            }}
          />
        </label>
      ))}
    </div>
  );
}

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
                  <td className="capitalize">{p.categoryLabel || p.category}</td>
                  <td>
                    <StockEditor
                      key={`${p.id}:${p.stock}:${JSON.stringify(p.sizeStock)}`}
                      product={p}
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
