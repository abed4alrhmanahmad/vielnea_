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
 * Stale-while-revalidate: once an entry is past its TTL it is still served
 * (for at most `MAX_STALE_MS` more) while one background query refreshes it.
 * Traffic is light, so most visits arrive after the TTL has lapsed; without
 * this, each of them waited on the database (~230ms per round trip, Tokyo
 * from Frankfurt) for data an admin write would already have invalidated.
 * Invalidated entries are deleted, never served stale, so in-process writes
 * (admin edits, orders, reviews) stay visible immediately.
 *
 * Process-local by design — this app runs as a single Node process, so a
 * plain Map needs no external store. It would need to move to a shared
 * cache (e.g. Redis) if the API ever ran as multiple instances.
 */
interface Entry<T> {
  value: T;
  expiresAt: number;
  /** Past this point the entry is too old to serve even while refreshing. */
  staleUntil: number;
}

/**
 * Upper bound on serving an expired entry. Only writes made outside this
 * process (another backend, direct SQL) can be stale, and only until the
 * refresh one request triggers has landed.
 */
const MAX_STALE_MS = 30 * 60_000;

const store = new Map<string, Entry<unknown>>();

/** One query per key at a time: concurrent misses share it. */
const inflight = new Map<string, Promise<unknown>>();

/**
 * Bumped by every invalidation. A fetch that started before one may have read
 * pre-write rows, so its result is returned to its own callers but not stored.
 */
let generation = 0;

function load<T>(key: string, ttlMs: number, fetchValue: () => Promise<T>): Promise<T> {
  const running = inflight.get(key);
  if (running) return running as Promise<T>;

  const startedAt = generation;
  const promise = fetchValue()
    .then((value) => {
      if (generation === startedAt) {
        const now = Date.now();
        store.set(key, { value, expiresAt: now + ttlMs, staleUntil: now + ttlMs + MAX_STALE_MS });
      }
      return value;
    })
    .finally(() => {
      if (inflight.get(key) === promise) inflight.delete(key);
    });
  inflight.set(key, promise);
  return promise;
}

/**
 * Returns the cached value for `key` if still fresh; otherwise calls
 * `fetchValue`, caches the result for `ttlMs`, and returns it. An expired
 * entry within `MAX_STALE_MS` is returned at once while the refresh runs in
 * the background. A rejected `fetchValue` is never cached, so a transient
 * failure doesn't poison reads for the rest of the TTL window.
 */
export async function cached<T>(key: string, ttlMs: number, fetchValue: () => Promise<T>): Promise<T> {
  const hit = store.get(key) as Entry<T> | undefined;
  const now = Date.now();
  if (hit && hit.expiresAt > now) return hit.value;

  if (hit && hit.staleUntil > now) {
    // The stale value already answers this request; a failed refresh just
    // leaves it in place for the next one to retry.
    load(key, ttlMs, fetchValue).catch(() => undefined);
    return hit.value;
  }

  return load(key, ttlMs, fetchValue);
}

/** Drops every cached entry whose key starts with `prefix`. */
export function invalidateCache(prefix: string): void {
  generation += 1;
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
  // A query already running may predate the write; later readers start anew.
  for (const key of inflight.keys()) {
    if (key.startsWith(prefix)) inflight.delete(key);
  }
}
