import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, CreditCard, Banknote } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useCreateOrder } from "@/services/orders";
import { errorMessage } from "@/lib/api/client";
import type { ApiOrder } from "@/lib/api/types";
import { paymentMethodLabel, paymentStatusLabel } from "@/lib/payment";
import { siteSettingsOptions } from "@/services/site-content";
import {
  cvcLengthFor,
  digitsOf,
  formatCardNumber,
  formatExpiry,
  isExpired,
  passesLuhn,
  tokenizeCard,
} from "@/lib/payments/card";

const schema = z.object({
  customerName: z.string().min(2, "Enter your full name"),
  email: z.string().email("Enter a valid email"),
  phone: z.string().min(5, "Enter a contact number"),
  address: z.string().min(5, "Enter your delivery address"),
  city: z.string().min(2, "Enter your city or area"),
  notes: z.string().optional(),
  paymentMethod: z.enum(["card", "cod"]),

  // Card fields are only validated when Visa / Card is the chosen method —
  // the superRefine below applies them, so Cash on Delivery is never asked
  // for any of this.
  cardholderName: z.string().optional(),
  cardNumber: z.string().optional(),
  cardExpiry: z.string().optional(),
  cardCvc: z.string().optional(),
});

/**
 * Card rules run only for the card method. They check the shape of what was
 * typed so the customer gets a clear message before a request is made; the
 * payment provider remains the authority on whether the card can be charged.
 */
const checkoutSchema = schema.superRefine((values, ctx) => {
  if (values.paymentMethod !== "card") return;

  const fail = (path: keyof FormValues, message: string) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

  if (!values.cardholderName || values.cardholderName.trim().length < 2) {
    fail("cardholderName", "Cardholder name is required");
  }

  const number = digitsOf(values.cardNumber ?? "");
  if (!number) fail("cardNumber", "Card number is required");
  else if (number.length < 12 || number.length > 19 || !passesLuhn(number)) {
    fail("cardNumber", "Invalid card number");
  }

  if (!values.cardExpiry) fail("cardExpiry", "Expiry date is required");
  else if (isExpired(values.cardExpiry)) fail("cardExpiry", "Invalid expiry date");

  const cvc = digitsOf(values.cardCvc ?? "");
  if (!cvc) fail("cardCvc", "CVV is required");
  else if (cvc.length !== cvcLengthFor(number)) fail("cardCvc", "Invalid CVV");
});

type FormValues = z.infer<typeof schema>;

const PAYMENT_OPTIONS = [
  {
    value: "card" as const,
    icon: CreditCard,
    label: "Visa / Card",
    hint: "Paid now, at checkout",
  },
  {
    value: "cod" as const,
    icon: Banknote,
    label: "Cash on Delivery",
    hint: "Pay the courier when it arrives",
  },
];

/**
 * Collects delivery details and creates the order.
 *
 * Only the chosen payment method travels from here — the server decides what
 * the order's payment state becomes, and every monetary figure shown on the
 * confirmation comes from the order the server created, not from this form.
 * Cash on Delivery asks for no card details and takes no payment.
 */
