/**
 * Helpers for the `/cli-auth` device-authorization flow (#23).
 *
 * The CLI opens `/cli-auth?callback=<loopback>&name=<hostname>&state=<nonce>`.
 * After the user confirms, the web app mints a personal access token and redirects
 * the browser to the loopback callback with the token. Because the token is handed
 * back on the callback URL, the callback MUST be a loopback address; otherwise a
 * crafted link could exfiltrate a freshly minted token to an attacker's server.
 */

/**
 * Returns true only for `http://` URLs whose host is a loopback address
 * (`127.0.0.1`, `::1`, or `localhost`). Any parse failure or non-loopback host
 * returns false.
 */
export function isLoopbackCallback(callback: string): boolean {
  let url: URL;
  try {
    url = new URL(callback);
  } catch {
    return false;
  }

  if (url.protocol !== "http:") return false;

  // IPv6 hosts arrive bracketed (e.g. `[::1]`); normalize before comparing.
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return host === "127.0.0.1" || host === "::1" || host === "localhost";
}

/**
 * Builds the loopback redirect URL that hands the minted token back to the CLI.
 * The `state` nonce round-trips so the CLI can reject a mismatched callback.
 */
export function buildCallbackRedirect(opts: {
  callback: string;
  token: string;
  username: string;
  state: string;
}): string {
  const url = new URL(opts.callback);
  url.searchParams.set("token", opts.token);
  url.searchParams.set("username", opts.username);
  url.searchParams.set("state", opts.state);
  return url.toString();
}

/** Builds the loopback redirect URL used when the user cancels authorization. */
export function buildCancelRedirect(opts: {
  callback: string;
  state: string;
}): string {
  const url = new URL(opts.callback);
  url.searchParams.set("error", "access_denied");
  url.searchParams.set("state", opts.state);
  return url.toString();
}
