import { redirect } from "next/navigation";

import { isMultiUserAuthEnabled } from "@curiouslycory/auth";

import { getSession } from "~/auth/server";
import { SignupForm } from "./signup-form";

export default async function SignupPage() {
  // Local single-user mode has no sign-up; send users straight to the app.
  if (!isMultiUserAuthEnabled()) {
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
          <p className="text-muted-foreground">Create your account</p>
        </div>
        <SignupForm />
      </div>
    </main>
  );
}
