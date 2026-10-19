/**
 * A local stand-in for a real processor, for development and the test suite.
 *
 * IT MOVES NO MONEY. It exists so the checkout path — validation, totals,
 * stock, authorization, order creation, decline handling — can be exercised
 * end to end without a processor account, and so the seam a real adapter will
 * occupy is covered by tests. `PAYMENT_PROVIDER=sandbox` is refused in
 * production (see ./index.ts), so this can never stand in for a real charge in
 * front of a customer.
 *
 * Outcomes follow the card numbers the industry uses for testing, matched on
 * the last four digits the browser reports:
 *
 *   4242  approved
 *   0002  declined      (4000 0000 0000 0002)
 *   9995  declined      (4000 0000 0000 9995 — insufficient funds)
 *   0119  provider error(4000 0000 0000 0119 — processing error)
 *
 * Anything else is approved, so ordinary development is not a scavenger hunt.
 */
import { randomUUID } from "node:crypto";
import {
  PaymentDeclinedError,
  PaymentUnavailableError,
  type CardAuthorizationRequest,
  type CardAuthorizationResult,
  type CardPaymentProvider,
} from "./provider.js";

/**
 * Replays the result of a repeated idempotency key instead of authorizing
 * again, the way a real provider does. A double-clicked checkout button
 * therefore yields one payment, not two.
 */
const seen = new Map<string, CardAuthorizationResult>();

export const sandboxCardProvider: CardPaymentProvider = {
  name: "sandbox",

  authorize(request: CardAuthorizationRequest): Promise<CardAuthorizationResult> {
    const replay = seen.get(request.idempotencyKey);
    if (replay) return Promise.resolve(replay);

    if (!Number.isInteger(request.amountMinor) || request.amountMinor <= 0) {
      return Promise.reject(new PaymentUnavailableError());
    }

    const { last4, brand } = request.card;

    if (last4 === "0002" || last4 === "9995") {
      return Promise.reject(new PaymentDeclinedError());
    }
    if (last4 === "0119") {
      return Promise.reject(new PaymentUnavailableError());
    }

    const result: CardAuthorizationResult = {
      reference: `sandbox_${randomUUID()}`,
      brand,
      last4,
    };
    seen.set(request.idempotencyKey, result);
    return Promise.resolve(result);
  },
};
