/**
 * End-to-end test for the About page company timeline against the live
 * Supabase database and a running API.
 *
 * Covers the public read contract, the admin lifecycle (create, read, update,
 * reorder, delete), authorisation, validation, optional images, and the two
 * guarantees that matter most:
 *
 *   - disabling the feature hides the section but keeps every entry, and
 *   - re-enabling brings all of them back unchanged.
 *
 * Cleanup: every entry this creates is deleted afterwards, and the feature is
 * restored to whatever state it was in when the run started.
 */
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

interface TimelineEntry {
  id: string;
  year: string;
  title: string;
  description: string;
  imageUrl: string | null;
  displayOrder: number;
  isActive: boolean;
}

interface TimelinePayload {
  enabled: boolean;
  section: {
    sectionId: string | null;
    title: string | null;
    subtitle: string | null;
    content: string | null;
  };
  entries: TimelineEntry[];
}

interface SitePage {
  slug: string;
  sections: Array<{ sectionKey: string; isVisible: boolean }>;
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

/** Flips the feature through the same CMS endpoint the admin panel uses. */
async function setEnabled(token: string, sectionId: string, enabled: boolean) {
  return call("PUT", `/admin/site/sections/${sectionId}`, {
    token,
    body: { isVisible: enabled },
  });
}

async function main(): Promise<void> {
  console.log("\nCompany timeline — end-to-end\n");

  const token = await adminToken();
  const createdIds: string[] = [];

  const initial = await call<TimelinePayload>("GET", "/company-timeline/all", { token });
  const sectionId = initial.json.data?.section?.sectionId ?? null;
  const wasEnabled = initial.json.data?.enabled ?? true;
  const originalHeader = {
    subtitle: initial.json.data?.section?.subtitle ?? null,
    title: initial.json.data?.section?.title ?? null,
    content: initial.json.data?.section?.content ?? null,
  };
  if (!sectionId) throw new Error("The about page has no `timeline` section — run npm run db:migrate");

  try {
    // -- Public read --------------------------------------------------------
    console.log("Public read");
    const pub = await call<TimelinePayload>("GET", "/company-timeline");
    check("GET /company-timeline is public", pub.status === 200, `status ${pub.status}`);
    check("reports the feature state", typeof pub.json.data?.enabled === "boolean");
    check("returns entries", (pub.json.data?.entries ?? []).length > 0);
    check(
      "sorted by display_order ascending",
      (pub.json.data?.entries ?? []).every(
        (e, i, a) => i === 0 || a[i - 1]!.displayOrder <= e.displayOrder,
      ),
    );
    check("every entry returned is active", (pub.json.data?.entries ?? []).every((e) => e.isActive));

    // -- Authorisation ------------------------------------------------------
    console.log("\nAuthorisation");
    for (const [method, path] of [
      ["GET", "/company-timeline/all"],
      ["POST", "/company-timeline"],
      ["PUT", "/company-timeline/00000000-0000-0000-0000-000000000000"],
      ["DELETE", "/company-timeline/00000000-0000-0000-0000-000000000000"],
    ] as const) {
      const res = await call(method, path, method === "GET" ? {} : { body: { title: "x" } });
      check(`${method} ${path} rejects anonymous`, res.status === 401, `status ${res.status}`);
    }

    // -- Create, including an entry with no image ---------------------------
    console.log("\nCreate");
    const created = await call<TimelineEntry>("POST", "/company-timeline", {
      token,
      body: { year: "2031", title: "E2E Milestone", description: "Created by the e2e test." },
    });
    check("POST creates an entry", created.status === 201, `status ${created.status}`);
    const entry = created.json.data;
    if (entry?.id) createdIds.push(entry.id);
    check("image is optional and defaults to null", entry?.imageUrl === null, String(entry?.imageUrl));
    check("entry is active by default", entry?.isActive === true);

    const withImage = await call<TimelineEntry>("POST", "/company-timeline", {
      token,
      body: {
        year: "2032",
        title: "E2E With Image",
        imageUrl: "/images/brand/vielinea-hero.jpg",
        isActive: false,
      },
    });
    if (withImage.json.data?.id) createdIds.push(withImage.json.data.id);
    check("an entry can carry an image", withImage.json.data?.imageUrl === "/images/brand/vielinea-hero.jpg");

    // -- Individual entry visibility ----------------------------------------
    console.log("\nPer-entry visibility");
    const pubAfter = await call<TimelinePayload>("GET", "/company-timeline");
    check(
      "inactive entry is hidden from the public read",
      !(pubAfter.json.data?.entries ?? []).some((e) => e.id === withImage.json.data?.id),
    );
    const adminAfter = await call<TimelinePayload>("GET", "/company-timeline/all", { token });
    check(
      "inactive entry is visible to the admin read",
      (adminAfter.json.data?.entries ?? []).some((e) => e.id === withImage.json.data?.id),
    );

    // -- Update -------------------------------------------------------------
    console.log("\nUpdate");
    const updated = await call<TimelineEntry>("PUT", `/company-timeline/${entry!.id}`, {
      token,
      body: { year: "2033", title: "E2E Updated", displayOrder: 97 },
    });
    check("PUT updates an entry", updated.status === 200, `status ${updated.status}`);
    check("year changed", updated.json.data?.year === "2033");
    check("title changed", updated.json.data?.title === "E2E Updated");
    check("display order changed", updated.json.data?.displayOrder === 97);

    // -- Section header -----------------------------------------------------
    // Eyebrow / heading / description live on the same CMS section as the
    // feature switch, and are edited through the same existing endpoint.
    console.log("\nSection header");
    const beforeHeader = await call<TimelinePayload>("GET", "/company-timeline");
    check(
      "public read carries the header copy",
      typeof beforeHeader.json.data?.section?.subtitle === "string" &&
        typeof beforeHeader.json.data?.section?.title === "string",
    );

    const NEW_HEADER = {
      subtitle: "E2E Heritage",
      title: "E2E Story Behind VIELINEA",
      content: "E2E description of the journey.",
    };
    const savedHeader = await call("PUT", `/admin/site/sections/${sectionId}`, {
      token,
      body: NEW_HEADER,
    });
    check("admin can save the header", savedHeader.status === 200, `status ${savedHeader.status}`);

    const afterHeader = await call<TimelinePayload>("GET", "/company-timeline");
    check("eyebrow is editable", afterHeader.json.data?.section?.subtitle === NEW_HEADER.subtitle);
    check("heading is editable", afterHeader.json.data?.section?.title === NEW_HEADER.title);
    check("description is editable", afterHeader.json.data?.section?.content === NEW_HEADER.content);
    check(
      "editing the header leaves the entries untouched",
      afterHeader.json.data.entries.length === beforeHeader.json.data.entries.length,
    );

    // -- The feature switch: the central guarantee --------------------------
    console.log("\nFeature switch");
    const countBefore = (await call<TimelinePayload>("GET", "/company-timeline/all", { token })).json
      .data.entries.length;

    const off = await setEnabled(token, sectionId, false);
    check("feature can be disabled", off.status === 200, `status ${off.status}`);

    const whenOff = await call<TimelinePayload>("GET", "/company-timeline");
    check("public read reports disabled", whenOff.json.data?.enabled === false);
    check("public read serves no entries when disabled", whenOff.json.data?.entries.length === 0);
    check(
      "withholds the heading copy when disabled",
      whenOff.json.data?.section?.title === null && whenOff.json.data?.section?.subtitle === null,
    );

    // The About page renders from the CMS too; the section must be gone there.
    const aboutOff = await call<SitePage>("GET", "/site/pages/about");
    check(
      "the timeline section disappears from the About page payload",
      !(aboutOff.json.data?.sections ?? []).some((s) => s.sectionKey === "timeline"),
    );

    const countWhileOff = (await call<TimelinePayload>("GET", "/company-timeline/all", { token }))
      .json.data.entries.length;
    check(
      "disabling deletes nothing — every entry survives",
      countWhileOff === countBefore,
      `${countWhileOff} of ${countBefore}`,
    );

    const on = await setEnabled(token, sectionId, true);
    check("feature can be re-enabled", on.status === 200, `status ${on.status}`);
    const whenOn = await call<TimelinePayload>("GET", "/company-timeline");
    check("public read reports enabled again", whenOn.json.data?.enabled === true);
    check("entries come back after re-enabling", whenOn.json.data.entries.length > 0);
    const aboutOn = await call<SitePage>("GET", "/site/pages/about");
    check(
      "the timeline section returns to the About page payload",
      (aboutOn.json.data?.sections ?? []).some((s) => s.sectionKey === "timeline"),
    );

    // -- Validation ---------------------------------------------------------
    console.log("\nValidation");
    const noYear = await call("POST", "/company-timeline", { token, body: { title: "No year" } });
    check("rejects an entry with no year -> 422", noYear.status === 422, `status ${noYear.status}`);
    const noTitle = await call("POST", "/company-timeline", { token, body: { year: "2030" } });
    check("rejects an entry with no title -> 422", noTitle.status === 422, `status ${noTitle.status}`);
    const badId = await call("PUT", "/company-timeline/not-a-uuid", { token, body: { year: "x" } });
    check("rejects a malformed id -> 422", badId.status === 422, `status ${badId.status}`);
    const missing = await call("PUT", "/company-timeline/00000000-0000-0000-0000-000000000000", {
      token,
      body: { year: "2030" },
    });
    check("404s an unknown id", missing.status === 404, `status ${missing.status}`);

    // -- Delete -------------------------------------------------------------
    console.log("\nDelete");
    const removed = await call("DELETE", `/company-timeline/${entry!.id}`, { token });
    check("DELETE removes an entry", removed.status === 200, `status ${removed.status}`);
    if (removed.status === 200) createdIds.splice(createdIds.indexOf(entry!.id), 1);
    check(
      "deleted entry is gone from the admin list",
      !(
        (await call<TimelinePayload>("GET", "/company-timeline/all", { token })).json.data.entries
      ).some((e) => e.id === entry!.id),
    );

    // -- Scope: About page only ---------------------------------------------
    console.log("\nScope");
    const home = await call<SitePage>("GET", "/site/pages/home");
    check(
      "no timeline section on the home page",
      !(home.json.data?.sections ?? []).some((s) => s.sectionKey === "timeline"),
    );
  } finally {
    for (const id of createdIds) {
      await call("DELETE", `/company-timeline/${id}`, { token }).catch(() => undefined);
    }
    await call("PUT", `/admin/site/sections/${sectionId}`, {
      token,
      body: originalHeader,
    }).catch(() => undefined);
    await setEnabled(token, sectionId, wasEnabled).catch(() => undefined);
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
  console.error(`\nCompany timeline e2e failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
