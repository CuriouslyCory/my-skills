import { redirect } from "next/navigation";

import { isMultiUserAuthEnabled } from "@curiouslycory/auth";

import { getSession } from "~/auth/server";
import { LoginForm } from "./login-form";

interface LoginPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Only relative in-app paths are honored, to prevent open-redirects. */
function safeRedirect(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const redirectTo = safeRedirect((await searchParams).redirect);

  // Local single-user mode has no sign-in; send users straight to the app.
  if (!isMultiUserAuthEnabled()) {
    redirect(redirectTo);
  }

  const session = await getSession();
  if (session) {
    redirect(redirectTo);
  }

  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm space-y-6 px-4">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold">my-skills</h1>
          <p className="text-muted-foreground">Sign in to continue</p>
        </div>
        <LoginForm redirectTo={redirectTo} />
      </div>
    </main>
  );
}
