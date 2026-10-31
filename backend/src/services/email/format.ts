/**
 * Helpers shared by the order emails: HTML escaping and money for the message
 * bodies, and address masking for anything written to the log.
 */

/** Escapes the five characters that can break out of HTML text or an attribute. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function money(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/**
 * Masks every email address in a string, keeping the first character and the
 * domain: "amira@example.com" becomes "a***@example.com". Logs carry customer
 * addresses only through this, and provider error text is passed through it too
 * because a rejection message can quote the recipient.
 */
export function maskEmails(text: string): string {
  return text.replace(/([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@/g, "$1***@");
}
