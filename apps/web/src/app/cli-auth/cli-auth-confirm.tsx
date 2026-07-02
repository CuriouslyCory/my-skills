"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { Button } from "@curiouslycory/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@curiouslycory/ui/card";

import { useTRPC } from "~/trpc/react";
import { buildCallbackRedirect, buildCancelRedirect } from "~/lib/cli-auth";

interface CliAuthConfirmProps {
  callback: string;
  name: string;
  state: string;
  username: string;
  /** Paste flow (`--no-browser`): show the token instead of redirecting. */
  manual: boolean;
}

/**
 * Explicit-consent screen for CLI authorization. Nothing is minted until the user
 * clicks Authorize, at which point a personal access token named after the
 * requesting host is created and handed back to the loopback callback (browser
 * flow) or displayed for copy/paste (`--no-browser`).
 */
export function CliAuthConfirm({
  callback,
  name,
  state,
  username,
  manual,
}: CliAuthConfirmProps) {
  const trpc = useTRPC();
  const [mintedToken, setMintedToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation(
    trpc.token.create.mutationOptions({
      onSuccess: (data) => {
        if (manual) {
          setMintedToken(data.token);
          return;
        }
        window.location.assign(
          buildCallbackRedirect({
            callback,
            token: data.token,
            username,
            state,
          }),
        );
      },
      onError: (err) => {
        setError(err.message);
      },
    }),
  );

  const handleCancel = () => {
    if (manual) {
      window.close();
      return;
    }
    window.location.assign(buildCancelRedirect({ callback, state }));
  };

  if (mintedToken) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Copy your token</CardTitle>
          <CardDescription>
            Paste this into your terminal. You won&apos;t be able to see it again.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <code className="bg-muted block overflow-x-auto rounded px-3 py-2 font-mono text-sm">
            {mintedToken}
          </code>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Authorize CLI on {name}?</CardTitle>
        <CardDescription>
          Signed in as <span className="font-medium">{username}</span>. This
          creates a personal access token named{" "}
          <span className="font-medium">{name}</span> that lets the my-skills CLI
          act on your behalf. You can revoke it any time in Settings.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-destructive text-sm">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={createMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => createMutation.mutate({ name })}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? "Authorizing..." : "Authorize"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
