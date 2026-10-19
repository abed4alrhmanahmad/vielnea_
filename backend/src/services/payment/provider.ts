/**
 * The card-payment seam.
 *
 * VIELINEA has no payment provider configured — there is no processor account,
 * no SDK dependency and no credentials anywhere in the project. Rather than
 * pretend a card was charged, card payment is expressed as an interface with a
 * single authorization call, so wiring a real processor means writing one
 * adapter and setting `PAYMENT_PROVIDER`. Nothing else has to change.
 *
 * What the backend is allowed to see is deliberately narrow: a token minted by
 * the provider's own client-side SDK, plus the non-sensitive descriptors that
 * are safe to store (brand, last four, expiry). A raw card number or CVV never
 * reaches this process, is never logged and is never written to the database.
 */
import { AppError } from "../../lib/errors.js";

/** A payment the customer must be told about, without leaking provider internals. */
export class PaymentDeclinedError extends AppError {
  constructor(message = "Your card was declined. Please try another card.") {
    super(message, 402);
  }
}

/** The provider could not be reached or is not set up. Never the customer's fault. */
export class PaymentUnavailableError extends AppError {
  constructor(message = "Card payment is temporarily unavailable. Please try Cash on Delivery.") {
    super(message, 503);
  }
}

/**
 * What the browser sends up after the provider's SDK has tokenized the card.
 *
 * `token` is the provider's reference to the card. The PAN and CVV are not
 * part of this type and must never be added to it.
 */
export interface CardToken {
  token: string;
  brand: string;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
}

export interface CardAuthorizationRequest {
  /** Minor units (cents) — integers only, so no floating point reaches the provider. */
  amountMinor: number;
  currency: string;
  card: CardToken;
  /** Stable per checkout attempt, so a retry or double-click cannot double-charge. */
  idempotencyKey: string;
  orderReference: string;
  customerEmail: string;
}

export interface CardAuthorizationResult {
  /** The provider's transaction id. Safe to store and to show an admin. */
  reference: string;
  brand: string;
  last4: string;
}

export interface CardPaymentProvider {
  /** Human-readable id, for logs and the admin's benefit. Never a secret. */
  readonly name: string;

  /**
   * Charges the card, or throws.
   *
   * Implementations must throw {@link PaymentDeclinedError} for a refusal the
   * customer can act on, and {@link PaymentUnavailableError} for anything
   * else. Returning normally means the money is captured — callers treat a
   * successful return as authority to mark the order paid.
   */
  authorize(request: CardAuthorizationRequest): Promise<CardAuthorizationResult>;
}
