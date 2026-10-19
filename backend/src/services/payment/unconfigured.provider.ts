/**
 * The default provider: there isn't one.
 *
 * VIELINEA has no processor account, so a card cannot be charged. This adapter
 * says exactly that and refuses the payment, which means no order is ever
 * created claiming to be paid when nothing was collected. Cash on Delivery is
 * unaffected and remains a working way to order.
 */
import { PaymentUnavailableError, type CardPaymentProvider } from "./provider.js";

export const unconfiguredCardProvider: CardPaymentProvider = {
  name: "unconfigured",

  authorize(): Promise<never> {
    return Promise.reject(
      new PaymentUnavailableError(
        "Card payment is not available yet. Please choose Cash on Delivery.",
      ),
    );
  },
};
