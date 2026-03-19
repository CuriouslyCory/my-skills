import { isAuthEnabled } from "@curiouslycory/auth";

import { getSession } from "~/auth/server";

export async function AuthShowcase() {
  if (!isAuthEnabled()) {
    return (
      <p className="text-center text-sm text-muted-foreground">
        Auth disabled (no ADMIN_USER set)
      </p>
    );
  }

  const session = await getSession();

  if (!session) {
    return (
      <p className="text-center text-sm text-muted-foreground">
        Not logged in
      </p>
    );
  }

  return (
    <p className="text-center text-sm">
      Logged in as {session.user.username}
    </p>
  );
}
