/**
 * Delivers one order email. The admin notification and the customer
 * confirmation both go through here, so they fail, retry and log the same way —
 * and independently: each call handles only its own message.
 *
 *   - Never throws. Order emails go out after the checkout transaction has
 *     committed, so a mail failure must not reach the customer as a failed order.
 *   - Retries only failures that can clear by themselves: no response, 429 and
 *     5xx. A 4xx is the provider refusing this message (bad key, unverified
 *     sender, recipient not allowed) and would be refused again.
 *   - Every attempt carries the same idempotency key, built from the order id and
 *     the email kind. A retry after a lost response therefore cannot deliver a
 *     second copy, and one order's two emails can never be mistaken for each other.
 *   - Log lines name the order and mask every address, including any quoted in
 *     the provider's error text.
 */
import { emailProvider } from "./index.js";
import { EmailDeliveryError, type EmailMessage } from "./provider.js";
import { maskEmails } from "./format.js";
import type { Order } from "../../types/models.js";

export type OrderEmailKind = "order notification" | "customer confirmation";

/** Pauses before each retry. Exported so the email checks can shorten them. */
export const deliveryTiming = { retryDelaysMs: [2_000, 6_000] };

function isTransient(error: unknown): boolean {
  if (!(error instanceof EmailDeliveryError)) return false;
  return error.status === undefined || error.status === 429 || error.status >= 500;
}

function describe(error: unknown): { status: string; reason: string } {
  const status =
    error instanceof EmailDeliveryError ? String(error.status ?? "no response") : "n/a";
  const reason = maskEmails(error instanceof Error ? error.message : String(error));
  return { status, reason };
}

/** The provider-side de-duplication key for one email about one order. */
export function orderEmailKey(kind: OrderEmailKind, order: Order): string {
  return `vielinea-${kind.replace(/ /g, "-")}-${order.id}`;
}

export async function deliverOrderEmail(
  kind: OrderEmailKind,
  order: Order,
  compose: () => Omit<EmailMessage, "idempotencyKey">,
): Promise<void> {
  const provider = emailProvider();

  let message: EmailMessage;
  try {
    // Composed in here so a template error is contained like a send error.
    message = { ...compose(), idempotencyKey: orderEmailKey(kind, order) };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(
      `[email] ${kind} FAILED for ${order.orderNumber}: could not compose: ${describe(error).reason}`,
    );
    return;
  }

  const route = `via ${provider.name} -> ${maskEmails(message.to)} (from ${message.from}`;
  const attempts = deliveryTiming.retryDelaysMs.length + 1;

  for (let attempt = 1; ; attempt += 1) {
    try {
      const result = await provider.send(message);
      if (provider.isEnabled) {
        // The id is this message's handle in Resend's Emails log, which is where
        // delivery — as opposed to acceptance — can actually be confirmed.
        // eslint-disable-next-line no-console
        console.log(
          `[email] ${kind} accepted for ${order.orderNumber} ${route}, id ${result.id ?? "none"}` +
            `${attempt > 1 ? `, attempt ${attempt}` : ""})`,
        );
      }
      return;
    } catch (error) {
      const { status, reason } = describe(error);
      if (isTransient(error) && attempt < attempts) {
        // eslint-disable-next-line no-console
        console.warn(
          `[email] ${kind} attempt ${attempt}/${attempts} failed for ${order.orderNumber} ` +
            `(http ${status}): ${reason} — retrying`,
        );
        await new Promise((resolve) =>
          setTimeout(resolve, deliveryTiming.retryDelaysMs[attempt - 1]),
        );
        continue;
      }
      // eslint-disable-next-line no-console
      console.error(
        `[email] ${kind} FAILED for ${order.orderNumber} ${route}, http ${status}, ` +
          `attempt ${attempt}/${attempts}): ${reason}`,
      );
      return;
    }
  }
}
