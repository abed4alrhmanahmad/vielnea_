/**
 * End-to-end test for the admin-managed FAQ against the live Supabase
 * database and a running API.
 *
 * Covers the public read contract, the admin lifecycle (create, read, update,
 * reorder, delete), authorisation, validation, per-question visibility, the
 * editable section header, and the section-level switch — including that
 * disabling hides the FAQ without deleting a single row.
 *
 * Cleanup: every FAQ this creates is deleted afterwards, and the section's
 * header and enabled state are restored to what they were at the start.
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

interface Faq {
  id: string;
  question: string;
  answer: string;
  displayOrder: number;
  isActive: boolean;
}

interface FaqPayload {
  enabled: boolean;
  section: {
    sectionId: string | null;
    title: string | null;
    subtitle: string | null;
    content: string | null;
  };
  faqs: Faq[];
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

/** Flips the section through the same CMS endpoint the admin panel uses. */
async function setEnabled(token: string, sectionId: string, enabled: boolean) {
  return call("PUT", `/admin/site/sections/${sectionId}`, {
    token,
    body: { isVisible: enabled },
  });
}

async function main(): Promise<void> {
  console.log("\nFAQ — end-to-end\n");

  const token = await adminToken();
  const createdIds: string[] = [];

  const initial = await call<FaqPayload>("GET", "/faqs/all", { token });
  const sectionId = initial.json.data?.section?.sectionId ?? null;
  const wasEnabled = initial.json.data?.enabled ?? true;
  if (!sectionId) throw new Error("No `faq` CMS section — run npm run db:migrate");
  const originalHeader = {
    subtitle: initial.json.data?.section?.subtitle ?? null,
    title: initial.json.data?.section?.title ?? null,
    content: initial.json.data?.section?.content ?? null,
  };

  try {
    // -- Public read --------------------------------------------------------
    console.log("Public read");
    const pub = await call<FaqPayload>("GET", "/faqs");
    check("GET /faqs is public", pub.status === 200, `status ${pub.status}`);
    check("reports the section state", typeof pub.json.data?.enabled === "boolean");
    check("returns the seeded questions", (pub.json.data?.faqs ?? []).length >= 7, `${pub.json.data?.faqs.length}`);
    check(
      "sorted by display_order ascending",
      (pub.json.data?.faqs ?? []).every((f, i, a) => i === 0 || a[i - 1]!.displayOrder <= f.displayOrder),
    );
    check("every question returned is active", (pub.json.data?.faqs ?? []).every((f) => f.isActive));
    check(
      "the existing copy was migrated verbatim",
      (pub.json.data?.faqs ?? []).some((f) => f.question === "How long does shipping take?"),
    );
    check("header copy is served", typeof pub.json.data?.section?.title === "string");

    // -- Authorisation ------------------------------------------------------
    console.log("\nAuthorisation");
    for (const [method, path] of [
      ["GET", "/faqs/all"],
      ["POST", "/faqs"],
      ["PUT", "/faqs/00000000-0000-0000-0000-000000000000"],
      ["DELETE", "/faqs/00000000-0000-0000-0000-000000000000"],
    ] as const) {
      const res = await call(method, path, method === "GET" ? {} : { body: { question: "x" } });
      check(`${method} ${path} rejects anonymous`, res.status === 401, `status ${res.status}`);
    }

    // -- Create -------------------------------------------------------------
    console.log("\nCreate");
    const created = await call<Faq>("POST", "/faqs", {
      token,
      body: {
        question: "What payment methods do you accept?",
        answer: "We accept the available payment methods shown during checkout.",
      },
    });
    check("POST creates a FAQ", created.status === 201, `status ${created.status}`);
    const faq = created.json.data;
    if (faq?.id) createdIds.push(faq.id);
    check("new FAQ is active by default", faq?.isActive === true);
    check(
      "display_order defaults past the existing maximum",
      (faq?.displayOrder ?? 0) > 8,
      String(faq?.displayOrder),
    );
    check(
      "a newly added question appears publicly with no code change",
      ((await call<FaqPayload>("GET", "/faqs")).json.data?.faqs ?? []).some((f) => f.id === faq?.id),
    );

    // -- Per-question visibility --------------------------------------------
    console.log("\nPer-question visibility");
    await call("PUT", `/faqs/${faq!.id}`, { token, body: { isActive: false } });
    check(
      "inactive question is hidden from the public read",
      !((await call<FaqPayload>("GET", "/faqs")).json.data?.faqs ?? []).some((f) => f.id === faq?.id),
    );
    check(
      "inactive question is still visible to the admin read",
      ((await call<FaqPayload>("GET", "/faqs/all", { token })).json.data?.faqs ?? []).some(
        (f) => f.id === faq?.id,
      ),
    );
    await call("PUT", `/faqs/${faq!.id}`, { token, body: { isActive: true } });
    check(
      "re-activating brings it back publicly",
      ((await call<FaqPayload>("GET", "/faqs")).json.data?.faqs ?? []).some((f) => f.id === faq?.id),
    );

    // -- Update -------------------------------------------------------------
    console.log("\nUpdate");
    const updated = await call<Faq>("PUT", `/faqs/${faq!.id}`, {
      token,
      body: { question: "E2E Updated question", answer: "E2E updated answer.", displayOrder: 96 },
    });
    check("PUT updates a FAQ", updated.status === 200, `status ${updated.status}`);
    check("question changed", updated.json.data?.question === "E2E Updated question");
    check("answer changed", updated.json.data?.answer === "E2E updated answer.");
    check("display order changed", updated.json.data?.displayOrder === 96);

    // -- Section header -----------------------------------------------------
    console.log("\nSection header");
    const NEW_HEADER = {
      subtitle: "E2E Help",
      title: "E2E Questions & Answers",
      content: "E2E description of the FAQ.",
    };
    const savedHeader = await call("PUT", `/admin/site/sections/${sectionId}`, {
      token,
      body: NEW_HEADER,
    });
    check("admin can save the header", savedHeader.status === 200, `status ${savedHeader.status}`);
    const afterHeader = await call<FaqPayload>("GET", "/faqs");
    check("eyebrow is editable", afterHeader.json.data?.section?.subtitle === NEW_HEADER.subtitle);
    check("heading is editable", afterHeader.json.data?.section?.title === NEW_HEADER.title);
    check("description is editable", afterHeader.json.data?.section?.content === NEW_HEADER.content);

    // -- The section switch --------------------------------------------------
    console.log("\nSection switch");
    const countBefore = (await call<FaqPayload>("GET", "/faqs/all", { token })).json.data.faqs.length;

    const off = await setEnabled(token, sectionId, false);
    check("section can be disabled", off.status === 200, `status ${off.status}`);
    const whenOff = await call<FaqPayload>("GET", "/faqs");
    check("public read reports disabled", whenOff.json.data?.enabled === false);
    check("public read serves no questions when disabled", whenOff.json.data?.faqs.length === 0);
    check(
      "withholds the header copy when disabled",
      whenOff.json.data?.section?.title === null && whenOff.json.data?.section?.subtitle === null,
    );
    const countWhileOff = (await call<FaqPayload>("GET", "/faqs/all", { token })).json.data.faqs
      .length;
    check(
      "disabling deletes nothing — every question survives",
      countWhileOff === countBefore,
      `${countWhileOff} of ${countBefore}`,
    );

    const on = await setEnabled(token, sectionId, true);
    check("section can be re-enabled", on.status === 200, `status ${on.status}`);
    const whenOn = await call<FaqPayload>("GET", "/faqs");
    check("public read reports enabled again", whenOn.json.data?.enabled === true);
    check("questions come back after re-enabling", whenOn.json.data.faqs.length > 0);

    // -- Validation ---------------------------------------------------------
    console.log("\nValidation");
    const noQuestion = await call("POST", "/faqs", { token, body: { answer: "orphan" } });
    check("rejects a FAQ with no question -> 422", noQuestion.status === 422, `status ${noQuestion.status}`);
    const badId = await call("PUT", "/faqs/not-a-uuid", { token, body: { question: "x" } });
    check("rejects a malformed id -> 422", badId.status === 422, `status ${badId.status}`);
    const missing = await call("PUT", "/faqs/00000000-0000-0000-0000-000000000000", {
      token,
      body: { question: "x" },
    });
    check("404s an unknown id", missing.status === 404, `status ${missing.status}`);

    // -- Delete -------------------------------------------------------------
    console.log("\nDelete");
    const removed = await call("DELETE", `/faqs/${faq!.id}`, { token });
    check("DELETE removes a FAQ", removed.status === 200, `status ${removed.status}`);
    if (removed.status === 200) createdIds.splice(createdIds.indexOf(faq!.id), 1);
    check(
      "deleted FAQ is gone from the admin list",
      !((await call<FaqPayload>("GET", "/faqs/all", { token })).json.data.faqs).some(
        (f) => f.id === faq!.id,
      ),
    );

    // -- The seeded questions survived the whole run -------------------------
    console.log("\nSeed integrity");
    const final = await call<FaqPayload>("GET", "/faqs");
    check("still seven seeded questions", final.json.data.faqs.length === 7, `${final.json.data.faqs.length}`);
  } finally {
    for (const id of createdIds) {
      await call("DELETE", `/faqs/${id}`, { token }).catch(() => undefined);
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
  console.error(`\nFAQ e2e failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
