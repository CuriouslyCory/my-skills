/**
 * Open-redirect guard for user-supplied post-auth destinations (e.g. the
 * `?redirect=` param the middleware attaches when bouncing to `/login`).
 *
 * Only root-relative, same-origin paths are honored. Anything else falls back
 * to `/`. Checking `startsWith("/")` alone is not enough: WHATWG URL parsing
 * treats `\` like `/` and strips tabs/newlines, so `/\evil.com` or `/\t/evil.com`
 * resolve to `https://evil.com/` once they reach `redirect()` or a browser.
 */

const FALLBACK = "/";

// Sentinel origin used only to resolve the candidate path. The `.invalid` TLD
// is reserved (RFC 2606), so it can never collide with a real host.
const SENTINEL_ORIGIN = "https://safe-redirect.invalid";

/** True for backslashes, ASCII control characters, and spaces. */
function hasUnsafeChar(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (char === "\\" || code <= 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * Returns `value` when it is a safe in-app path, otherwise `/`. Accepts the raw
 * Next.js `searchParams` shape, honoring only the first value of a repeated key.
 */
export function safeRedirect(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw?.startsWith("/") || raw.startsWith("//")) return FALLBACK;
  if (hasUnsafeChar(raw)) return FALLBACK;

  // Defense in depth: resolve against a sentinel origin and require the result
  // to stay on it, so any parser quirk that escapes the checks above still fails.
  try {
    const resolved = new URL(raw, SENTINEL_ORIGIN);
    return resolved.origin === SENTINEL_ORIGIN ? raw : FALLBACK;
  } catch {
    return FALLBACK;
  }
}
