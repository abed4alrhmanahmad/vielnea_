/**
 * Card handling in the browser.
 *
 * The rule this file exists to enforce: the card number and the CVV never
 * leave the browser. They are typed, validated for shape, and handed to
 * {@link tokenizeCard}, which returns only what is safe to transmit — a token,
 * the brand, the last four digits and the expiry. The API is given that and
 * nothing else, so a raw PAN cannot be logged server-side or written to the
 * database.
 *
 * VIELINEA has no payment provider configured. `tokenizeCard` is the single
 * seam where a real one plugs in: with Stripe it becomes a call to
 * `stripe.createPaymentMethod(...)`, with any other processor the equivalent
 * client-side SDK call. The shape it returns is already what the API expects,
 * so nothing else in the checkout has to change.
 */

export interface CardDetails {
  cardholderName: string;
  /** Raw digits with or without spaces. Never sent anywhere. */
  number: string;
  /** "MM / YY" as typed. */
  expiry: string;
  /** Never sent anywhere. */
  cvc: string;
}

/** The only card information the API is ever given. */
export interface CardToken {
  token: string;
  brand: string;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
}

const DIGITS = /\D+/g;

export function digitsOf(value: string): string {
  return value.replace(DIGITS, "");
}

/** Groups a card number in fours as it is typed, purely for readability. */
export function formatCardNumber(value: string): string {
  const digits = digitsOf(value).slice(0, 19);
  const groups = digits.match(/.{1,4}/g);
  return groups ? groups.join(" ") : digits;
}

/** Formats expiry entry as MM / YY. */
export function formatExpiry(value: string): string {
  const digits = digitsOf(value).slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)} / ${digits.slice(2)}`;
}

export function cardBrand(number: string): string {
  const digits = digitsOf(number);
  if (/^4/.test(digits)) return "visa";
  if (/^(5[1-5]|2(2[2-9]|[3-6]|7[01]|720))/.test(digits)) return "mastercard";
  if (/^3[47]/.test(digits)) return "amex";
  return "card";
}

/**
 * The Luhn checksum every card number satisfies. A format check that catches
 * typos before a request is made — not a security control, and not a claim
 * that the card exists. The provider remains the authority on whether a card
 * is real and can be charged.
 */
export function passesLuhn(number: string): boolean {
  const digits = digitsOf(number);
  if (digits.length < 12) return false;

  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let value = Number(digits[i]);
    if (double) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    sum += value;
    double = !double;
  }
  return sum % 10 === 0;
}

export function parseExpiry(expiry: string): { month: number; year: number } | null {
  const digits = digitsOf(expiry);
  if (digits.length !== 4) return null;

  const month = Number(digits.slice(0, 2));
  const year = 2000 + Number(digits.slice(2));
  if (month < 1 || month > 12) return null;
  return { month, year };
}

/** True when the card is already out of date at the end of its expiry month. */
export function isExpired(expiry: string, now = new Date()): boolean {
  const parsed = parseExpiry(expiry);
  if (!parsed) return true;
  // Day 0 of the following month is the last day of the expiry month.
  const endOfMonth = new Date(parsed.year, parsed.month, 0, 23, 59, 59, 999);
  return endOfMonth < now;
}

export function cvcLengthFor(number: string): number {
  return cardBrand(number) === "amex" ? 4 : 3;
}

/**
 * Exchanges card details for a token the API may see.
 *
 * With no provider configured this mints a client-side reference and returns
 * the safe descriptors alongside it. The number and CVV are read here and go
 * no further: they are not returned, not stored and not transmitted. The
 * backend treats the token as opaque and hands it to whichever provider is
 * configured — which, until one is, refuses the payment rather than
 * pretending the card was charged.
 */
export async function tokenizeCard(details: CardDetails): Promise<CardToken> {
  const parsed = parseExpiry(details.expiry);
  if (!parsed) throw new Error("Invalid expiry date");

  const digits = digitsOf(details.number);

  return Promise.resolve({
    token: `cardtok_${crypto.randomUUID()}`,
    brand: cardBrand(digits),
    last4: digits.slice(-4),
    expiryMonth: parsed.month,
    expiryYear: parsed.year,
  });
}
