/**
 * End-to-end test for the homepage hero carousel against the live Supabase
 * database and a running API.
 *
 * Covers the public read contract (active only, ordered), the full admin
 * lifecycle (create, read, update, reorder, delete), authorisation on every
 * management route, validation, and the guarantee that the three seeded
 * slides — including the hero image that already shipped — are intact.
 *
 * Cleanup: every slide this creates is deleted afterwards, and any seeded slide
 * it toggles is restored. The seeded rows are never left modified.
 */
import { env } from "../src/config/env.js";

const BASE = `http://localhost:${env.PORT}/api`;
const EXISTING_HERO_IMAGE = "/images/brand/vielinea-hero.jpg";

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

interface HeroSlide {
  id: string;
  imageUrl: string;
  eyebrowText: string;
  heading: string;
  description: string;
  buttonText: string;
  buttonLink: string;
  displayOrder: number;
  isActive: boolean;
  objectPosition: string;
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

async function adminToken(): Promise<string> {
  const login = await call<{ token: string }>("POST", "/auth/login", {
    body: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD },
  });
  const token = login.json.data?.token;
  if (!token) {
    throw new Error(
      `Could not sign in as ${env.ADMIN_EMAIL} (status ${login.status}). Run npm run db:seed first.`,
    );
  }
  return token;
}

