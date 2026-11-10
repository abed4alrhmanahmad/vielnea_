/**
 * Regression tests for the admin de-duplication cleanup.
 *
 * Pure logic + source-level guards only: nothing here talks to an API or a
 * database. Run from frontend/ with:
 *
 *   ../backend/node_modules/.bin/tsx --test tests/admin-dedupe.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  LOW_STOCK_THRESHOLD,
  isLowStock,
  isOutOfStock,
  needsRestock,
  sizeChangePayload,
  stockLevel,
} from "../src/admin/lib/stock.ts";
import { statusConflict, type OrderStatusValue } from "../src/admin/lib/order-status.ts";
import { changedFields } from "../src/admin/lib/changed-fields.ts";

const src = (path: string) =>
  readFileSync(fileURLToPath(new URL(`../src/${path}`, import.meta.url)), "utf8");

// ---------------------------------------------------------------- B6 -------
test("stock levels: 0 is out, 1–5 is low, 6+ is ok (matches the server's stats)", () => {
  assert.equal(LOW_STOCK_THRESHOLD, 5);
  assert.equal(stockLevel(0), "out");
  assert.equal(stockLevel(-1), "out");
  assert.equal(stockLevel(1), "low");
  assert.equal(stockLevel(5), "low");
  assert.equal(stockLevel(6), "ok");
  assert.equal(isLowStock(0), false, "sold out is not 'low'");
  assert.equal(isOutOfStock(0), true);
  assert.equal(needsRestock(0), true);
  assert.equal(needsRestock(5), true);
  assert.equal(needsRestock(6), false);
});

test("every admin screen uses the shared stock rule, not its own literal", () => {
  for (const file of [
    "routes/_adminGuard.admin.index.tsx",
    "routes/_adminGuard.admin.inventory.tsx",
    "routes/_adminGuard.admin.analytics.tsx",
    "routes/_adminGuard.admin.products.tsx",
  ]) {
    const code = src(file);
    assert.match(code, /@\/admin\/lib\/stock/, `${file} imports the shared rule`);
    assert.doesNotMatch(
      code,
      /stock\s*<=\s*5|stock\s*===\s*0/,
      `${file} has no hand-written threshold`,
    );
  }
});

// ---------------------------------------------------------------- A5 -------
test("product edit: an unchanged size list sends no size or stock at all", () => {
  assert.equal(sizeChangePayload(["S", "M"], ["S", "M"], { S: 99, M: 99 }), null);
  assert.equal(sizeChangePayload([], [], {}), null);
});

test("product edit: a changed size list keeps each size's CURRENT stock; new sizes start at 0", () => {
  // Fresh server values, not the dialog's snapshot: Inventory set S to 7.
  const out = sizeChangePayload(["S", "M"], ["S", "M", "L"], { S: 7, M: 2 });
  assert.deepEqual(out, { sizes: ["S", "M", "L"], sizeStock: { S: 7, M: 2, L: 0 }, stock: 9 });
});

test("product edit: removing a size drops its stock from the total", () => {
  assert.deepEqual(sizeChangePayload(["S", "M"], ["M"], { S: 7, M: 2 }), {
    sizes: ["M"],
    sizeStock: { M: 2 },
    stock: 2,
  });
});

test("product edit: reordering sizes counts as a change and preserves stock", () => {
  assert.deepEqual(sizeChangePayload(["S", "M"], ["M", "S"], { S: 1, M: 2 }), {
    sizes: ["M", "S"],
    sizeStock: { M: 2, S: 1 },
    stock: 3,
  });
});

test("product edit: emptying the size list sends no stock (stored total kept)", () => {
  const out = sizeChangePayload(["S"], [], { S: 4 });
  assert.deepEqual(out, { sizes: [], sizeStock: {} });
  assert.equal(out && "stock" in out, false);
});

test("Products edit dialog no longer sends the stock it read when it opened", () => {
  const code = src("routes/_adminGuard.admin.products.tsx");
  assert.match(code, /stock: _stock,\s*sizeStock: _sizeStock,\s*sizes: _sizes/);
  assert.match(code, /productsService\.fetch\(\)/, "fresh stock is read before rewriting sizes");
  assert.match(code, /Stock is managed under/);
});

// ---------------------------------------------------------------- B4 -------
test("order status vs payment status: only paid/pending contradicts itself", () => {
  const statuses: OrderStatusValue[] = [
    "pending",
    "paid",
    "processing",
    "shipped",
    "delivered",
    "cancelled",
  ];
  const conflicts: string[] = [];
  for (const s of statuses)
    for (const p of ["pending", "paid"] as const)
      if (statusConflict(s, p)) conflicts.push(`${s}/${p}`);
  assert.deepEqual(conflicts, ["paid/pending"]);
  // Normal lifecycles stay valid: card orders start paid/paid, COD pending/pending
  // and ship or deliver before the cash is settled.
  assert.equal(statusConflict("paid", "paid"), null);
  assert.equal(statusConflict("pending", "pending"), null);
  assert.equal(statusConflict("delivered", "pending"), null);
  assert.equal(statusConflict("cancelled", "paid"), null);
});

// ---------------------------------------------------------------- A6 -------
test("order dialog has no second payment control", () => {
  const code = src("routes/_adminGuard.admin.orders.tsx");
  assert.doesNotMatch(code, /Mark paid/);
  assert.equal((code.match(/ordersService\.updatePaymentStatus\(/g) ?? []).length, 1);
});

// ---------------------------------------------------------- A4 / B7 --------
test("changedFields returns only what differs", () => {
  const saved = {
    title: "Our Journey",
    subtitle: "Milestones",
    isVisible: true,
    settings: { limit: 4 },
  };
  assert.deepEqual(changedFields(saved, { ...saved }), {});
  assert.deepEqual(changedFields(saved, { ...saved, title: "History" }), { title: "History" });
  assert.deepEqual(changedFields(saved, { ...saved, settings: { limit: 4 } }), {}, "structural");
  assert.deepEqual(changedFields(saved, { ...saved, settings: { limit: 6 } }), {
    settings: { limit: 6 },
  });
});

test("Pages editor leaves out sections owned by other screens and sends only changes", () => {
  const code = src("routes/_adminGuard.admin.homepage.tsx");
  assert.match(code, /hero: \{ what: "Homepage hero", to: "\/admin\/hero-slides"/);
  assert.match(code, /timeline: \{ what: "Company timeline", to: "\/admin\/timeline"/);
  assert.match(code, /\.filter\(\(s\) => !MANAGED_ELSEWHERE\[s\.sectionType\]\)/);
  assert.match(code, /const changed = changedFields\(saved, draft\)/);
  assert.match(code, /newsletter: \[\]/, "newsletter copy is not editable here");
  assert.doesNotMatch(code, /buttonUrl/, "no second Instagram URL field");
});

// ------------------------------------------------------ A1 / A2 / A3 -------
test("Settings edits only store name, currency and shipping — no contact or social copies", () => {
  const page = src("routes/_adminGuard.admin.settings.tsx");
  const svc = src("admin/services/misc.ts");
  for (const dup of [
    "storeEmail",
    "storePhone",
    "storeAddress",
    "socialInstagram",
    "socialFacebook",
    "socialTwitter",
  ]) {
    assert.doesNotMatch(page, new RegExp(dup), `Settings page has no ${dup}`);
    assert.doesNotMatch(svc, new RegExp(dup), `settings service has no ${dup}`);
  }
  assert.doesNotMatch(svc, /settings\/social/, "Settings no longer writes the social document");
  assert.match(page, /changedFields\(saved, d\)/, "Settings sends only changed fields");
});

test("Site Content no longer has a Store tab or writes store_settings", () => {
  const page = src("routes/_adminGuard.admin.content.tsx");
  const svc = src("admin/services/cms.ts");
  assert.doesNotMatch(page, /value="store"/);
  assert.doesNotMatch(page, /draft\.store/);
  assert.doesNotMatch(svc, /settings\/store/);
});

// ---------------------------------------------------- A8 / B2 / B3 ---------
test("homepage bands obey their section switch; one newsletter copy; one Instagram URL", () => {
  const code = src("routes/index.tsx");
  assert.match(code, /showSection\(testimonialsSection\) &&/);
  assert.match(code, /showSection\(instagramSection\) && instagramImages\.length > 0/);
  assert.match(code, /showSection\(newsletterSection\) &&/);
  assert.match(code, /\{site\.newsletter\.title\}/);
  assert.doesNotMatch(code, /newsletterSection\?\.(title|content)/);
  assert.match(code, /href=\{site\.social\.instagram \|\| "#"\}/);
  assert.doesNotMatch(code, /instagramSection\?\.buttonUrl/);
});

test("the storefront hero still comes from Hero Slides only", () => {
  const code = src("routes/index.tsx");
  assert.match(code, /<HeroCarousel \/>/);
  assert.doesNotMatch(code, /findSection\(page, "hero"\)/);
});
