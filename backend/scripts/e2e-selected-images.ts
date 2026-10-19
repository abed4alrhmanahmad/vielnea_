/**
 * End-to-end test for the homepage Instagram marquee's selected images,
 * against the live Supabase database and a running API.
 *
 * The behaviour this exists to protect is section 3 of the feature spec:
 *
 *   ONE RECORD IS ONE IMAGE, NOT ONE INSTAGRAM POST.
 *
 * Several records routinely carry the same instagram_url, because the owner
 * picked more than one picture out of the same carousel. Nothing may group,
 * merge or de-duplicate them, and the URL must never become unique. The
 * "same Instagram URL" block below is the regression guard for that.
 *
 * Also covers the public read contract (active only, ordered), the full admin
 * lifecycle, authorisation on every management route, and Instagram URL
 * validation including the unsafe-protocol cases.
 *
 * Cleanup: every record this creates is deleted afterwards. Rows the admin
 * created through the panel are never touched.
 */
import { env } from "../src/config/env.js";

const BASE = `http://localhost:${env.PORT}/api`;

/** Marks rows this test owns, so cleanup can never touch a real one. */
const PROBE_IMAGE = "/images/e2e-selected-image-probe.jpg";
const POST_A = "https://www.instagram.com/p/E2E_POST_A/";
const POST_B = "https://www.instagram.com/p/E2E_POST_B/";

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

interface SelectedImage {
  id: string;
  imageUrl: string;
  /** null when the admin left it blank — the tile then opens the homepage. */
  instagramUrl: string | null;
  displayOrder: number;
  isActive: boolean;
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
  if (!token) throw new Error("Could not sign in as admin — check ADMIN_EMAIL / ADMIN_PASSWORD");
  return token;
}

