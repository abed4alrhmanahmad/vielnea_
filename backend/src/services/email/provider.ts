/**
 * The shape every transactional-email adapter implements.
 *
 * Mirrors the card-payment provider pattern in src/services/payment/: one
 * interface, a real adapter chosen by configuration, and an honest no-op
 * default for when nothing is configured.
 */

export interface EmailMessage {
  /** Recipient address. */
  to: string;
  /** Sender address, e.g. "VIELINEA <orders@vielinea.com>". */
  from: string;
  subject: string;
  html: string;
  /** Plain-text alternative, for clients that do not render HTML. */
  text: string;
  /** Where a reply should go — the customer, for an order notification. */
  replyTo?: string;
}

/** What the provider reports back once it has accepted the message. */
export interface EmailSendResult {
  /** The provider's message id, when it returns one. Null for a no-op send. */
  id: string | null;
}

export interface EmailProvider {
  /** Adapter name, for logs. Never includes credentials. */
  readonly name: string;
  /** True when the adapter can actually deliver mail. */
  readonly isEnabled: boolean;
  /**
   * Delivers the message. Rejects on failure — callers that must not be
   * affected by a mail outage are responsible for catching.
   */
  send(message: EmailMessage): Promise<EmailSendResult>;
}

/**
 * Raised when the provider refuses or fails to deliver.
 *
 * `status` carries the provider's HTTP status when there was a response, which
 * is what separates "key rejected" (401/403) from "never reached them"
 * (undefined). The message is the provider's own text — it never contains the
 * API key, which is sent only as a request header.
 */
export class EmailDeliveryError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "EmailDeliveryError";
    this.status = status;
  }
}
