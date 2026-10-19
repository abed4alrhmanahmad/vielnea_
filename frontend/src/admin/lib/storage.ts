// Small JSON storage helper.
// The admin data layer is API-backed; this now only caches the admin session
// hint (name/email) so the shell can render before /auth/me resolves.
export function getJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function setJSON<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
  // notify same-tab subscribers
  window.dispatchEvent(new CustomEvent("admin:storage", { detail: { key } }));
}

export function subscribe(key: string, cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onCustom = (e: Event) => {
    const detail = (e as CustomEvent).detail as { key: string } | undefined;
    if (!detail || detail.key === key) cb();
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === key) cb();
  };
  window.addEventListener("admin:storage", onCustom);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener("admin:storage", onCustom);
    window.removeEventListener("storage", onStorage);
  };
}

export function uid(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}