async function main(): Promise<void> {
  const token = await adminToken();
  const created: string[] = [];

  const add = async (body: Record<string, unknown>) => {
    const res = await call<SelectedImage>("POST", "/selected-images", { body, token });
    if (res.json.data?.id) created.push(res.json.data.id);
    return res;
  };

  try {
    console.log("\n=== 1. AUTHORISATION ===");
    {
      const anonAll = await call("GET", "/selected-images/all");
      check("anonymous GET /all -> 401", anonAll.status === 401, String(anonAll.status));

      const anonCreate = await call("POST", "/selected-images", {
        body: { imageUrl: PROBE_IMAGE, instagramUrl: POST_A },
      });
      check("anonymous create -> 401", anonCreate.status === 401, String(anonCreate.status));

      const anonPublic = await call<SelectedImage[]>("GET", "/selected-images");
      check("anonymous public read -> 200", anonPublic.status === 200, String(anonPublic.status));
    }

    console.log("\n=== 2. ONE IMAGE = ONE RECORD (the core requirement) ===");
    {
      // Three different pictures the owner chose out of ONE Instagram carousel,
      // plus one from a second post. This is the exact shape of the spec's
      // worked example.
      const a = await add({ imageUrl: `${PROBE_IMAGE}#a`, instagramUrl: POST_A, displayOrder: 901 });
      const b = await add({ imageUrl: `${PROBE_IMAGE}#b`, instagramUrl: POST_A, displayOrder: 902 });
      const c = await add({ imageUrl: `${PROBE_IMAGE}#c`, instagramUrl: POST_A, displayOrder: 903 });
      const d = await add({ imageUrl: `${PROBE_IMAGE}#d`, instagramUrl: POST_B, displayOrder: 904 });

      check("image 1 with POST_A created", a.status === 201, String(a.status));
      check(
        "image 2 with the SAME POST_A created",
        b.status === 201,
        `${b.status} ${b.json.message ?? ""}`,
      );
      check(
        "image 3 with the SAME POST_A created",
        c.status === 201,
        `${c.status} ${c.json.message ?? ""}`,
      );
      check("image 4 with POST_B created", d.status === 201, String(d.status));

      const ids = new Set([a, b, c, d].map((r) => r.json.data?.id));
      check("all four are independent records with distinct ids", ids.size === 4, `${ids.size} ids`);

      const all = await call<SelectedImage[]>("GET", "/selected-images/all", { token });
      const mine = (all.json.data ?? []).filter((r) => r.imageUrl.startsWith(PROBE_IMAGE));
      check("all four are returned, not merged", mine.length === 4, `${mine.length} rows`);

      const postA = mine.filter((r) => r.instagramUrl === POST_A);
      check("three rows still share POST_A", postA.length === 3, `${postA.length} rows`);
      check(
        "each keeps its own image",
        new Set(postA.map((r) => r.imageUrl)).size === 3,
        postA.map((r) => r.imageUrl.slice(-2)).join(" "),
      );
    }

    console.log("\n=== 3. PUBLIC READ: ACTIVE ONLY, ORDERED ===");
    {
      // Mirrors the spec's example: hide one, give them out-of-sequence orders,
      // and the public endpoint must sort and filter server-side.
      const all = await call<SelectedImage[]>("GET", "/selected-images/all", { token });
      const mine = (all.json.data ?? []).filter((r) => r.imageUrl.startsWith(PROBE_IMAGE));
      const byTag = (tag: string) => mine.find((r) => r.imageUrl.endsWith(tag))!;

      await call("PUT", `/selected-images/${byTag("#a").id}`, {
        body: { displayOrder: 903 },
        token,
      });
      await call("PUT", `/selected-images/${byTag("#b").id}`, {
        body: { isActive: false, displayOrder: 901 },
        token,
      });
      await call("PUT", `/selected-images/${byTag("#c").id}`, {
        body: { displayOrder: 902 },
        token,
      });
      await call("PUT", `/selected-images/${byTag("#d").id}`, {
        body: { displayOrder: 901 },
        token,
      });

      const pub = await call<SelectedImage[]>("GET", "/selected-images");
      const minePub = (pub.json.data ?? []).filter((r) => r.imageUrl.startsWith(PROBE_IMAGE));

      check(
        "the inactive image is not returned publicly",
        !minePub.some((r) => r.id === byTag("#b").id),
        `${minePub.length} public rows`,
      );
      check("the other three are returned", minePub.length === 3, `${minePub.length} rows`);
      check(
        "returned in display_order",
        minePub.map((r) => r.imageUrl.slice(-1)).join("") === "dca",
        minePub.map((r) => `${r.imageUrl.slice(-1)}:${r.displayOrder}`).join(" "),
      );
      check(
        "every public row is active",
        minePub.every((r) => r.isActive),
      );

      // Switch it back on: toggling is_active must be reversible.
      await call("PUT", `/selected-images/${byTag("#b").id}`, { body: { isActive: true }, token });
      const pub2 = await call<SelectedImage[]>("GET", "/selected-images");
      check(
        "re-activating brings it back publicly",
        (pub2.json.data ?? []).some((r) => r.id === byTag("#b").id),
      );
    }

    console.log("\n=== 4. INSTAGRAM URL VALIDATION ===");
    {
      const reject = async (label: string, instagramUrl: string) => {
        const res = await call("POST", "/selected-images", {
          body: { imageUrl: PROBE_IMAGE, instagramUrl },
          token,
        });
        // A rejection must not leave a row behind.
        const id = (res.json.data as SelectedImage | undefined)?.id;
        if (id) created.push(id);
        check(`rejects ${label}`, res.status === 422 || res.status === 400, String(res.status));
      };

      await reject("javascript:", "javascript:alert(document.cookie)");
      await reject("data:", "data:text/html;base64,PHNjcmlwdD4=");
      await reject("vbscript:", "vbscript:msgbox(1)");
      await reject("file:", "file:///etc/passwd");
      await reject("plain http", "http://www.instagram.com/p/ABC/");
      await reject("a non-Instagram host", "https://evil.example.com/p/ABC/");
      await reject("an Instagram lookalike host", "https://instagram.com.evil.example/p/ABC/");
      await reject("a bare word", "not a url");

      const accept = async (label: string, instagramUrl: string, expectStored?: string) => {
        const res = await add({ imageUrl: PROBE_IMAGE, instagramUrl });
        check(`accepts ${label}`, res.status === 201, `${res.status} ${res.json.message ?? ""}`);
        if (expectStored && res.status === 201) {
          check(
            `  normalised to ${expectStored}`,
            res.json.data?.instagramUrl === expectStored,
            String(res.json.data?.instagramUrl),
          );
        }
      };

      await accept("a www /p/ post", "https://www.instagram.com/p/ABCDEFGHIJK/");
      await accept("a bare-domain /p/ post", "https://instagram.com/p/ABCDEFGHIJK/");
      await accept("a reel", "https://www.instagram.com/reel/ABCDEFGHIJK/");
      await accept("a profile link", "https://www.instagram.com/vielinea/");
      await accept("a share link with tracking params", "https://www.instagram.com/p/ABC/?igsh=xyz");
      await accept(
        "a mixed-case host",
        "https://WWW.Instagram.com/p/ABCDEFGHIJK/",
        "https://www.instagram.com/p/ABCDEFGHIJK/",
      );
    }

    console.log("\n=== 4b. THE INSTAGRAM URL IS OPTIONAL; THE IMAGE IS NOT ===");
    {
      // The picture is what the marquee renders, so it stays mandatory.
      const noImage = await call("POST", "/selected-images", {
        body: { instagramUrl: POST_A },
        token,
      });
      check(
        "creating without an image is rejected",
        noImage.status === 422 || noImage.status === 400,
        String(noImage.status),
      );
      const blankImage = await call("POST", "/selected-images", {
        body: { imageUrl: "   ", instagramUrl: POST_A },
        token,
      });
      check(
        "creating with a blank image is rejected",
        blankImage.status === 422 || blankImage.status === 400,
        String(blankImage.status),
      );

      // The link is not. Every way of saying "no link" must land on null, so
      // the storefront has one condition to test rather than three.
      const omitted = await add({ imageUrl: `${PROBE_IMAGE}#nolink-omitted` });
      check("creating with NO instagramUrl key succeeds", omitted.status === 201, String(omitted.status));
      check("  stored as null", omitted.json.data?.instagramUrl === null, String(omitted.json.data?.instagramUrl));

      const empty = await add({ imageUrl: `${PROBE_IMAGE}#nolink-empty`, instagramUrl: "" });
      check("creating with an empty instagramUrl succeeds", empty.status === 201, String(empty.status));
      check("  stored as null", empty.json.data?.instagramUrl === null, String(empty.json.data?.instagramUrl));

      const spaces = await add({ imageUrl: `${PROBE_IMAGE}#nolink-spaces`, instagramUrl: "   " });
      check("creating with whitespace succeeds", spaces.status === 201, String(spaces.status));
      check("  stored as null", spaces.json.data?.instagramUrl === null, String(spaces.json.data?.instagramUrl));

      const explicitNull = await add({ imageUrl: `${PROBE_IMAGE}#nolink-null`, instagramUrl: null });
      check("creating with explicit null succeeds", explicitNull.status === 201, String(explicitNull.status));
      check("  stored as null", explicitNull.json.data?.instagramUrl === null, String(explicitNull.json.data?.instagramUrl));

      // A linkless image must still reach the storefront — it is the homepage
      // fallback case, not a hidden row.
      const pub = await call<SelectedImage[]>("GET", "/selected-images");
      const linkless = (pub.json.data ?? []).filter(
        (r) => r.imageUrl.startsWith(PROBE_IMAGE) && r.instagramUrl === null,
      );
      check("linkless images are served to the storefront", linkless.length === 4, `${linkless.length} rows`);
    }

    console.log("\n=== 4c. CLEARING THE URL ON AN EXISTING IMAGE ===");
    {
      const created = await add({ imageUrl: `${PROBE_IMAGE}#clearme`, instagramUrl: POST_A });
      const id = created.json.data!.id;
      check("starts with a link", created.json.data?.instagramUrl === POST_A, String(created.json.data?.instagramUrl));

      const cleared = await call<SelectedImage>("PUT", `/selected-images/${id}`, {
        body: { instagramUrl: "" },
        token,
      });
      check("clearing with an empty string succeeds", cleared.status === 200, String(cleared.status));
      check("  link is now null", cleared.json.data?.instagramUrl === null, String(cleared.json.data?.instagramUrl));

      // And it must be re-addable, so clearing is not one-way.
      const restored = await call<SelectedImage>("PUT", `/selected-images/${id}`, {
        body: { instagramUrl: POST_B },
        token,
      });
      check("a link can be added back", restored.json.data?.instagramUrl === POST_B, String(restored.json.data?.instagramUrl));

      const nulled = await call<SelectedImage>("PUT", `/selected-images/${id}`, {
        body: { instagramUrl: null },
        token,
      });
      check("clearing with explicit null succeeds", nulled.json.data?.instagramUrl === null, String(nulled.json.data?.instagramUrl));

      // Omitting the key must NOT clear it — that is an unrelated edit.
      await call("PUT", `/selected-images/${id}`, { body: { instagramUrl: POST_A }, token });
      const untouched = await call<SelectedImage>("PUT", `/selected-images/${id}`, {
        body: { isActive: true },
        token,
      });
      check(
        "an unrelated edit leaves the link alone",
        untouched.json.data?.instagramUrl === POST_A,
        String(untouched.json.data?.instagramUrl),
      );
    }

    console.log("\n=== 5. UPDATE AND DELETE ===");
    {
      const res = await add({ imageUrl: `${PROBE_IMAGE}#edit`, instagramUrl: POST_A });
      const id = res.json.data!.id;

      const updated = await call<SelectedImage>("PUT", `/selected-images/${id}`, {
        body: { imageUrl: `${PROBE_IMAGE}#replaced`, instagramUrl: POST_B },
        token,
      });
      check("image can be replaced", updated.json.data?.imageUrl.endsWith("#replaced") === true);
      check("instagram URL can be changed", updated.json.data?.instagramUrl === POST_B);

      const badUpdate = await call("PUT", `/selected-images/${id}`, {
        body: { instagramUrl: "javascript:alert(1)" },
        token,
      });
      check(
        "update re-validates the URL",
        badUpdate.status === 422 || badUpdate.status === 400,
        String(badUpdate.status),
      );

      const anonDelete = await call("DELETE", `/selected-images/${id}`);
      check("anonymous delete -> 401", anonDelete.status === 401, String(anonDelete.status));

      const del = await call("DELETE", `/selected-images/${id}`, { token });
      check("admin delete -> 200", del.status === 200, String(del.status));
      created.splice(created.indexOf(id), 1);

      const missing = await call("PUT", `/selected-images/${id}`, {
        body: { isActive: false },
        token,
      });
      check("updating a deleted image -> 404", missing.status === 404, String(missing.status));
    }
  } finally {
    console.log("\n=== CLEANUP ===");
    let removed = 0;
    for (const id of created) {
      const res = await call("DELETE", `/selected-images/${id}`, { token });
      if (res.status === 200) removed += 1;
    }
    const all = await call<SelectedImage[]>("GET", "/selected-images/all", { token });
    const leftovers = (all.json.data ?? []).filter((r) => r.imageUrl.startsWith(PROBE_IMAGE));
    check(
      "no probe rows left behind",
      leftovers.length === 0,
      `removed ${removed}, ${leftovers.length} remain`,
    );
  }

  console.log("\n" + "=".repeat(60));
  console.log(`  ${passed} passed, ${failed} failed`);
  if (failed > 0) console.log(`  Failing: ${failures.join(", ")}`);
  console.log("=".repeat(60) + "\n");
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