export function CheckoutDialog({
  open,
  onOpenChange,
  defaultName,
  defaultEmail,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultName?: string;
  defaultEmail?: string;
}) {
  const [placedOrder, setPlacedOrder] = useState<ApiOrder | null>(null);
  const createOrder = useCreateOrder();

  const form = useForm<FormValues>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      customerName: defaultName ?? "",
      email: defaultEmail ?? "",
      phone: "",
      address: "",
      city: "",
      notes: "",
      paymentMethod: "card",
      cardholderName: "",
      cardNumber: "",
      cardExpiry: "",
      cardCvc: "",
    },
  });

  const paymentMethod = form.watch("paymentMethod");

  // Methods come from the admin Payment Methods switches (and, for card,
  // whether a real processor is configured). Refetched on open so a change
  // made while the shop was open applies; the server enforces it regardless.
  const settingsQuery = useQuery(siteSettingsOptions());
  const methods = settingsQuery.data?.checkoutPayments ?? { card: true, cod: true };
  const paymentOptions = PAYMENT_OPTIONS.filter((option) => methods[option.value]);
  const noPaymentMethod = paymentOptions.length === 0;
  const { refetch } = settingsQuery;
  useEffect(() => {
    if (open) void refetch();
  }, [open, refetch]);
  // Keep the selection on an offered method when the offer changes.
  useEffect(() => {
    const first = paymentOptions[0];
    if (first && !paymentOptions.some((option) => option.value === paymentMethod)) {
      form.setValue("paymentMethod", first.value);
    }
  }, [paymentOptions, paymentMethod, form]);
  const cardNumberValue = form.watch("cardNumber") ?? "";

  /**
   * One key per checkout attempt. The provider replays the first result for a
   * repeated key, so a double-click or a retry after a dropped response cannot
   * charge the customer twice. A new key is minted once an order succeeds.
   */
  const idempotencyKey = useRef(crypto.randomUUID());

  const submit = form.handleSubmit(async (values) => {
    const { cardholderName, cardNumber, cardExpiry, cardCvc, ...order } = values;

    try {
      let card;
      if (values.paymentMethod === "card") {
        // The number and CVV stop here. tokenizeCard returns only the token
        // and the safe descriptors, and that is all the API is given.
        card = await tokenizeCard({
          cardholderName: cardholderName ?? "",
          number: cardNumber ?? "",
          expiry: cardExpiry ?? "",
          cvc: cardCvc ?? "",
        });
      }

      const placed = await createOrder.mutateAsync({
        ...order,
        ...(card ? { card, idempotencyKey: idempotencyKey.current } : {}),
      });
      setPlacedOrder(placed);
      toast.success(`Order ${placed.orderNumber} confirmed`);
    } catch (error) {
      toast.error(errorMessage(error, "We couldn't place your order"));
    }
  });

  const close = (next: boolean) => {
    if (!next) {
      setPlacedOrder(null);
      form.reset();
      idempotencyKey.current = crypto.randomUUID();
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        {placedOrder ? (
          <div className="text-center py-4">
            <CheckCircle2 className="size-12 mx-auto text-primary mb-4" />
            <DialogHeader>
              <DialogTitle className="font-display text-2xl text-center">
                Thank you, {placedOrder.customerName.split(" ")[0]}
              </DialogTitle>
              <DialogDescription className="text-center">
                {placedOrder.paymentMethod === "cod"
                  ? "Your order is confirmed. Please have the total ready for the courier."
                  : "Your order is confirmed and stored against your account."}
              </DialogDescription>
            </DialogHeader>

            <dl className="mt-6 text-sm space-y-2 text-left border border-border rounded p-4 bg-card">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Order</dt>
                <dd className="font-mono">{placedOrder.orderNumber}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Items</dt>
                <dd>{placedOrder.items.reduce((n, i) => n + i.quantity, 0)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd>${placedOrder.subtotal.toFixed(2)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Shipping</dt>
                <dd>${placedOrder.shipping.toFixed(2)}</dd>
              </div>
              <div className="flex justify-between border-t border-border pt-2 font-medium">
                <dt>Total</dt>
                <dd className="text-primary">${placedOrder.total.toFixed(2)}</dd>
              </div>
              <div className="flex justify-between border-t border-border pt-2">
                <dt className="text-muted-foreground">Payment method</dt>
                <dd>{paymentMethodLabel(placedOrder.paymentMethod)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Payment status</dt>
                <dd>{paymentStatusLabel(placedOrder.paymentStatus)}</dd>
              </div>
              {placedOrder.cardLast4 && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Card</dt>
                  <dd>•••• {placedOrder.cardLast4}</dd>
                </div>
              )}
            </dl>

            <div className="mt-6 flex gap-2">
              <Button asChild className="flex-1">
                <Link to="/shop">Continue shopping</Link>
              </Button>
              <Button
                variant="outline"
                onClick={() => close(false)}
                className="border-primary text-primary"
              >
                Close
              </Button>
            </div>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-display text-2xl">Delivery details</DialogTitle>
              <DialogDescription>
                Choose how you would like to pay, then confirm your delivery details.
              </DialogDescription>
            </DialogHeader>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
              className="space-y-4 mt-2"
            >
              <div>
                <Label htmlFor="customerName">Full name</Label>
                <Input id="customerName" {...form.register("customerName")} />
                {form.formState.errors.customerName && (
                  <p className="text-xs text-destructive mt-1">
                    {form.formState.errors.customerName.message}
                  </p>
                )}
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" {...form.register("email")} />
                  {form.formState.errors.email && (
                    <p className="text-xs text-destructive mt-1">
                      {form.formState.errors.email.message}
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" {...form.register("phone")} />
                  {form.formState.errors.phone && (
                    <p className="text-xs text-destructive mt-1">
                      {form.formState.errors.phone.message}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="address">Address</Label>
                <Input id="address" {...form.register("address")} />
                {form.formState.errors.address && (
                  <p className="text-xs text-destructive mt-1">
                    {form.formState.errors.address.message}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="city">City / Area</Label>
                <Input id="city" {...form.register("city")} />
                {form.formState.errors.city && (
                  <p className="text-xs text-destructive mt-1">
                    {form.formState.errors.city.message}
                  </p>
                )}
              </div>

              <div>
                <Label>Payment method</Label>
                {noPaymentMethod && (
                  <p className="mt-1 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                    Online checkout is temporarily unavailable. Please contact us to place your
                    order.
                  </p>
                )}
                <div
                  className={`mt-1 grid gap-3 ${paymentOptions.length > 1 ? "sm:grid-cols-2" : ""}`}
                >
                  {paymentOptions.map((option) => {
                    const Icon = option.icon;
                    const selected = paymentMethod === option.value;
                    return (
                      <label
                        key={option.value}
                        className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-left transition-colors ${
                          selected
                            ? "border-primary bg-primary/5"
                            : "border-input hover:border-primary/50"
                        }`}
                      >
                        <input
                          type="radio"
                          value={option.value}
                          {...form.register("paymentMethod")}
                          className="sr-only"
                        />
                        <Icon
                          className={`size-5 shrink-0 mt-0.5 ${
                            selected ? "text-primary" : "text-muted-foreground"
                          }`}
                        />
                        <span>
                          <span className="block text-sm font-medium">{option.label}</span>
                          <span className="block text-xs text-muted-foreground">{option.hint}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                {paymentMethod === "cod" && methods.cod && (
                  <p className="text-xs text-muted-foreground mt-2">
                    No card details are taken. Your order is placed now and payment is collected on
                    delivery.
                  </p>
                )}
              </div>

              {/* Card fields exist only for the card method — selecting Cash on
                  Delivery unmounts them, so nothing card-related is rendered,
                  read or sent. The number and CVV are tokenized in the browser
                  and never travel to the API. */}
              {paymentMethod === "card" && methods.card && (
                <div className="space-y-4 rounded-md border border-input p-4">
                  <div>
                    <Label htmlFor="cardholderName">Cardholder name</Label>
                    <Input
                      id="cardholderName"
                      autoComplete="cc-name"
                      placeholder="As printed on the card"
                      {...form.register("cardholderName")}
                    />
                    {form.formState.errors.cardholderName && (
                      <p className="text-xs text-destructive mt-1">
                        {form.formState.errors.cardholderName.message}
                      </p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="cardNumber">Card number</Label>
                    <Input
                      id="cardNumber"
                      inputMode="numeric"
                      autoComplete="cc-number"
                      placeholder="0000 0000 0000 0000"
                      {...form.register("cardNumber", {
                        onChange: (e) => {
                          e.target.value = formatCardNumber(e.target.value);
                        },
                      })}
                    />
                    {form.formState.errors.cardNumber && (
                      <p className="text-xs text-destructive mt-1">
                        {form.formState.errors.cardNumber.message}
                      </p>
                    )}
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="cardExpiry">Expiry date</Label>
                      <Input
                        id="cardExpiry"
                        inputMode="numeric"
                        autoComplete="cc-exp"
                        placeholder="MM / YY"
                        {...form.register("cardExpiry", {
                          onChange: (e) => {
                            e.target.value = formatExpiry(e.target.value);
                          },
                        })}
                      />
                      {form.formState.errors.cardExpiry && (
                        <p className="text-xs text-destructive mt-1">
                          {form.formState.errors.cardExpiry.message}
                        </p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="cardCvc">CVV</Label>
                      <Input
                        id="cardCvc"
                        inputMode="numeric"
                        autoComplete="cc-csc"
                        placeholder={cvcLengthFor(cardNumberValue) === 4 ? "0000" : "000"}
                        maxLength={4}
                        {...form.register("cardCvc", {
                          onChange: (e) => {
                            e.target.value = digitsOf(e.target.value).slice(0, 4);
                          },
                        })}
                      />
                      {form.formState.errors.cardCvc && (
                        <p className="text-xs text-destructive mt-1">
                          {form.formState.errors.cardCvc.message}
                        </p>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Your card number and CVV stay in your browser — only a secure token reaches
                    VIELINEA.
                  </p>
                </div>
              )}

              <div>
                <Label htmlFor="notes">Order notes (optional)</Label>
                <textarea
                  id="notes"
                  rows={3}
                  {...form.register("notes")}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>

              <Button
                type="submit"
                disabled={createOrder.isPending || noPaymentMethod}
                className="w-full h-12 uppercase tracking-[0.2em] text-xs"
              >
                {createOrder.isPending ? "Placing order…" : "Place Order"}
              </Button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
