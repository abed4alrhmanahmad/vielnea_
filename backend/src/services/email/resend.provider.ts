/**
 * Resend adapter, spoken over its REST API.
 *
 * No SDK dependency is added: Resend's send endpoint is a single authenticated
 * POST, and this backend runs on Node >= 20 where `fetch` is global. That keeps
 * package.json as small as it already is — the same reasoning that leaves the
 * rest of this codebase on `pg` and Express without a wrapper library.
 *
 * The API key is read from the server environment and never leaves this module.
 */
import {
  EmailDeliveryError,
  type EmailMessage,
  type EmailProvider,
  type EmailSendResult,
} from "./provider.js";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** Abandons a hung request rather than holding the notification open forever. */
const REQUEST_TIMEOUT_MS = 10_000;

export function createResendProvider(apiKey: string): EmailProvider {
  return {
    name: "resend",
    isEnabled: true,

    async send(message: EmailMessage): Promise<EmailSendResult> {
      const response = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: message.from,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
          ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }).catch((error: unknown) => {
        const reason = error instanceof Error ? error.message : String(error);
        throw new EmailDeliveryError(`Resend request failed: ${reason}`);
      });

      if (!response.ok) {
        // Read the body for the reason, but never echo the Authorization header.
        const detail = await response.text().catch(() => "");
        throw new EmailDeliveryError(
          `Resend responded ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`,
          response.status,
        );
      }

      // Resend returns { id } for an accepted message. Accepted is not the same
      // as delivered — the id is what lets us find the message in Resend's own
      // Emails log and see what became of it.
      const payload = (await response.json().catch(() => null)) as { id?: string } | null;
      return { id: payload?.id ?? null };
    },
  };
}
