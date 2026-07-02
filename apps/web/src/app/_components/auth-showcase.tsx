import { isMultiUserAuthEnabled } from "@curiouslycory/auth";

import { getSession } from "~/auth/server";
import { SignOutButton } from "./sign-out-button";

export async function AuthShowcase() {
  const session = await getSession();

  if (!session) {
    return (
      <p className="text-muted-foreground text-center text-sm">Not logged in</p>
    );
  }

  const label = session.user.name || session.user.email;

  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-center text-sm">Logged in as {label}</p>
      {isMultiUserAuthEnabled() && <SignOutButton />}
    </div>
  );
}
