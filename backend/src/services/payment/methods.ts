/**
 * Which payment methods checkout offers.
 *
 * The admin's on/off switches live in the existing `site_content` key/value
 * table under `payment_methods` (written through the admin-only
 * PUT /admin/site/settings/:key endpoint), so no schema change is needed. A
 * missing or partial value keeps the method on — the behaviour before the
 * switches existed.
 *
 * What checkout may actually offer also depends on the card provider: card
 * is only available when it is switched on *and* a real processor is
 * configured (see `cardPaymentsReady`).
 */
import { z } from "zod";
import { cmsRepository } from "../../repositories/cms.repository.js";
import { cardPaymentsReady } from "./index.js";

export const PAYMENT_METHODS_SETTING_KEY = "payment_methods";

export const paymentMethodTogglesSchema = z
  .object({ cardEnabled: z.boolean(), codEnabled: z.boolean() })
  .strict();

export interface PaymentMethodToggles {
  cardEnabled: boolean;
  codEnabled: boolean;
}

/** Only an explicit `false` turns a method off. */
export function readPaymentToggles(raw: unknown): PaymentMethodToggles {
  const value = (raw ?? {}) as Partial<Record<keyof PaymentMethodToggles, unknown>>;
  return { cardEnabled: value.cardEnabled !== false, codEnabled: value.codEnabled !== false };
}

/** Methods checkout may offer right now, from the toggles. */
export function availableMethods(toggles: PaymentMethodToggles): { card: boolean; cod: boolean } {
  return { card: toggles.cardEnabled && cardPaymentsReady(), cod: toggles.codEnabled };
}

export async function checkoutPaymentMethods(): Promise<{ card: boolean; cod: boolean }> {
  return availableMethods(
    readPaymentToggles(await cmsRepository.getSetting(PAYMENT_METHODS_SETTING_KEY)),
  );
}
