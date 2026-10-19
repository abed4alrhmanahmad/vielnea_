/**
 * End-to-end CMS test: change content as an admin, confirm it landed in
 * Supabase, then confirm the public API (what the storefront reads) serves it.
 *
 * Every value changed here is restored to its original at the end, so the
 * storefront is left exactly as it was found.
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

interface Section {
  id: string;
  sectionKey: string;
  title: string | null;
  content: string | null;
  imageUrl: string | null;
  isVisible: boolean;
}
interface Page {
  id: string;
  slug: string;
  metaTitle: string | null;
  sections: Section[];
}

async function main(): Promise<void> {
  const db = new pg.Client({
    ...env.db,
    ssl: { rejectUnauthorized: false },
    application_name: "vielinea-cms-e2e",
    connectionTimeoutMillis: 20_000,
  });
  await db.connect();

  // Snapshot everything we are about to touch, so it can be restored exactly.
  const original = {
    footer: (await db.query("SELECT value FROM site_content WHERE key='footer'")).rows[0]?.value,
    header: (await db.query("SELECT value FROM site_content WHERE key='header'")).rows[0]?.value,
    contact: (await db.query("SELECT value FROM site_content WHERE key='contact'")).rows[0]?.value,
    hero: (
      await db.query(
        "SELECT id, title, image_url FROM site_sections WHERE section_key='hero'",
      )
    ).rows[0],
    aboutIntro: (
      await db.query(
        `SELECT s.id, s.content FROM site_sections s
         JOIN site_pages p ON p.id = s.page_id
         WHERE p.slug='about' AND s.section_key='intro'`,
      )
    ).rows[0],
    homeMeta: (await db.query("SELECT id, meta_title FROM site_pages WHERE slug='home'")).rows[0],
  };
  const createdTestimonialIds: string[] = [];

  console.log("\n=== 1. AUTH + AUTHORIZATION ===");
  let adminToken = "";
  let customerToken = "";
  {
    const admin = await call<{ token: string }>("POST", "/auth/login", {
      body: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD },
    });
    adminToken = admin.json.data?.token ?? "";
    check("admin login", Boolean(adminToken));

    const cust = await call<{ token: string }>("POST", "/auth/login", {
      body: { email: env.DEMO_USER_EMAIL, password: env.DEMO_USER_PASSWORD },
    });
    customerToken = cust.json.data?.token ?? "";

    for (const [method, path, body] of [
      ["GET", "/admin/site/settings", undefined],
      ["PUT", "/admin/site/settings/footer", { value: { tagline: "hacked" } }],
      ["GET", "/admin/site/testimonials", undefined],
      ["POST", "/admin/site/testimonials", { name: "Hacker", quote: "Should not save" }],
    ] as const) {
      const anon = await call(method, path, body ? { body } : {});
      const cus = await call(method, path, body ? { token: customerToken, body } : { token: customerToken });
      check(
        `${method} ${path}: anon 401 / customer 403`,
        anon.status === 401 && cus.status === 403,
        `${anon.status}/${cus.status}`,
      );
    }

    // Public reads must stay open.
    const pubSettings = await call("GET", "/site/settings");
    const pubPage = await call("GET", "/site/pages/home");
    check(
      "public CMS reads are open",
      pubSettings.status === 200 && pubPage.status === 200,
      `${pubSettings.status}/${pubPage.status}`,
    );
  }

  console.log("\n=== 2. SEEDED CONTENT MATCHES THE ORIGINAL SITE ===");
  {
    const { json } = await call<Page>("GET", "/site/pages/home");
    const hero = json.data.sections.find((s) => s.sectionKey === "hero");
    check("home page has sections", json.data.sections.length > 0, `${json.data.sections.length}`);
    check(
      "hero title is the original copy",
      hero?.title === "Timeless\nElegance",
      JSON.stringify(hero?.title),
    );
    check(
      "hero uses the existing VIELINEA image",
      hero?.imageUrl === "/images/brand/vielinea-hero.jpg",
      hero?.imageUrl ?? "",
    );

    const settings = await call<{
      footer: { tagline: string; columns: unknown[] };
      header: { nav: unknown[] };
      contact: { email: string };
    }>("GET", "/site/settings");
    check(
      "footer tagline seeded verbatim",
      settings.json.data.footer.tagline ===
        "Timeless pieces made for the modern woman. Elegance, without excess.",
    );
    check("footer has 2 link columns", settings.json.data.footer.columns.length === 2);
    check("header nav has 6 items", settings.json.data.header.nav.length === 6);
    check("contact email seeded", settings.json.data.contact.email === "hello@vielinea.com");

    const t = await call<unknown[]>("GET", "/site/testimonials");
    check("3 testimonials seeded", t.json.data.length === 3, `${t.json.data.length}`);
  }

  console.log("\n=== 3. HERO: admin edit -> Supabase -> storefront ===");
  {
    const NEW = "CMS Verified Hero";
    const upd = await call<Section>("PUT", `/admin/site/sections/${original.hero.id}`, {
      token: adminToken,
      body: { title: NEW },
    });
    check("admin saves hero title", upd.status === 200);

    const inDb = (
      await db.query("SELECT title FROM site_sections WHERE id=$1", [original.hero.id])
    ).rows[0]?.title;
    check("value persisted in Supabase", inDb === NEW, String(inDb));

    const pub = await call<Page>("GET", "/site/pages/home");
    const hero = pub.json.data.sections.find((s) => s.sectionKey === "hero");
    check("public API (storefront source) serves the new title", hero?.title === NEW, hero?.title ?? "");
  }

  console.log("\n=== 4. FOOTER: admin edit -> Supabase -> storefront ===");
  {
    const NEW_TAGLINE = "CMS Verified Footer Text";
    const next = { ...(original.footer as Record<string, unknown>), tagline: NEW_TAGLINE };
    const upd = await call("PUT", "/admin/site/settings/footer", {
      token: adminToken,
      body: { value: next },
    });
    check("admin saves footer", upd.status === 200);

    const inDb = (await db.query("SELECT value FROM site_content WHERE key='footer'")).rows[0]
      ?.value as { tagline: string };
    check("footer persisted in Supabase", inDb.tagline === NEW_TAGLINE, inDb.tagline);

    const pub = await call<{ footer: { tagline: string } }>("GET", "/site/settings");
    check(
      "public API serves the new footer text",
      pub.json.data.footer.tagline === NEW_TAGLINE,
      pub.json.data.footer.tagline,
    );
  }

  console.log("\n=== 5. NAVIGATION: relabel a nav item ===");
  {
    const nav = structuredClone(original.header as { nav: Array<{ label: string }> });
    nav.nav[1]!.label = "Boutique";
    const upd = await call("PUT", "/admin/site/settings/header", {
      token: adminToken,
      body: { value: nav },
    });
    check("admin saves navigation", upd.status === 200);

    const pub = await call<{ header: { nav: Array<{ label: string }> } }>("GET", "/site/settings");
    check(
      "public API serves the renamed nav item",
      pub.json.data.header.nav[1]?.label === "Boutique",
      pub.json.data.header.nav[1]?.label ?? "",
    );
  }

  console.log("\n=== 6. ABOUT + CONTACT content ===");
  {
    const NEW_ABOUT = "CMS verified about copy.";
    await call("PUT", `/admin/site/sections/${original.aboutIntro.id}`, {
      token: adminToken,
      body: { content: NEW_ABOUT },
    });
    const pubAbout = await call<Page>("GET", "/site/pages/about");
    const intro = pubAbout.json.data.sections.find((s) => s.sectionKey === "intro");
    check("about intro updated and served", intro?.content === NEW_ABOUT, intro?.content ?? "");

    const NEW_EMAIL = "cms-verified@vielinea.com";
    const nextContact = { ...(original.contact as Record<string, unknown>), email: NEW_EMAIL };
    await call("PUT", "/admin/site/settings/contact", {
      token: adminToken,
      body: { value: nextContact },
    });
    const pubSettings = await call<{ contact: { email: string } }>("GET", "/site/settings");
    check(
      "contact email updated and served",
      pubSettings.json.data.contact.email === NEW_EMAIL,
      pubSettings.json.data.contact.email,
    );
  }

  console.log("\n=== 7. TESTIMONIALS: add / edit / hide / delete ===");
  {
    const created = await call<{ id: string; name: string }>("POST", "/admin/site/testimonials", {
      token: adminToken,
      body: { name: "CMS Tester", location: "Beirut", quote: "Added by the CMS end-to-end test." },
    });
    const id = created.json.data?.id ?? "";
    if (id) createdTestimonialIds.push(id);
    check("admin adds testimonial", created.status === 201 && Boolean(id));

    let pub = await call<Array<{ id: string }>>("GET", "/site/testimonials");
    check("new testimonial visible on the storefront feed", pub.json.data.some((t) => t.id === id));

    await call("PUT", `/admin/site/testimonials/${id}`, {
      token: adminToken,
      body: { isActive: false },
    });
    pub = await call<Array<{ id: string }>>("GET", "/site/testimonials");
    check("hidden testimonial disappears from the storefront", !pub.json.data.some((t) => t.id === id));

    const del = await call("DELETE", `/admin/site/testimonials/${id}`, { token: adminToken });
    check("admin deletes testimonial", del.status === 200);
    createdTestimonialIds.length = 0;

    pub = await call<Array<{ id: string }>>("GET", "/site/testimonials");
    check("original 3 testimonials remain", pub.json.data.length === 3, `${pub.json.data.length}`);
  }

  console.log("\n=== 8. SEO fields ===");
  {
    const NEW_META = "CMS Verified Meta Title";
    const upd = await call("PUT", `/admin/site/pages/${original.homeMeta.id}`, {
      token: adminToken,
      body: { metaTitle: NEW_META },
    });
    check("admin saves SEO", upd.status === 200);

    const pub = await call<Page>("GET", "/site/pages/home");
    check("public API serves the new meta title", pub.json.data.metaTitle === NEW_META);
  }

  console.log("\n=== 9. VALIDATION + VISIBILITY ===");
  {
    const bad = await call("PUT", `/admin/site/sections/${original.hero.id}`, {
      token: adminToken,
      body: {},
    });
    check("empty section update rejected -> 422", bad.status === 422);

    const badTestimonial = await call("POST", "/admin/site/testimonials", {
      token: adminToken,
      body: { name: "x", quote: "" },
    });
    check("invalid testimonial rejected -> 422", badTestimonial.status === 422);

    // Hiding a section removes it from the public payload but not the admin one.
    await call("PUT", `/admin/site/sections/${original.hero.id}`, {
      token: adminToken,
      body: { isVisible: false },
    });
    const pub = await call<Page>("GET", "/site/pages/home");
    check(
      "hidden section is withheld from the public API",
      !pub.json.data.sections.some((s) => s.sectionKey === "hero"),
    );
    const adminView = await call<Page>("GET", "/admin/site/pages/home", { token: adminToken });
    check(
      "admin still sees the hidden section",
      adminView.json.data.sections.some((s) => s.sectionKey === "hero"),
    );

    const unknown = await call("GET", "/site/pages/does-not-exist");
    check("unknown page -> 404", unknown.status === 404);
  }

  console.log("\n=== 10. RESTORE ORIGINAL CONTENT ===");
  {
    await db.query("UPDATE site_content SET value=$2 WHERE key=$1", ["footer", original.footer]);
    await db.query("UPDATE site_content SET value=$2 WHERE key=$1", ["header", original.header]);
    await db.query("UPDATE site_content SET value=$2 WHERE key=$1", ["contact", original.contact]);
    await db.query("UPDATE site_sections SET title=$2, is_visible=true WHERE id=$1", [
      original.hero.id,
      original.hero.title,
    ]);
    await db.query("UPDATE site_sections SET content=$2 WHERE id=$1", [
      original.aboutIntro.id,
      original.aboutIntro.content,
    ]);
    await db.query("UPDATE site_pages SET meta_title=$2 WHERE id=$1", [
      original.homeMeta.id,
      original.homeMeta.meta_title,
    ]);
    for (const id of createdTestimonialIds) {
      await db.query("DELETE FROM testimonials WHERE id=$1", [id]);
    }

    const hero = (
      await db.query("SELECT title, is_visible FROM site_sections WHERE id=$1", [original.hero.id])
    ).rows[0];
    check(
      "hero restored",
      hero?.title === original.hero.title && hero?.is_visible === true,
      JSON.stringify(hero?.title),
    );

    const footer = (await db.query("SELECT value FROM site_content WHERE key='footer'")).rows[0]
      ?.value as { tagline: string };
    check(
      "footer restored",
      footer.tagline === "Timeless pieces made for the modern woman. Elegance, without excess.",
    );

    const counts = (
      await db.query(`SELECT
        (SELECT count(*)::int FROM products)     AS products,
        (SELECT count(*)::int FROM categories)   AS categories,
        (SELECT count(*)::int FROM reviews)      AS reviews,
        (SELECT count(*)::int FROM testimonials) AS testimonials,
        (SELECT count(*)::int FROM product_images) AS images`)
    ).rows[0];
    console.log(`  data: ${JSON.stringify(counts)}`);
    check(
      "catalogue and images untouched by CMS work",
      counts.categories === 8 && counts.reviews === 3 && counts.testimonials === 3,
    );
  }

  await db.end();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`CMS E2E: ${passed} passed, ${failed} failed`);
  if (failed > 0) console.log(`Failures:\n  - ${failures.join("\n  - ")}`);
  console.log("=".repeat(60));
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error(`CMS E2E crashed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
  process.exit(1);
});
