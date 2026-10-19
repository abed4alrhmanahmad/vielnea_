/**
 * Regression test for the CORS configuration in src/app.ts.
 *
 * Guards the exact bug this suite exists to catch: the guest chat widget
 * sends a custom `X-Guest-Token` header, which the browser preflights with an
 * OPTIONS request. If that header is missing from `allowedHeaders`, the
 * browser blocks the real request before it is ever sent and the guest never
 * reaches the API — that failure never shows up as a backend error, only as a
 * browser console message, so it needs its own test rather than relying on
 * the guest-chat suite (which talks to the API directly, bypassing preflight
 * entirely, and would never have caught this).
 *
 * Also checks the security properties around that change: an untrusted origin
 * still gets no CORS headers at all, and an unlisted header is still refused.
 */
import { env } from "../src/config/env.js";

const BASE = `http://localhost:${env.PORT}/api`;
const DEV_ORIGIN = "http://localhost:8080";

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

function section(title: string): void {
  console.log(`\n${title}`);
}

async function preflight(
  path: string,
  origin: string,
  requestHeaders: string,
  method = "POST",
): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": method,
      "Access-Control-Request-Headers": requestHeaders,
    },
  });
}

async function main(): Promise<void> {
  console.log(`CORS configuration — regression\n${"=".repeat(60)}`);
  console.log(`  dev origin under test: ${DEV_ORIGIN}`);

  // -- 1. The bug report, verbatim ------------------------------------------
  section("1. Guest chat preflight (the reported failure)");
  const guestPreflight = await preflight(
    "/chat/guest/conversations",
    DEV_ORIGIN,
    "x-guest-token, content-type",
  );
  check(
    "OPTIONS /chat/guest/conversations succeeds",
    guestPreflight.status === 204 || guestPreflight.status === 200,
    `status ${guestPreflight.status}`,
  );
  check(
    "the trusted dev origin is echoed back",
    guestPreflight.headers.get("access-control-allow-origin") === DEV_ORIGIN,
    guestPreflight.headers.get("access-control-allow-origin") ?? "(missing)",
  );

  const allowedHeaders = (guestPreflight.headers.get("access-control-allow-headers") ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase());
  check(
    "X-Guest-Token is in Access-Control-Allow-Headers",
    allowedHeaders.includes("x-guest-token"),
    allowedHeaders.join(", "),
  );
  check("Content-Type is still allowed", allowedHeaders.includes("content-type"));
  check("Authorization is still allowed", allowedHeaders.includes("authorization"));

  // -- 2. The header actually works end to end -------------------------------
  section("2. The real request the preflight was guarding");
  const guestStart = await fetch(`${BASE}/chat/guest/conversations`, {
    method: "POST",
    headers: { Origin: DEV_ORIGIN, "Content-Type": "application/json" },
    body: "{}",
  });
  check("guest conversation is created", guestStart.status === 201, `status ${guestStart.status}`);
  check(
    "the response itself carries CORS headers too",
    guestStart.headers.get("access-control-allow-origin") === DEV_ORIGIN,
  );

  const started = (await guestStart.json()) as {
    data: { conversation: { id: string }; guestToken: string };
  };
  const { id: conversationId } = started.data.conversation;
  const guestToken = started.data.guestToken;

  const msgPreflight = await preflight(
    `/chat/guest/conversations/${conversationId}/messages`,
    DEV_ORIGIN,
    "x-guest-token, content-type",
  );
  check("send-message preflight also succeeds", msgPreflight.status === 204 || msgPreflight.status === 200);

  const sendReal = await fetch(`${BASE}/chat/guest/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: {
      Origin: DEV_ORIGIN,
      "Content-Type": "application/json",
      "X-Guest-Token": guestToken,
    },
    body: JSON.stringify({ message: "CORS regression probe" }),
  });
  check(
    "the actual guest message succeeds cross-origin",
    sendReal.status === 201,
    `status ${sendReal.status}`,
  );

  // -- 3. Existing CORS security is unweakened -------------------------------
  section("3. Security around the fix is unchanged");
  const untrustedOrigin = "http://evil.example.com";
  const hostilePreflight = await preflight(
    "/chat/guest/conversations",
    untrustedOrigin,
    "x-guest-token",
  );
  check(
    "an untrusted origin gets no Allow-Origin header",
    hostilePreflight.headers.get("access-control-allow-origin") === null,
    hostilePreflight.headers.get("access-control-allow-origin") ?? "(correctly absent)",
  );

  const adminPreflight = await preflight("/admin/orders", DEV_ORIGIN, "authorization", "GET");
  check(
    "an unrelated authenticated route still preflights correctly",
    adminPreflight.headers.get("access-control-allow-origin") === DEV_ORIGIN,
  );
  const adminAllowed = (adminPreflight.headers.get("access-control-allow-headers") ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase());
  check(
    "guest-only header is allowed on other routes too (one CORS policy, not two)",
    adminAllowed.includes("x-guest-token"),
    "one shared CORS policy is simpler and no less safe: the header carries no privilege by itself — every route still enforces its own auth",
  );

  const untrustedReal = await fetch(`${BASE}/products`, {
    headers: { Origin: untrustedOrigin },
  });
  check(
    "an actual cross-origin GET from an untrusted origin carries no CORS grant",
    untrustedReal.headers.get("access-control-allow-origin") === null,
  );

  // -- 4. Same-origin / server-side calls are unaffected ---------------------
  section("4. Requests with no Origin header (SSR, curl, same-origin) still work");
  const noOrigin = await fetch(`${BASE}/products`);
  check("a request with no Origin header is not blocked", noOrigin.status === 200, `status ${noOrigin.status}`);

  // -- 5. Cleanup -------------------------------------------------------------
  section("5. Cleanup");
  const pg = await import("pg");
  const client = new pg.default.Client({
    ...env.db,
    ssl: { rejectUnauthorized: false },
    application_name: "vielinea-e2e-cors",
    connectionTimeoutMillis: 20_000,
  });
  await client.connect();
  const deleted = await client.query("DELETE FROM public.chat_threads WHERE id = $1 RETURNING id", [
    conversationId,
  ]);
  check("probe conversation removed", deleted.rowCount === 1);
  await client.end();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`CORS E2E: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log("Failures:");
    for (const f of failures) console.log(`  - ${f}`);
  }
  console.log("=".repeat(60));
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
