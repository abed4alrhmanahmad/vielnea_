import { randomUUID } from "node:crypto";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Unicode combining marks, stripped after NFKD normalisation.
const COMBINING_MARKS_RE = /\p{Diacritic}/gu;

/** True when the value looks like a UUID rather than a slug. */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(COMBINING_MARKS_RE, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Short random slug suffix for products created with no title to derive one
 * from. This is a technical URL identifier, not a display title — it is
 * never shown to shoppers as the product name.
 */
export function randomSlugSuffix(): string {
  return randomUUID().replace(/-/g, "").slice(0, 8);
}

/** Rounds to 2 decimals, avoiding float drift on money arithmetic. */
export function toMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
