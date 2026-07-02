import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { hostname, platform } from "node:os";

import type { Command } from "commander";
import chalk from "chalk";

import { createApiClient, resolveServerUrl } from "../core/api-client.js";
import { loadConfig } from "../core/config.js";
import { saveCredentials } from "../core/credentials.js";

/** Default time to wait for the browser callback before giving up. */
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export interface CallbackResult {
  token: string;
  username: string;
}

export interface CallbackServer {
  /** The ephemeral loopback port the server is listening on. */
  port: number;
  /** Resolves when the browser hits the callback; rejects on error/timeout. */
  waitForCallback: () => Promise<CallbackResult>;
  /** Tears down the server. Safe to call multiple times. */
  close: () => void;
}

/**
 * Starts a single-shot loopback HTTP server that captures the token minted by the
 * web `/cli-auth` flow. The returned `state` must round-trip unchanged (CSRF
 * guard); a mismatch, an `error` param, or a timeout rejects `waitForCallback`.
 */
export async function startCallbackServer(opts: {
  state: string;
  timeoutMs?: number;
}): Promise<CallbackServer> {
  let settle: ((result: CallbackResult) => void) | null = null;
  let fail: ((error: Error) => void) | null = null;
  let timer: NodeJS.Timeout | null = null;
  let closed = false;

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const params = url.searchParams;
    const error = params.get("error");
    const token = params.get("token");
    const username = params.get("username") ?? "";
    const state = params.get("state");

    const respond = (status: number, message: string) => {
      res.writeHead(status, { "content-type": "text/html; charset=utf-8" });
      res.end(htmlPage(message));
    };

    if (error) {
      respond(400, "Authorization was cancelled. You can close this tab.");
      fail?.(new Error(`Authorization failed: ${error}`));
      return;
    }
    if (state !== opts.state) {
      respond(400, "Invalid authorization state. You can close this tab.");
      fail?.(new Error("Callback state mismatch; aborting for safety."));
      return;
    }
    if (!token) {
      respond(400, "Missing token. You can close this tab.");
      fail?.(new Error("Callback did not include a token."));
      return;
    }

    respond(200, "Login successful. You can close this tab and return to your terminal.");
    settle?.({ token, username });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const { port } = server.address() as AddressInfo;

  const close = () => {
    if (closed) return;
    closed = true;
    if (timer) clearTimeout(timer);
    server.close();
  };

  const waitForCallback = () =>
    new Promise<CallbackResult>((resolve, reject) => {
      settle = (result) => {
        close();
        resolve(result);
      };
      fail = (err) => {
        close();
        reject(err);
      };
      timer = setTimeout(() => {
        fail?.(new Error("Timed out waiting for browser authorization."));
      }, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    });

  return { port, waitForCallback, close };
}

/** Builds the `/cli-auth` authorize URL for the given loopback callback. */
export function buildAuthorizeUrl(opts: {
  serverUrl: string;
  callbackUrl: string;
  name: string;
  state: string;
}): string {
  const url = new URL("/cli-auth", opts.serverUrl);
  url.searchParams.set("callback", opts.callbackUrl);
  url.searchParams.set("name", opts.name);
  url.searchParams.set("state", opts.state);
  return url.toString();
}

/** Opens a URL in the default browser without pulling in a dependency. */
function openBrowser(url: string): void {
  const command =
    platform() === "darwin"
      ? "open"
      : platform() === "win32"
        ? "cmd"
        : "xdg-open";
  const args = platform() === "win32" ? ["/c", "start", "", url] : [url];
  try {
    const child = spawn(command, args, { stdio: "ignore", detached: true });
    child.on("error", () => {
      /* opening the browser is best-effort; the URL is also printed */
    });
    child.unref();
  } catch {
    /* ignore: the URL is printed for the user to open manually */
  }
}

export function registerLoginCommand(program: Command): void {
  program
    .command("login")
    .description("Authenticate the CLI against the my-skills server")
    .option("--no-browser", "print the URL and paste the token instead")
    .action(async (options: { browser: boolean }) => {
      const config = await loadConfig();
      const serverUrl = resolveServerUrl({ config });
      const name = hostname();

      if (options.browser === false) {
        await runPasteFlow({ serverUrl, name });
        return;
      }

      await runBrowserFlow({ serverUrl, name });
    });
}

async function runBrowserFlow(opts: {
  serverUrl: string;
  name: string;
}): Promise<void> {
  const state = randomBytes(16).toString("hex");
  const callback = await startCallbackServer({ state });
  const callbackUrl = `http://127.0.0.1:${callback.port}`;
  const authorizeUrl = buildAuthorizeUrl({
    serverUrl: opts.serverUrl,
    callbackUrl,
    name: opts.name,
    state,
  });

  console.log(
    `Opening your browser to authorize ${chalk.bold(opts.name)}...\n` +
      `If it does not open, visit:\n  ${chalk.cyan(authorizeUrl)}\n`,
  );
  openBrowser(authorizeUrl);

  try {
    const { token, username } = await callback.waitForCallback();
    await saveCredentials({ serverUrl: opts.serverUrl, token, username });
    printLoggedIn(username, token, opts.serverUrl);
  } catch (error) {
    callback.close();
    console.error(
      chalk.red(
        `Login failed: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
    console.error(
      chalk.dim("Tip: run `ms login --no-browser` to paste a token manually."),
    );
    process.exitCode = 1;
  }
}

async function runPasteFlow(opts: {
  serverUrl: string;
  name: string;
}): Promise<void> {
  const state = randomBytes(16).toString("hex");
  const authorizeUrl = buildAuthorizeUrl({
    serverUrl: opts.serverUrl,
    // No loopback server in paste mode; the web page will show the token to copy.
    callbackUrl: "manual",
    name: opts.name,
    state,
  });

  console.log(
    `Visit this URL in a browser, authorize, then copy the token:\n  ${chalk.cyan(
      authorizeUrl,
    )}\n`,
  );

  const { default: input } = await import("@inquirer/input");
  const token = (
    await input({ message: "Paste your token:" })
  ).trim();

  if (!token) {
    console.error(chalk.red("No token provided."));
    process.exitCode = 1;
    return;
  }

  // Resolve the username from the server so credentials carry it.
  const client = createApiClient({ serverUrl: opts.serverUrl, token });
  let username = "";
  try {
    const session = await client.auth.getSession.query();
    if (!session?.user) {
      console.error(
        chalk.red("That token was rejected by the server. Please try again."),
      );
      process.exitCode = 1;
      return;
    }
    username = session.user.name || session.user.email || "";
  } catch (error) {
    console.error(
      chalk.red(
        `Could not verify the token: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ),
    );
    process.exitCode = 1;
    return;
  }

  await saveCredentials({ serverUrl: opts.serverUrl, token, username });
  printLoggedIn(username, token, opts.serverUrl);
}

function printLoggedIn(username: string, token: string, serverUrl: string): void {
  const prefix = token.slice(0, 8);
  console.log(
    `${chalk.green("✓")} Logged in as ${chalk.bold(username || "(unknown)")} ` +
      `${chalk.dim(`(${prefix}…)`)}\n` +
      chalk.dim(`  Server: ${serverUrl}`),
  );
}

function htmlPage(message: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>my-skills</title></head><body style="font-family: system-ui, sans-serif; padding: 3rem; text-align: center;"><h1>my-skills</h1><p>${message}</p></body></html>`;
}
