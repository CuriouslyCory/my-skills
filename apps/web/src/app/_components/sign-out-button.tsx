"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@curiouslycory/ui/button";
import { toast } from "@curiouslycory/ui/toast";

import { signOut } from "~/auth/client";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const handleSignOut = async () => {
    setPending(true);
    try {
      const { error } = await signOut();
      if (!error) {
        router.push("/login");
        router.refresh();
        return; // stay pending while navigating away
      }
      toast.error(`Failed to sign out: ${error.message ?? error.statusText}`);
    } catch (error) {
      toast.error(
        `Failed to sign out: ${error instanceof Error ? error.message : "network error"}`,
      );
    }
    // Re-enable the button so the user can retry.
    setPending(false);
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleSignOut}
      disabled={pending}
    >
      {pending ? "Signing out..." : "Sign out"}
    </Button>
  );
}
