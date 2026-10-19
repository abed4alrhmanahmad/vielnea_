/**
 * Chooses the transactional-email adapter from configuration.
 *
 * Selection is by presence rather than by a provider name, because there is
 * only one thing to decide: whether VIELINEA has a mail account at all.
 *
 *   EMAIL_API_KEY set    Resend delivers the message.
 *   EMAIL_API_KEY unset  Nothing is sent and a line is logged. Checkout is
 *                        unaffected — notifications are not part of ordering.
 *
 * Adding a different provider: write an adapter implementing EmailProvider and
 * return it from `resolve` below. See backend/README.md for the variables.
 */
import { env } from "../../config/env.js";
import { createResendProvider } from "./resend.provider.js";
import { disabledEmailProvider } from "./disabled.provider.js";
import type { EmailProvider } from "./provider.js";

function resolve(): EmailProvider {
  if (env.EMAIL_API_KEY) {
    return createResendProvider(env.EMAIL_API_KEY);
  }
  return disabledEmailProvider;
}

let cached: EmailProvider | null = null;

export function emailProvider(): EmailProvider {
  cached ??= resolve();
  return cached;
}

export * from "./provider.js";
