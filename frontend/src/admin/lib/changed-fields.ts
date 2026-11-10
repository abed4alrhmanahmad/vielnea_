/**
 * The fields of `draft` whose value differs from `saved`.
 *
 * Admin forms send only these, so saving one form never writes back fields it
 * merely loaded — that is what let one screen silently revert an edit made on
 * another (e.g. Pages → About overwriting the timeline header).
 *
 * Values are compared structurally, so objects and arrays count as changed
 * only when their content differs. Kept free of "@/" imports for unit tests.
 */
export function changedFields<T extends object>(saved: T, draft: T): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(draft) as Array<keyof T>) {
    if (JSON.stringify(draft[key]) !== JSON.stringify(saved[key])) out[key] = draft[key];
  }
  return out;
}
