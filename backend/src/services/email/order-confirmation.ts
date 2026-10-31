/**
 * The "we received your order" email sent to the customer who placed it.
 *
 * The same two rules as the admin notification govern this module:
 *
 *   1. It never throws. It runs after the order has committed, alongside — not
 *      after — the admin notification, so neither email can hold up or cancel
 *      the other, and neither can fail the checkout.
 *   2. Every value interpolated into the HTML is escaped. Name, address and
 *      phone are free text straight from the checkout form.
 *
 * It is sent only when EMAIL_FROM can reach customers at all. Resend's shared
 * test sender (onboarding@resend.dev) delivers solely to the Resend account
 * owner, so with it every customer send would be refused; those are skipped
 * with a log line instead. Verifying a domain in Resend and setting EMAIL_FROM
 * to an address on it turns confirmations on, with no code change.
 */
import { env } from "../../config/env.js";
import { emailProvider } from "./index.js";
import { deliverOrderEmail } from "./deliver.js";
import { escapeHtml, money } from "./format.js";
import type { Order } from "../../types/models.js";

/** Resend's shared test domain, which only ever reaches the account owner. */
const TEST_SENDER_DOMAIN = /@resend\.dev\b/i;

/** True when a provider is configured and EMAIL_FROM can reach any customer. */
export function customerConfirmationsEnabled(): boolean {
  return emailProvider().isEnabled && !TEST_SENDER_DOMAIN.test(env.EMAIL_FROM);
}

function placedOn(order: Order): string {
  return new Date(order.createdAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function paymentLine(order: Order): string {
  if (order.paymentMethod === "cod") {
    return `Cash on delivery: please have ${money(order.total)} ready when your order arrives.`;
  }
  const card =
    order.cardBrand && order.cardLast4 ? ` (${order.cardBrand} ···· ${order.cardLast4})` : "";
  return order.paymentStatus === "paid"
    ? `Paid by card${card}.`
    : `Card${card}, payment ${order.paymentStatus}.`;
}

export function buildOrderConfirmation(order: Order): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Your VIELINEA order ${order.orderNumber}`;
  const shipTo = [order.address, order.city, order.postalCode, order.country].filter(Boolean);

  const itemLines = order.items.map((item) => {
    const size = item.size ? ` · size ${item.size}` : "";
    return `${item.quantity} × ${item.productTitle}${size} — ${money(item.totalPrice)}`;
  });

  const text = [
    `Thank you for your order, ${order.customerName}.`,
    "",
    `Order number : ${order.orderNumber}`,
    `Placed       : ${placedOn(order)}`,
    "",
    "Items",
    ...itemLines.map((line) => `  ${line}`),
    "",
    `Subtotal     : ${money(order.subtotal)}`,
    ...(order.discount > 0 ? [`Discount     : -${money(order.discount)}`] : []),
    `Shipping     : ${money(order.shipping)}`,
    `Total        : ${money(order.total)}`,
    "",
    `Payment      : ${paymentLine(order)}`,
    `Delivery to  : ${order.customerName}, ${shipTo.join(", ")}`,
    `Phone        : ${order.phone}`,
    "",
    `Questions about your order? Contact us through vielinea.com and quote ${order.orderNumber}.`,
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

  const discountRow =
    order.discount > 0
      ? `<tr>
              <td style="padding:2px 0;color:#8a7c6a;">Discount</td>
              <td style="padding:2px 0;text-align:right;color:#5c5145;">-${money(order.discount)}</td>
            </tr>`
      : "";

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#faf4ea;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#fffdf9;border:1px solid #eee5d8;border-radius:8px;">
      <tr>
        <td style="padding:24px 28px;border-bottom:1px solid #eee5d8;">
          <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#6b21a8;">VIELINEA</div>
          <h1 style="margin:8px 0 0;font-size:22px;font-weight:600;color:#2b2520;">Thank you for your order</h1>
        </td>
      </tr>
      <tr>
        <td style="padding:20px 28px;">
          <p style="margin:0 0 4px;font-size:15px;color:#2b2520;">
            Hi ${escapeHtml(order.customerName)},
          </p>
          <p style="margin:0 0 16px;font-size:14px;color:#5c5145;">
            We've received your order <strong>${escapeHtml(order.orderNumber)}</strong>,
            placed on ${escapeHtml(placedOn(order))}. Here is a summary.
          </p>

          <table role="presentation" width="100%" style="border-collapse:collapse;font-size:14px;">
            ${itemRows}
            <tr>
              <td style="padding:12px 0 0;color:#8a7c6a;">Subtotal</td>
              <td style="padding:12px 0 0;text-align:right;color:#5c5145;">${money(order.subtotal)}</td>
            </tr>
            ${discountRow}
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
            ${escapeHtml(paymentLine(order))}
          </p>
          <p style="margin:12px 0 0;font-size:13px;color:#5c5145;">
            Delivering to ${escapeHtml(order.customerName)}<br/>
            ${shipTo.map((part) => escapeHtml(String(part))).join(", ")}<br/>
            ${escapeHtml(order.phone)}
          </p>
          <p style="margin:18px 0 0;font-size:13px;color:#8a7c6a;">
            Questions about your order? Contact us through vielinea.com and quote
            ${escapeHtml(order.orderNumber)}.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, html, text };
}

/**
 * Sends the customer's confirmation for a freshly created order. Resolves even
 * on failure, like the admin notification it runs beside.
 */
export function sendOrderConfirmation(order: Order): Promise<void> {
  if (!customerConfirmationsEnabled()) {
    // eslint-disable-next-line no-console
    console.log(
      `[email] customer confirmation skipped for ${order.orderNumber}: ` +
        (emailProvider().isEnabled
          ? "EMAIL_FROM is Resend's test sender, which only delivers to the Resend account owner"
          : "no email provider configured"),
    );
    return Promise.resolve();
  }
  return deliverOrderEmail("customer confirmation", order, () => ({
    to: order.email,
    from: env.EMAIL_FROM,
    ...buildOrderConfirmation(order),
  }));
}
