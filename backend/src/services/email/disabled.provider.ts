/**
 * The default adapter: no mail provider is configured.
 *
 * It delivers nothing and says so once per process. This is deliberately not an
 * error — order confirmation emails are a notification, not part of checkout,
 * so a VIELINEA instance with no EMAIL_API_KEY must still take orders normally.
 */
import type { EmailMessage, EmailProvider, EmailSendResult } from "./provider.js";

let warned = false;

export const disabledEmailProvider: EmailProvider = {
  name: "disabled",
  isEnabled: false,

  send(message: EmailMessage): Promise<EmailSendResult> {
    if (!warned) {
      warned = true;
      // eslint-disable-next-line no-console
      console.warn(
        "[email] No email provider configured — set EMAIL_API_KEY in backend/.env to enable admin order notifications.",
      );
    }
    // eslint-disable-next-line no-console
    console.log(`[email] skipped (provider disabled): "${message.subject}" -> ${message.to}`);
    return Promise.resolve({ id: null });
  },
};
