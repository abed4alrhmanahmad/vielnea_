import { randomInt } from "node:crypto";
import { withTransaction } from "../lib/db.js";
import { orderRepository } from "../repositories/order.repository.js";
import { BadRequestError, NotFoundError } from "../lib/errors.js";
import { toMoney } from "../utils/slug.js";
import { cardPaymentProvider } from "./payment/index.js";
import { checkoutPaymentMethods } from "./payment/methods.js";
import { shippingFor } from "./cart.service.js";
import { sendNewOrderNotification } from "./email/order-notification.js";
import type { Order } from "../types/models.js";
import type { PaginationMeta } from "../types/api.js";
import type { z } from "zod";
import type { createOrderSchema } from "../schemas/index.js";

type CheckoutInput = z.infer<typeof createOrderSchema>;

function generateOrderNumber(): string {
  const now = new Date();
  const datePart = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
  ].join("");
  return `VLN-${datePart}-${String(randomInt(0, 10_000)).padStart(4, "0")}`;
}

interface LockedCartRow {
  cart_id: string;
  product_id: string;
  size: string;
  quantity: number;
  title: string;
  slug: string;
  price: number;
  discount: number;
  product_stock: number;
  size_stock: number | null;
  image_url: string | null;
}

export const orderService = {
  /**
   * Creates an order from the user's server-side cart.
   *
   * Everything runs in one transaction with the product rows locked FOR UPDATE,
   * so two concurrent checkouts cannot both claim the last unit. Prices, stock
   * and every total are read from the database — nothing about money or
   * inventory is taken from the request body.
   */
  async checkout(userId: string, input: CheckoutInput): Promise<Order> {
    // 0. The chosen payment method must be one checkout currently offers: the
    //    admin can switch methods off, and card also needs a real processor.
    //    Checked before anything is locked or written.
    const methods = await checkoutPaymentMethods();
    if (!methods.card && !methods.cod) {
      throw new BadRequestError(
        "Online checkout is temporarily unavailable. Please contact us to place your order.",
      );
    }
    if (input.paymentMethod === "card" && !methods.card) {
      throw new BadRequestError("Card payment is not available. Please choose Cash on Delivery.");
    }
    if (input.paymentMethod === "cod" && !methods.cod) {
      throw new BadRequestError("Cash on Delivery is not available. Please pay by card.");
    }

    const order = await withTransaction(async (client) => {
      // 1. Read the cart, joining live product data and locking those rows.
      const { rows } = await client.query<LockedCartRow>(
        `SELECT ci.id  AS cart_id,
                p.id    AS product_id,
                ci.size,
                ci.quantity,
                p.title,
                p.slug,
                p.price,
                p.discount,
                p.stock AS product_stock,
                ps.stock AS size_stock,
                (SELECT pi.image_url FROM public.product_images pi
                  WHERE pi.product_id = p.id
                  ORDER BY pi.sort_order LIMIT 1) AS image_url
         FROM public.cart_items ci
         JOIN public.products p ON p.id = ci.product_id
         LEFT JOIN public.product_sizes ps
                ON ps.product_id = p.id AND ps.size = ci.size
         WHERE ci.user_id = $1
         ORDER BY ci.created_at
         FOR UPDATE OF p`,
        [userId],
      );

      if (rows.length === 0) {
        throw new BadRequestError("Your bag is empty");
      }

      // 2. Validate availability before touching anything.
      let subtotal = 0;
      let discountTotal = 0;

      const lines = rows.map((row) => {
        const available = row.size_stock === null ? row.product_stock : Math.min(row.size_stock, row.product_stock);

        if (available <= 0) {
          throw new BadRequestError(`${row.title} in size ${row.size} is now sold out — please remove it from your bag`);
        }
        if (row.quantity > available) {
          throw new BadRequestError(
            `${row.title} in size ${row.size} is no longer available in the quantity in your bag — please update your bag`,
          );
        }

        // 3. Prices come from the products table.
        const price = Number(row.price);
        const unitPrice = toMoney(price * (1 - Number(row.discount) / 100));
        const totalPrice = toMoney(unitPrice * row.quantity);

        subtotal += totalPrice;
        discountTotal += toMoney((price - unitPrice) * row.quantity);

        return {
          productId: row.product_id,
          productTitle: row.title,
          productSlug: row.slug,
          imageUrl: row.image_url,
          size: row.size,
          quantity: row.quantity,
          unitPrice,
          totalPrice,
          hasSizeRow: row.size_stock !== null,
        };
      });

      subtotal = toMoney(subtotal);
      discountTotal = toMoney(discountTotal);

      const shipping = await shippingFor(subtotal);
      const total = toMoney(subtotal + shipping);

      // 3b. Payment. The method is the one the schema validated — an unknown
      // value never reaches here. `total` above was computed from database
      // prices; it is what gets charged, never a figure from the request.
      //
      //   cod  : no card gateway is contacted at all. The courier collects on
      //          delivery, so the order opens 'pending' / 'pending' and an
      //          admin marks it paid later.
      //   card : the configured provider must authorize the amount before any
      //          row is written. A decline throws, the transaction rolls back,
      //          and no order, no stock movement and no cart change survives.
      //
      // The branch is here, on the server, precisely so a client cannot claim
      // a COD order was paid: for "cod" there is no code path that sets
      // payment_status to 'paid', whatever the request body says.
      const paymentMethod = input.paymentMethod;
      const isCod = paymentMethod === "cod";

      let payment: { reference: string; brand: string; last4: string } | null = null;

      if (!isCod) {
        if (!input.card) {
          throw new BadRequestError("Card details are required to pay by card");
        }

        const provider = cardPaymentProvider();
        // Throws PaymentDeclinedError (402) or PaymentUnavailableError (503).
        // Neither is caught here: letting it propagate is what rolls the
        // transaction back and keeps the customer's cart intact.
        payment = await provider.authorize({
          amountMinor: Math.round(total * 100),
          currency: "USD",
          card: input.card,
          idempotencyKey: input.idempotencyKey ?? `${userId}:${total}:${rows.length}`,
          orderReference: userId,
          customerEmail: input.email,
        });
      }

      const orderStatus = isCod ? "pending" : "paid";
      const paymentStatus = isCod ? "pending" : "paid";

      // 4. Create the order, retrying once if the random number collides.
      let orderId: string | undefined;
      for (let attempt = 0; attempt < 5 && !orderId; attempt += 1) {
        const orderNumber = generateOrderNumber();
        const result = await client.query<{ id: string }>(
          `INSERT INTO public.orders
             (order_number, user_id, status, subtotal, discount, shipping, total,
              payment_method, payment_status, payment_reference, card_brand, card_last4,
              customer_name, email, phone, address, city, postal_code, country, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
           ON CONFLICT (order_number) DO NOTHING
           RETURNING id`,
          [
            orderNumber,
            userId,
            orderStatus,
            subtotal,
            discountTotal,
            shipping,
            total,
            paymentMethod,
            paymentStatus,
            payment?.reference ?? null,
            payment?.brand ?? null,
            payment?.last4 ?? null,
            input.customerName,
            input.email,
            input.phone,
            input.address,
            input.city,
            input.postalCode ?? null,
            input.country ?? null,
            input.notes ?? null,
          ],
        );
        orderId = result.rows[0]?.id;
      }
      if (!orderId) throw new Error("Could not allocate an order number");

      // 5. Order items + stock decrement.
      for (const line of lines) {
        await client.query(
          `INSERT INTO public.order_items
             (order_id, product_id, product_title, product_slug, image_url,
              size, quantity, unit_price, total_price)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            orderId,
            line.productId,
            line.productTitle,
            line.productSlug,
            line.imageUrl,
            line.size,
            line.quantity,
            line.unitPrice,
            line.totalPrice,
          ],
        );

        // GREATEST(...) keeps the CHECK (stock >= 0) constraint satisfied even
        // if inventory was adjusted between validation and write.
        await client.query(
          "UPDATE public.products SET stock = GREATEST(stock - $2, 0) WHERE id = $1",
          [line.productId, line.quantity],
        );

        if (line.hasSizeRow) {
          await client.query(
            `UPDATE public.product_sizes
             SET stock = GREATEST(stock - $3, 0)
             WHERE product_id = $1 AND size = $2`,
            [line.productId, line.size, line.quantity],
          );
        }
      }

      // 6. Clear the cart.
      await client.query("DELETE FROM public.cart_items WHERE user_id = $1", [userId]);

      const created = await orderRepository.findByIdInTransaction(client, orderId);
      if (!created) throw new Error("Order vanished immediately after creation");
      return created;
    });

    // 7. Tell the admin an order came in.
    //
    // This runs only once the transaction above has committed, so the email
    // can never describe an order that was rolled back. It is deliberately not
    // awaited and cannot reject: notifying the shop is not part of placing an
    // order, and a mail outage must not slow down or fail a customer's
    // checkout. Failures are logged by sendNewOrderNotification itself.
    void sendNewOrderNotification(order);

    return order;
  },

  async listForUser(
    userId: string,
    page: number,
    limit: number,
  ): Promise<{ orders: Order[]; pagination: Omit<PaginationMeta, "totalPages"> & { totalPages: number } }> {
    const { orders, total } = await orderRepository.findByUser(userId, page, limit);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    return {
      orders,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasPrevPage: page > 1,
        hasNextPage: page < totalPages,
      },
    };
  },

  async getForUser(orderId: string, userId: string, isAdmin: boolean): Promise<Order> {
    const order = isAdmin
      ? await orderRepository.findByIdAsAdmin(orderId)
      : await orderRepository.findByIdForUser(orderId, userId);
    if (!order) throw new NotFoundError("Order not found");
    return order;
  },
};
