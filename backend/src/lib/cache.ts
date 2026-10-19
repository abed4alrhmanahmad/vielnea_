/**
 * Tiny in-memory read cache for hot, rarely-changing public endpoints
 * (product/category/hero-slide/testimonial/CMS-page listings). The database
 * is remote, so every query pays real network round-trip latency regardless
 * of how simple it is — this cache is what removes that cost for repeat
 * reads between admin edits.
 *
 * Same idea as cart.service.ts's `shippingCache`, generalised: a short TTL
 * is a safety net, and callers that write to a cached resource call
 * `invalidateCache()` so the change is visible immediately rather than
 * waiting out the TTL.
 *
 * Process-local by design — this app runs as a single Node process, so a
 * plain Map needs no external store. It would need to move to a shared
 * cache (e.g. Redis) if the API ever ran as multiple instances.
 */
interface Entry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, Entry<unknown>>();

/**
 * Returns the cached value for `key` if still fresh; otherwise calls
 * `fetchValue`, caches the result for `ttlMs`, and returns it. A rejected
 * `fetchValue` is never cached, so a transient failure doesn't poison reads
 * for the rest of the TTL window.
 */
export async function cached<T>(key: string, ttlMs: number, fetchValue: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value as T;

  const value = await fetchValue();
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

/** Drops every cached entry whose key starts with `prefix`. */
export function invalidateCache(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
