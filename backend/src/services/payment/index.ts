/**
 * Chooses the card-payment provider from configuration.
 *
 * `PAYMENT_PROVIDER` selects the adapter:
 *
 *   unconfigured  Card payment is refused with a 503. This is the default and
 *                 the only permitted value in production, because VIELINEA has
 *                 no processor account. It is the honest answer: no provider,
 *                 no charge, no order marked paid.
 *
 *   sandbox       A local stand-in for development and the test suite. It
 *                 approves and declines from the industry-standard test card
 *                 numbers so the whole checkout path can be exercised without
 *                 a processor. It moves no money and refuses to load in
 *                 production.
 *
 * Adding a real processor: write an adapter implementing CardPaymentProvider,
 * register it in `resolve` below, and set PAYMENT_PROVIDER plus that
 * provider's credentials. See backend/README.md for the exact variables.
 */
import { env } from "../../config/env.js";
import { sandboxCardProvider } from "./sandbox.provider.js";
import { unconfiguredCardProvider } from "./unconfigured.provider.js";
import type { CardPaymentProvider } from "./provider.js";

function resolve(): CardPaymentProvider {
  const choice = env.PAYMENT_PROVIDER;

  if (choice === "sandbox") {
    // A stand-in that approves test cards must never run where a customer
    // could mistake it for a real charge.
    if (env.isProduction) {
      throw new Error(
        "PAYMENT_PROVIDER=sandbox is refused in production. Configure a real payment provider or leave it unconfigured.",
      );
    }
    return sandboxCardProvider;
  }

  return unconfiguredCardProvider;
}

let cached: CardPaymentProvider | null = null;

export function cardPaymentProvider(): CardPaymentProvider {
  cached ??= resolve();
  return cached;
}

export * from "./provider.js";
