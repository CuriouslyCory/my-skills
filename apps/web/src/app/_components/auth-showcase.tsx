import { isAuthEnabled } from "@curiouslycory/auth";

import { getSession } from "~/auth/server";

export async function AuthShowcase() {
  if (!isAuthEnabled()) {
    return (
      <p className="text-muted-foreground text-center text-sm">
        Auth disabled (no ADMIN_USER set)
      </p>
    );
  }

  const session = await getSession();

  if (!session) {
    return (
      <p className="text-muted-foreground text-center text-sm">Not logged in</p>
    );
  }

  return (
    <p className="text-center text-sm">Logged in as {session.user.username}</p>
  );
}
