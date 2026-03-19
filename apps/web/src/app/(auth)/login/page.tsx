import { redirect } from "next/navigation";

import { isAuthEnabled } from "@curiouslycory/auth";

import { getSession } from "~/auth/server";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (!isAuthEnabled()) {
    redirect("/");
  }

  const session = await getSession();
  if (session) {
    redirect("/");
  }

  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm space-y-6 px-4">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold">my-skills</h1>
          <p className="text-muted-foreground">Sign in to continue</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
