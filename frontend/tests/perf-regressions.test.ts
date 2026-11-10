/**
 * Regression guards for the storefront performance pass.
 *
 * Source-level checks only: nothing here talks to an API or a database. Run
 * from frontend/ with:
 *
 *   ../backend/node_modules/.bin/tsx --test tests/perf-regressions.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../src/", import.meta.url));
const src = (path: string) => readFileSync(join(SRC, path), "utf8");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

test("framer-motion is imported only by the About page timeline", () => {
  // Every page loads the shared shell; importing the animation library from
  // anything in it (chat widget, product cards…) put ~40KB gzip on every page.
  const importers = sourceFiles(SRC)
    .filter((f) => /from "framer-motion"/.test(readFileSync(f, "utf8")))
    .map((f) => f.slice(SRC.length).replace(/\\/g, "/"));
  assert.deepEqual(importers, ["components/about/company-timeline.tsx"]);
});

test("card hover lift, review form, gallery fade and chat panel are CSS animations", () => {
  for (const card of ["components/shop/product-card.tsx", "components/shop/accessory-card.tsx"]) {
    assert.match(
      src(card),
      /<article className="group transition-transform duration-300 ease-out hover:-translate-y-1">/,
    );
  }
  assert.match(src("components/shop/product-reviews.tsx"), /className="enter-rise mb-8/);
  assert.match(src("routes/product.$id.tsx"), /imageSwitched \? "enter-fade " : ""/);
  const chat = src("components/chat/chat-widget.tsx");
  assert.match(chat, /open \? "chat-panel-in" : "chat-panel-out"/);
  assert.match(chat, /window\.setTimeout\(\(\) => setPresent\(false\), 300\)/, "fallback unmount");
  const css = src("styles.css");
  for (const name of ["enter-fade", "chat-panel-in", "chat-panel-out"]) {
    assert.match(css, new RegExp(`@keyframes ${name} \\{`));
    assert.match(css, new RegExp(`@utility ${name} \\{`));
  }
});

test("the shop loader prefetches the same product query the page reads", () => {
  const shop = src("routes/shop.tsx");
  assert.match(shop, /prefetchQuery\(productListOptions\(productParams\(deps\)\)\)/);
  assert.match(shop, /useProducts\(\s*productParams\(search\),?\s*\)/);
  // Only awaited during SSR: client-side sort/filter/page changes stay instant.
  assert.match(shop, /if \(typeof window === "undefined"\) await products;/);
  for (const key of ["q", "cat", "sort", "page", "gift"]) {
    assert.match(shop, new RegExp(`${key}: search\\.${key},`), `loaderDeps carries ${key}`);
  }
});
