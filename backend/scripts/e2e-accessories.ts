/**
 * End-to-end test for the Accessories section against the live Supabase
 * database and a running API.
 *
 * Covers the full admin lifecycle (create, read, update, delete), a real image
 * upload into Supabase Storage, the public storefront read, authorisation, and
 * the separation guarantees: accessories must not appear in the product list
 * or its category filter, and product creation must still work exactly as
 * before.
 *
 * Cleanup: every record this creates (accessories, a probe product) is deleted
 * afterwards. The seeded catalogue is never modified.
 */
import pg from "pg";
import { env } from "../src/config/env.js";

const BASE = `http://localhost:${env.PORT}/api`;

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean, detail = ""): void {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed += 1;
    failures.push(label);
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

interface Envelope<T> {
  success: boolean;
  data: T;
  message?: string;
  pagination?: { total: number };
}

async function call<T>(
  method: string,
  path: string,
  options: { body?: unknown; token?: string } = {},
): Promise<{ status: number; json: Envelope<T> }> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.token) headers["Authorization"] = `Bearer ${options.token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return { status: res.status, json: (await res.json()) as Envelope<T> };
}

/** Posts raw image bytes to an upload endpoint, the way the browser does. */
async function upload(
  path: string,
  bytes: Buffer,
  contentType: string,
  token: string,
): Promise<{ status: number; json: Envelope<{ url: string }> }> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": contentType, Authorization: `Bearer ${token}` },
    body: new Uint8Array(bytes),
  });
  return { status: res.status, json: (await res.json()) as Envelope<{ url: string }> };
}

interface ApiAccessory {
  id: string;
  slug: string;
  name: string;
  description: string;
  price: number;
  discount: number;
  finalPrice: number;
  stock: number;
  isAvailable: boolean;
  isFeatured: boolean;
  sortOrder: number;
  images: string[];
  imageDetails: Array<{ imageUrl: string; sortOrder: number }>;
}

/**
 * A real 1x1 PNG. The upload endpoint verifies magic bytes rather than
 * trusting the declared Content-Type, so this has to be a genuine image.
 */
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function main(): Promise<void> {
  const stamp = Date.now();
  const created = { accessoryIds: [] as string[], productSlug: "" };
  let uploadedUrl = "";

  console.log("\n=== 1. AUTHENTICATION ===");
  let adminToken = "";
  let customerToken = "";
  {
    const login = await call<{ token: string; user: { role: string } }>("POST", "/auth/login", {
      body: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD },
    });
    adminToken = login.json.data?.token ?? "";
    check("admin login", login.status === 200 && login.json.data?.user.role === "admin");

    const cust = await call<{ token: string }>("POST", "/auth/login", {
      body: { email: env.DEMO_USER_EMAIL, password: env.DEMO_USER_PASSWORD },
    });
    customerToken = cust.json.data?.token ?? "";
    check("customer login", cust.status === 200 && Boolean(customerToken));
  }

  console.log("\n=== 2. AUTHORISATION ON ACCESSORY WRITES ===");
  {
    const anon = await call("POST", "/accessories", { body: { name: "Nope", price: 1 } });
    check("anonymous create -> 401", anon.status === 401, String(anon.status));

    const asCustomer = await call("POST", "/accessories", {
      body: { name: "Nope", price: 1 },
      token: customerToken,
    });
    check("customer create -> 403", asCustomer.status === 403, String(asCustomer.status));

    const anonUpload = await upload("/accessories/images", PNG_1X1, "image/png", "");
    check("anonymous image upload -> 401", anonUpload.status === 401, String(anonUpload.status));

    const publicList = await call<ApiAccessory[]>("GET", "/accessories");
    check("public list is readable without a token", publicList.status === 200);
  }

  console.log("\n=== 3. IMAGE UPLOAD TO SUPABASE STORAGE ===");
  {
    const res = await upload("/accessories/images", PNG_1X1, "image/png", adminToken);
    uploadedUrl = res.json.data?.url ?? "";
    check(
      "upload returns a public Supabase Storage URL",
      res.status === 201 && uploadedUrl.startsWith(`${env.SUPABASE_URL}/storage/v1/object/public/`),
      uploadedUrl,
    );

    if (uploadedUrl) {
      const fetched = await fetch(uploadedUrl);
      check(
        "uploaded image is retrievable from storage",
        fetched.ok && (fetched.headers.get("content-type") ?? "").includes("image/png"),
        `${fetched.status} ${fetched.headers.get("content-type") ?? ""}`,
      );
    }

    const bogus = await upload("/accessories/images", Buffer.from("not an image"), "image/png", adminToken);
    check("non-image bytes are rejected", bogus.status === 400, String(bogus.status));
  }

  console.log("\n=== 4. ADMIN CREATE ===");
  let accessory: ApiAccessory | undefined;
  {
    const res = await call<ApiAccessory>("POST", "/accessories", {
      token: adminToken,
      body: {
        name: `E2E Silk Ribbon ${stamp}`,
        description: "A complimentary silk ribbon, folded with every order.",
        price: 24.5,
        discount: 10,
        stock: 12,
        isAvailable: true,
        isFeatured: true,
        sortOrder: 3,
        images: [
          { imageUrl: uploadedUrl || "/images/products/product-dress.jpg", altText: "Ribbon" },
          { imageUrl: "/images/products/product-bag.jpg", altText: "Ribbon, folded" },
        ],
      },
    });
    accessory = res.json.data;
    if (accessory?.id) created.accessoryIds.push(accessory.id);

    check("create -> 201", res.status === 201, res.json.message ?? "");
    check("name stored", accessory?.name === `E2E Silk Ribbon ${stamp}`);
    check("slug derived from the name", Boolean(accessory?.slug?.startsWith("e2e-silk-ribbon")));
    check("price stored", accessory?.price === 24.5, String(accessory?.price));
    check("final price applies the discount", accessory?.finalPrice === 22.05, String(accessory?.finalPrice));
    check("stock stored", accessory?.stock === 12);
    check("availability stored", accessory?.isAvailable === true);
    check("multiple images stored in order", accessory?.images.length === 2, accessory?.images.join(" | "));
    check(
      "first image is the uploaded one",
      accessory?.images[0] === (uploadedUrl || "/images/products/product-dress.jpg"),
    );
  }

  console.log("\n=== 5. DUPLICATE NAMES GET DISTINCT SLUGS ===");
  {
    const res = await call<ApiAccessory>("POST", "/accessories", {
      token: adminToken,
      body: { name: `E2E Silk Ribbon ${stamp}`, price: 24.5 },
    });
    if (res.json.data?.id) created.accessoryIds.push(res.json.data.id);
    check("second accessory with the same name -> 201", res.status === 201, res.json.message ?? "");
    check(
      "its slug is de-duplicated",
      Boolean(res.json.data?.slug) && res.json.data.slug !== accessory?.slug,
      res.json.data?.slug,
    );
  }

  console.log("\n=== 6. PUBLIC STOREFRONT READ ===");
  {
    const list = await call<ApiAccessory[]>("GET", "/accessories?limit=60");
    const found = list.json.data?.find((a) => a.id === accessory?.id);
    check("accessory appears on the public list", Boolean(found), found?.name);
    check("public list carries pagination", typeof list.json.pagination?.total === "number");

    const bySlug = await call<ApiAccessory>("GET", `/accessories/${accessory?.slug}`);
    check("readable by slug", bySlug.status === 200 && bySlug.json.data?.id === accessory?.id);

    const byId = await call<ApiAccessory>("GET", `/accessories/${accessory?.id}`);
    check("readable by id", byId.status === 200 && byId.json.data?.slug === accessory?.slug);

    const search = await call<ApiAccessory[]>("GET", `/accessories?search=Silk+Ribbon+${stamp}`);
    check("search finds it", (search.json.data ?? []).some((a) => a.id === accessory?.id));

    const missing = await call("GET", "/accessories/no-such-accessory");
    check("unknown slug -> 404", missing.status === 404, String(missing.status));
  }

  console.log("\n=== 7. HIDDEN ACCESSORIES STAY OFF THE STOREFRONT ===");
  {
    const hidden = await call<ApiAccessory>("POST", "/accessories", {
      token: adminToken,
      body: { name: `E2E Hidden Charm ${stamp}`, price: 9, isAvailable: false },
    });
    if (hidden.json.data?.id) created.accessoryIds.push(hidden.json.data.id);

    const publicList = await call<ApiAccessory[]>("GET", "/accessories?limit=60");
    check(
      "hidden accessory is absent from the public list",
      !(publicList.json.data ?? []).some((a) => a.id === hidden.json.data?.id),
    );

    const adminList = await call<ApiAccessory[]>("GET", "/accessories?limit=60&availability=all", {
      token: adminToken,
    });
    check(
      "hidden accessory is visible in the admin list",
      (adminList.json.data ?? []).some((a) => a.id === hidden.json.data?.id),
    );
  }

  console.log("\n=== 8. ADMIN EDIT ===");
  {
    const res = await call<ApiAccessory>("PUT", `/accessories/${accessory?.id}`, {
      token: adminToken,
      body: {
        name: `E2E Silk Ribbon ${stamp} (edited)`,
        price: 30,
        discount: 0,
        stock: 4,
        isAvailable: false,
        images: [{ imageUrl: "/images/products/product-jewelry.jpg", altText: "New view" }],
      },
    });
    check("update -> 200", res.status === 200, res.json.message ?? "");
    check("name updated", res.json.data?.name.endsWith("(edited)"));
    check("price updated", res.json.data?.price === 30);
    check("final price recomputed", res.json.data?.finalPrice === 30);
    check("stock updated", res.json.data?.stock === 4);
    check("availability toggled off", res.json.data?.isAvailable === false);
    check("images replaced wholesale", res.json.data?.images.length === 1, res.json.data?.images.join(" | "));

    const partial = await call<ApiAccessory>("PUT", `/accessories/${accessory?.id}`, {
      token: adminToken,
      body: { isAvailable: true },
    });
    check("partial update leaves images untouched", partial.json.data?.images.length === 1);
    check("partial update leaves the name untouched", partial.json.data?.name.endsWith("(edited)"));

    const asCustomer = await call("PUT", `/accessories/${accessory?.id}`, {
      token: customerToken,
      body: { price: 1 },
    });
    check("customer update -> 403", asCustomer.status === 403, String(asCustomer.status));
  }

  console.log("\n=== 9. VALIDATION ===");
  {
    const noName = await call("POST", "/accessories", { token: adminToken, body: { price: 5 } });
    check("missing name is rejected", noName.status >= 400 && noName.status < 500, String(noName.status));

    const negative = await call("POST", "/accessories", {
      token: adminToken,
      body: { name: "E2E Bad Price", price: -5 },
    });
    check("negative price is rejected", negative.status >= 400 && negative.status < 500);

    const badDiscount = await call("POST", "/accessories", {
      token: adminToken,
      body: { name: "E2E Bad Discount", price: 5, discount: 250 },
    });
    check("out-of-range discount is rejected", badDiscount.status >= 400 && badDiscount.status < 500);
  }

  console.log("\n=== 10. SEPARATION FROM PRODUCTS ===");
  {
    const products = await call<Array<{ id: string; title: string; category: string }>>(
      "GET",
      "/products?limit=60",
    );
    const names = new Set(created.accessoryIds);
    check(
      "no accessory id appears in the product list",
      !(products.json.data ?? []).some((p) => names.has(p.id)),
    );
    check(
      "no accessory name appears in the product list",
      !(products.json.data ?? []).some((p) => p.title.startsWith("E2E Silk Ribbon")),
    );

    const byCategory = await call<Array<{ title: string }>>(
      "GET",
      "/products?category=accessories&limit=60",
    );
    check(
      "the accessories product category filter does not return accessories",
      !(byCategory.json.data ?? []).some((p) => p.title.startsWith("E2E Silk Ribbon")),
      `${byCategory.json.data?.length ?? 0} product(s) in that category`,
    );

    const searchProducts = await call<Array<{ title: string }>>(
      "GET",
      `/products?search=Silk+Ribbon+${stamp}`,
    );
    check(
      "product search does not surface accessories",
      (searchProducts.json.data ?? []).length === 0,
    );
  }

  console.log("\n=== 11. EXISTING PRODUCT FUNCTIONALITY IS UNCHANGED ===");
  {
    const productUpload = await upload("/products/images", PNG_1X1, "image/png", adminToken);
    check(
      "product image upload still works",
      productUpload.status === 201 && Boolean(productUpload.json.data?.url),
      String(productUpload.status),
    );

    const create = await call<{ id: string; slug: string; title: string; category: string; images: string[] }>(
      "POST",
      "/products",
      {
        token: adminToken,
        body: {
          title: `E2E Probe Dress ${stamp}`,
          description: "Temporary product used to prove product creation is unaffected.",
          category: "dresses",
          price: 120,
          stock: 3,
          images: [{ imageUrl: productUpload.json.data?.url ?? "/images/products/product-dress.jpg" }],
          sizes: [{ size: "M", stock: 3 }],
        },
      },
    );
    created.productSlug = create.json.data?.slug ?? "";
    check("product creation still works", create.status === 201, create.json.message ?? "");
    check("product keeps its category", create.json.data?.category === "dresses");

    const update = await call<{ price: number }>("PUT", `/products/${created.productSlug}`, {
      token: adminToken,
      body: { price: 130 },
    });
    check("product editing still works", update.status === 200 && update.json.data?.price === 130);

    const categories = await call<Array<{ slug: string }>>("GET", "/categories");
    const slugs = (categories.json.data ?? []).map((c) => c.slug);
    check(
      "product categories are unchanged",
      ["dresses", "blouses", "pants", "skirts", "tops", "jewelry", "accessories"].every((s) =>
        slugs.includes(s),
      ),
      slugs.join(", "),
    );
  }

  console.log("\n=== 12. ADMIN DELETE ===");
  {
    const target = created.accessoryIds[0];
    const asCustomer = await call("DELETE", `/accessories/${target}`, { token: customerToken });
    check("customer delete -> 403", asCustomer.status === 403, String(asCustomer.status));

    const res = await call("DELETE", `/accessories/${target}`, { token: adminToken });
    check("admin delete -> 200", res.status === 200, res.json.message ?? "");

    const gone = await call("GET", `/accessories/${target}`);
    check("deleted accessory -> 404", gone.status === 404, String(gone.status));
    created.accessoryIds.shift();
  }

  console.log("\n=== 13. CLEANUP ===");
  {
    for (const id of created.accessoryIds) {
      await call("DELETE", `/accessories/${id}`, { token: adminToken });
    }
    if (created.productSlug) {
      await call("DELETE", `/products/${created.productSlug}`, { token: adminToken });
    }

    const client = new pg.Client({
      ...env.db,
      ssl: { rejectUnauthorized: false },
      application_name: "vielinea-e2e-accessories",
      connectionTimeoutMillis: 20_000,
    });
    await client.connect();
    try {
      const leftovers = await client.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM public.accessories WHERE name LIKE 'E2E %'",
      );
      check("no E2E accessories left behind", leftovers.rows[0]?.count === 0, String(leftovers.rows[0]?.count));

      const orphanImages = await client.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM public.accessory_images ai
         LEFT JOIN public.accessories a ON a.id = ai.accessory_id
         WHERE a.id IS NULL`,
      );
      check("image rows cascade with their accessory", orphanImages.rows[0]?.count === 0);

      const probeProducts = await client.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM public.products WHERE title LIKE 'E2E Probe%'",
      );
      check("no E2E probe products left behind", probeProducts.rows[0]?.count === 0);
    } finally {
      await client.end();
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("\n  Failures:");
    for (const f of failures) console.log(`    - ${f}`);
  }
  console.log(`${"=".repeat(60)}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error: unknown) => {
  console.error("\nTest run crashed:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
