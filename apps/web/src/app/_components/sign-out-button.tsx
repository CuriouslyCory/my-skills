"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@curiouslycory/ui/button";

import { signOut } from "~/auth/client";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const handleSignOut = async () => {
    setPending(true);
    await signOut();
    router.push("/login");
    router.refresh();
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
