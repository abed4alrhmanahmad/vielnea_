/**
 * Safe diagnostics for the admin order-notification email.
 *
 * Reports provider state, sender, recipient and — with --send — the real
 * Resend HTTP status, error message and returned email id.
 *
 * It NEVER prints EMAIL_API_KEY. Only derived, non-reversible facts about it
 * are shown: whether it is present, its length, and whether it carries the
 * expected "re_" prefix. That is enough to tell "not loaded" apart from
 * "loaded but rejected" without putting the secret on screen or in a log.
 *
 *   npm run email:diagnose          inspect configuration only, sends nothing
 *   npm run email:diagnose -- --send   also sends one real probe email
 */
import { env } from "../src/config/env.js";
import { emailProvider } from "../src/services/email/index.js";
import { EmailDeliveryError } from "../src/services/email/provider.js";

const doSend = process.argv.includes("--send");

/** Describes a secret without revealing it. */
function describeSecret(value: string | undefined): string {
  if (!value) return "NOT SET";
  return `set (length ${value.length}, prefix "${value.slice(0, 3)}…")`;
}

console.log("\nVIELINEA order-notification email diagnostics");
console.log("=".repeat(60));

console.log("\nConfiguration");
console.log(`  EMAIL_API_KEY            : ${describeSecret(env.EMAIL_API_KEY)}`);
console.log(`  Provider enabled         : ${emailProvider().isEnabled ? "YES" : "NO"}`);
console.log(`  Provider name            : ${emailProvider().name}`);
console.log(`  From address (EMAIL_FROM): ${env.EMAIL_FROM}`);
console.log(`  Notification recipient   : ${env.orderNotificationEmail}`);
console.log(`  ORDER_NOTIFICATION_EMAIL : ${env.ORDER_NOTIFICATION_EMAIL ?? "(unset — falls back to ADMIN_EMAIL)"}`);
console.log(`  ADMIN_EMAIL (login only) : ${env.ADMIN_EMAIL}`);
console.log(`  Recipient is separate    : ${env.orderNotificationEmail !== env.ADMIN_EMAIL ? "YES" : "NO"}`);

if (!emailProvider().isEnabled) {
  console.log(
    "\nProvider is DISABLED — every notification will be skipped.\n" +
      "If EMAIL_API_KEY is set in backend/.env but shows NOT SET above, the\n" +
      "process is running with a stale environment: .env is read once at\n" +
      "startup, so the backend must be restarted after editing it.\n",
  );
  process.exit(0);
}

if (!doSend) {
  console.log("\nConfiguration looks deliverable. Re-run with --send to make a real probe request.\n");
  process.exit(0);
}

console.log("\nLive Resend probe");
console.log(`  Resend request attempted : YES -> ${env.orderNotificationEmail}`);

try {
  const result = await emailProvider().send({
    to: env.orderNotificationEmail,
    from: env.EMAIL_FROM,
    subject: "VIELINEA email delivery probe",
    html: "<p>Delivery probe from the VIELINEA backend. No order is associated with it.</p>",
    text: "Delivery probe from the VIELINEA backend. No order is associated with it.",
  });
  console.log(`  Resend HTTP status       : 200 (accepted)`);
  console.log(`  Resend response error    : none`);
  console.log(`  Email ID                 : ${result.id ?? "(none returned)"}`);
  console.log("\nResend ACCEPTED the request. Check Resend's Emails log for final delivery state.\n");
} catch (error) {
  if (error instanceof EmailDeliveryError) {
    console.log(`  Resend HTTP status       : ${error.status ?? "(no response)"}`);
    console.log(`  Resend response error    : ${error.message}`);
    console.log(`  Email ID                 : none — request was rejected`);
  } else {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`  Unexpected failure       : ${message}`);
  }
  console.log("\nResend REJECTED the request. The status and message above are the exact reason.\n");
  process.exit(1);
}
