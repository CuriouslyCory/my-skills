import { redirect } from "next/navigation";

import { isMultiUserAuthEnabled } from "@curiouslycory/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@curiouslycory/ui/card";

import { getSession } from "~/auth/server";
import { isLoopbackCallback } from "~/lib/cli-auth";
import { CliAuthConfirm } from "./cli-auth-confirm";

export const dynamic = "force-dynamic";

interface CliAuthPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

/**
 * CLI authorization screen (#23). The CLI sends `callback` (a loopback URL),
 * `name` (the requesting hostname / token name) and `state` (a CSRF nonce). The
 * user must be signed in and explicitly confirm before a token is minted.
 */
export default async function CliAuthPage({ searchParams }: CliAuthPageProps) {
  const params = await searchParams;
  const callback = first(params.callback);
  const name = first(params.name) || "CLI";
  const state = first(params.state);

  // The token is handed back on the callback URL, so it must be loopback.
  // `manual` is the sentinel the `--no-browser` paste flow uses (no redirect).
  const isManual = callback === "manual";
  if (!isManual && !isLoopbackCallback(callback)) {
    return (
      <Shell>
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Invalid authorization request</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            This CLI authorization link is missing a valid loopback callback and
            was blocked for your safety. Start again from your terminal with{" "}
            <code className="font-mono">ms login</code>.
          </CardContent>
        </Card>
      </Shell>
    );
  }

  // Require an authenticated session before showing the confirm screen. In local
  // single-user mode `getSession` always resolves; in multi-user mode, bounce
  // through login and return here afterwards.
  const session = await getSession();
  if (!session?.user) {
    if (isMultiUserAuthEnabled()) {
      const returnTo = buildReturnTo({ callback, name, state });
      redirect(`/login?redirect=${encodeURIComponent(returnTo)}`);
    }
    return (
      <Shell>
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Sign in required</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            You need to be signed in to authorize the CLI.
          </CardContent>
        </Card>
      </Shell>
    );
  }

  const username = session.user.name || session.user.email || "";

  return (
    <Shell>
      <CliAuthConfirm
        callback={callback}
        name={name}
        state={state}
        username={username}
        manual={isManual}
      />
    </Shell>
  );
}

function buildReturnTo(opts: {
  callback: string;
  name: string;
  state: string;
}): string {
  const search = new URLSearchParams({
    callback: opts.callback,
    name: opts.name,
    state: opts.state,
  });
  return `/cli-auth?${search.toString()}`;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      {children}
    </main>
  );
}
