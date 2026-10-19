/**
 * Normalises the `redirect` search param the account guard sets.
 *
 * Only a same-site path is followed, so a crafted link cannot bounce a signed-in
 * shopper off to another origin.
 */
export function safeRedirect(target: string | undefined): string {
  if (!target || !target.startsWith("/") || target.startsWith("//")) return "/";
  return target;
}
