/**
 * The "a new order came in" email sent to the VIELINEA admin.
 *
 * Two rules govern this module:
 *
 *   1. It never throws. A mail outage must not turn a successful checkout into
 *      a failed one — the order is already committed by the time this runs.
 *   2. Every value interpolated into the HTML is escaped. Customer name,
 *      address and notes are free text straight from the checkout form.
 */
import { env } from "../../config/env.js";
import { emailProvider } from "./index.js";
import { EmailDeliveryError } from "./provider.js";
import type { Order } from "../../types/models.js";

/** Escapes the five characters that can break out of HTML text or an attribute. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function money(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function paymentLabel(order: Order): string {
  const method = order.paymentMethod === "cod" ? "Cash on Delivery" : "Card";
  const card =
    order.cardBrand && order.cardLast4 ? ` (${order.cardBrand} ···· ${order.cardLast4})` : "";
  return `${method}${card} — ${order.paymentStatus}`;
}

export function buildOrderNotification(order: Order): { subject: string; html: string; text: string } {
  const subject = `New VIELINEA Order ${order.orderNumber}`;

  const itemLines = order.items.map((item) => {
    const size = item.size ? ` · size ${item.size}` : "";
    return `${item.quantity} × ${item.productTitle}${size} — ${money(item.totalPrice)}`;
  });

  const text = [
    "New order received",
    "",
    `Order number : ${order.orderNumber}`,
    `Order ID     : ${order.id}`,
    `Placed       : ${new Date(order.createdAt).toUTCString()}`,
    "",
    `Customer     : ${order.customerName}`,
    `Email        : ${order.email}`,
    `Phone        : ${order.phone}`,
    `Ship to      : ${[order.address, order.city, order.postalCode, order.country]
      .filter(Boolean)
      .join(", ")}`,
    "",
    "Items",
    ...itemLines.map((line) => `  ${line}`),
    "",
    `Subtotal     : ${money(order.subtotal)}`,
    `Discount     : -${money(order.discount)}`,
    `Shipping     : ${money(order.shipping)}`,
    `Total        : ${money(order.total)}`,
    `Payment      : ${paymentLabel(order)}`,
    ...(order.notes ? ["", `Notes        : ${order.notes}`] : []),
  ].join("\n");

  const itemRows = order.items
    .map((item) => {
      const size = item.size ? ` · size ${escapeHtml(item.size)}` : "";
      return `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #eee5d8;color:#3b3229;">
          ${escapeHtml(item.productTitle)}${size}
          <span style="color:#8a7c6a;"> × ${item.quantity}</span>
        </td>
        <td style="padding:8px 0;border-bottom:1px solid #eee5d8;text-align:right;color:#3b3229;white-space:nowrap;">
          ${money(item.totalPrice)}
        </td>
      </tr>`;
    })
    .join("");

  const shipTo = [order.address, order.city, order.postalCode, order.country]
    .filter(Boolean)
    .map((part) => escapeHtml(String(part)))
    .join(", ");

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#faf4ea;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#fffdf9;border:1px solid #eee5d8;border-radius:8px;">
      <tr>
        <td style="padding:24px 28px;border-bottom:1px solid #eee5d8;">
          <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#6b21a8;">VIELINEA</div>
          <h1 style="margin:8px 0 0;font-size:22px;font-weight:600;color:#2b2520;">New order received</h1>
        </td>
      </tr>
      <tr>
        <td style="padding:20px 28px;">
          <p style="margin:0 0 4px;font-size:15px;color:#2b2520;">
            Order <strong>${escapeHtml(order.orderNumber)}</strong>
          </p>
          <p style="margin:0 0 16px;font-size:13px;color:#8a7c6a;">
            ID ${escapeHtml(order.id)} · ${escapeHtml(new Date(order.createdAt).toUTCString())}
          </p>

          <p style="margin:0 0 4px;font-size:15px;color:#2b2520;">
            From <strong>${escapeHtml(order.customerName)}</strong>
          </p>
          <p style="margin:0 0 16px;font-size:13px;color:#5c5145;">
            ${escapeHtml(order.email)} · ${escapeHtml(order.phone)}<br/>
            ${shipTo}
          </p>

          <table role="presentation" width="100%" style="border-collapse:collapse;font-size:14px;">
            ${itemRows}
            <tr>
              <td style="padding:12px 0 0;color:#8a7c6a;">Subtotal</td>
              <td style="padding:12px 0 0;text-align:right;color:#5c5145;">${money(order.subtotal)}</td>
            </tr>
            <tr>
              <td style="padding:2px 0;color:#8a7c6a;">Discount</td>
              <td style="padding:2px 0;text-align:right;color:#5c5145;">-${money(order.discount)}</td>
            </tr>
            <tr>
              <td style="padding:2px 0;color:#8a7c6a;">Shipping</td>
              <td style="padding:2px 0;text-align:right;color:#5c5145;">${money(order.shipping)}</td>
            </tr>
            <tr>
              <td style="padding:10px 0 0;font-weight:600;color:#2b2520;border-top:1px solid #eee5d8;">Total</td>
              <td style="padding:10px 0 0;text-align:right;font-weight:600;color:#2b2520;border-top:1px solid #eee5d8;">${money(order.total)}</td>
            </tr>
          </table>

          <p style="margin:18px 0 0;font-size:13px;color:#5c5145;">
            Payment: ${escapeHtml(paymentLabel(order))}
          </p>
          ${order.notes ? `<p style="margin:12px 0 0;font-size:13px;color:#5c5145;">Notes: ${escapeHtml(order.notes)}</p>` : ""}
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, html, text };
}

/**
 * Sends the admin notification for a freshly created order.
 *
 * Resolves even on failure — the caller fires this after the checkout
 * transaction has committed, and a bounced notification must not surface to
 * the customer as a broken order.
 */
export async function sendNewOrderNotification(order: Order): Promise<void> {
  const provider = emailProvider();

  try {
    const { subject, html, text } = buildOrderNotification(order);

    const result = await provider.send({
      to: env.orderNotificationEmail,
      from: env.EMAIL_FROM,
      // A reply goes to the customer, which is what an admin reaching for
      // "Reply" on a new-order alert actually wants.
      replyTo: order.email,
      subject,
      html,
      text,
    });

    if (provider.isEnabled) {
      // The id is the handle for this message in Resend's Emails log, which is
      // where delivery — as opposed to acceptance — can actually be confirmed.
      // eslint-disable-next-line no-console
      console.log(
        `[email] order notification accepted for ${order.orderNumber} ` +
          `via ${provider.name} -> ${env.orderNotificationEmail} ` +
          `(from ${env.EMAIL_FROM}, id ${result.id ?? "none"})`,
      );
    }
  } catch (error) {
    // Logged, never rethrown: the order is already committed and must stand.
    // Status and provider text are printed so a rejection is diagnosable from
    // the log alone. Neither ever contains the API key.
    if (error instanceof EmailDeliveryError) {
      // eslint-disable-next-line no-console
      console.error(
        `[email] order notification FAILED for ${order.orderNumber} ` +
          `via ${provider.name} -> ${env.orderNotificationEmail} ` +
          `(from ${env.EMAIL_FROM}, http ${error.status ?? "no response"}): ${error.message}`,
      );
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console
    console.error(`[email] order notification FAILED for ${order.orderNumber}:`, message);
  }
}