async function main(): Promise<void> {
  console.log("\nHero slides — end-to-end\n");

  const token = await adminToken();
  const createdIds: string[] = [];

  try {
    // -- Public read --------------------------------------------------------
    console.log("Public read");
    const pub = await call<HeroSlide[]>("GET", "/hero-slides");
    check("GET /hero-slides is public", pub.status === 200, `status ${pub.status}`);
    const slides = pub.json.data ?? [];
    check("returns the three seeded slides", slides.length === 3, `${slides.length} slide(s)`);
    check(
      "sorted by display_order ascending",
      slides.every((s, i) => i === 0 || slides[i - 1]!.displayOrder <= s.displayOrder),
      slides.map((s) => s.displayOrder).join(","),
    );
    check("every slide returned is active", slides.every((s) => s.isActive));
    check(
      "every slide carries a focal point, defaulting to top",
      slides.every((s) => s.objectPosition === "top"),
      slides.map((s) => s.objectPosition).join(","),
    );

    // -- The hero that already shipped is preserved -------------------------
    console.log("\nExisting hero preserved");
    const first = slides[0];
    check(
      "slide 1 keeps the original hero image",
      first?.imageUrl === EXISTING_HERO_IMAGE,
      first?.imageUrl ?? "missing",
    );
    check("slide 1 keeps the original heading", first?.heading === "Timeless\nElegance");
    check("slide 1 keeps the original eyebrow", first?.eyebrowText === "New Collection");
    check("slide 1 keeps the original button", first?.buttonText === "Shop Now");

    // -- Authorisation ------------------------------------------------------
    console.log("\nAuthorisation");
    for (const [method, path] of [
      ["GET", "/hero-slides/all"],
      ["POST", "/hero-slides"],
      ["PUT", `/hero-slides/${first?.id ?? "x"}`],
      ["DELETE", `/hero-slides/${first?.id ?? "x"}`],
    ] as const) {
      const res = await call(method, path, method === "GET" ? {} : { body: { heading: "x" } });
      check(`${method} ${path} rejects anonymous`, res.status === 401, `status ${res.status}`);
    }

    // -- Admin read ---------------------------------------------------------
    console.log("\nAdmin read");
    const all = await call<HeroSlide[]>("GET", "/hero-slides/all", { token });
    check("GET /hero-slides/all authorises admin", all.status === 200, `status ${all.status}`);
    check("admin sees at least the seeded slides", (all.json.data ?? []).length >= 3);

    // -- Create -------------------------------------------------------------
    console.log("\nCreate");
    const created = await call<HeroSlide>("POST", "/hero-slides", {
      token,
      body: {
        imageUrl: "/images/brand/vielinea-hero.jpg",
        eyebrowText: "E2E",
        heading: "E2E Slide",
        description: "Created by the hero slides e2e test.",
        buttonText: "Shop",
        buttonLink: "/shop",
        isActive: false,
      },
    });
    check("POST /hero-slides creates", created.status === 201, `status ${created.status}`);
    const slide = created.json.data;
    if (slide?.id) createdIds.push(slide.id);
    check("new slide is inactive as requested", slide?.isActive === false);
    check(
      "focal point defaults to top when omitted",
      slide?.objectPosition === "top",
      slide?.objectPosition,
    );
    check(
      "display_order defaults past the existing maximum",
      (slide?.displayOrder ?? 0) > 3,
      String(slide?.displayOrder),
    );

    // -- Inactive slides stay off the storefront ----------------------------
    console.log("\nActive filter");
    const pub2 = await call<HeroSlide[]>("GET", "/hero-slides");
    check(
      "inactive slide is hidden from the public endpoint",
      !(pub2.json.data ?? []).some((s) => s.id === slide?.id),
    );
    check(
      "inactive slide is visible to the admin endpoint",
      ((await call<HeroSlide[]>("GET", "/hero-slides/all", { token })).json.data ?? []).some(
        (s) => s.id === slide?.id,
      ),
    );

    // -- Update -------------------------------------------------------------
    console.log("\nUpdate");
    const updated = await call<HeroSlide>("PUT", `/hero-slides/${slide!.id}`, {
      token,
      body: { heading: "E2E Updated", isActive: true, displayOrder: 99 },
    });
    check("PUT /hero-slides/:id updates", updated.status === 200, `status ${updated.status}`);
    check("heading changed", updated.json.data?.heading === "E2E Updated");
    check("activation changed", updated.json.data?.isActive === true);
    check("display order changed", updated.json.data?.displayOrder === 99);
    check(
      "activated slide now appears publicly",
      ((await call<HeroSlide[]>("GET", "/hero-slides")).json.data ?? []).some(
        (s) => s.id === slide?.id,
      ),
    );

    // -- Focal point --------------------------------------------------------
    console.log("\nFocal point");
    const focal = await call<HeroSlide>("PUT", `/hero-slides/${slide!.id}`, {
      token,
      body: { objectPosition: "center 25%" },
    });
    check("focal point is editable", focal.status === 200, `status ${focal.status}`);
    check("focal point persisted", focal.json.data?.objectPosition === "center 25%");
    for (const bad of ["url(evil)", "top; background:red", "top\"", "expression(1)", ""]) {
      const res = await call("PUT", `/hero-slides/${slide!.id}`, {
        token,
        body: { objectPosition: bad },
      });
      check(
        `rejects unsafe focal point ${JSON.stringify(bad)}`,
        res.status === 422,
        `status ${res.status}`,
      );
    }

    // -- Validation ---------------------------------------------------------
    console.log("\nValidation");
    const noImage = await call("POST", "/hero-slides", {
      token,
      body: { heading: "No image" },
    });
    check("rejects a slide with no image -> 422", noImage.status === 422, `status ${noImage.status}`);
    const noHeading = await call("POST", "/hero-slides", {
      token,
      body: { imageUrl: "/x.jpg" },
    });
    check("rejects a slide with no heading -> 422", noHeading.status === 422, `status ${noHeading.status}`);
    const badId = await call("PUT", "/hero-slides/not-a-uuid", {
      token,
      body: { heading: "x" },
    });
    check("rejects a malformed id -> 422", badId.status === 422, `status ${badId.status}`);
    const missing = await call("PUT", "/hero-slides/00000000-0000-0000-0000-000000000000", {
      token,
      body: { heading: "x" },
    });
    check("404s an unknown id", missing.status === 404, `status ${missing.status}`);

    // -- Delete -------------------------------------------------------------
    console.log("\nDelete");
    const removed = await call("DELETE", `/hero-slides/${slide!.id}`, { token });
    check("DELETE /hero-slides/:id deletes", removed.status === 200, `status ${removed.status}`);
    if (removed.status === 200) createdIds.pop();
    check(
      "deleted slide is gone from the admin list",
      !((await call<HeroSlide[]>("GET", "/hero-slides/all", { token })).json.data ?? []).some(
        (s) => s.id === slide?.id,
      ),
    );

    // -- The seeded slides survived the whole run ---------------------------
    console.log("\nSeed integrity");
    const final = await call<HeroSlide[]>("GET", "/hero-slides");
    const finalSlides = final.json.data ?? [];
    check("still exactly three active slides", finalSlides.length === 3, `${finalSlides.length}`);
    check(
      "the original hero image is still slide 1",
      finalSlides[0]?.imageUrl === EXISTING_HERO_IMAGE,
      finalSlides[0]?.imageUrl ?? "missing",
    );
    check(
      "both new images are present",
      finalSlides.some((s) => s.imageUrl === "/images/brand/vielinea-hero-2.jpg") &&
        finalSlides.some((s) => s.imageUrl === "/images/brand/vielinea-hero-3.jpg"),
    );
  } finally {
    // Remove anything left behind by a failed run.
    for (const id of createdIds) {
      await call("DELETE", `/hero-slides/${id}`, { token }).catch(() => undefined);
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Passed: ${passed}   Failed: ${failed}`);
  if (failures.length > 0) {
    console.log("\nFailed checks:");
    for (const f of failures) console.log(`  - ${f}`);
  }
  console.log("=".repeat(60));
  if (failed > 0) process.exit(1);
}

main().catch((error: unknown) => {
  console.error(`\nHero slides e2e failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
