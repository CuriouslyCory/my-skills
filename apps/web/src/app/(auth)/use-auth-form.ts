import { useState } from "react";

import { signIn } from "~/auth/client";

/**
 * Shared state for the sign-in and sign-up forms: the pending/error pair both
 * forms drive from their email submit handlers, plus the "Continue with GitHub"
 * handler they both render. `githubCallbackURL` is where better-auth returns
 * the user after the GitHub OAuth round-trip.
 */
export function useAuthForm(githubCallbackURL: string) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleGithub = async () => {
    setError(null);
    setPending(true);
    const { error: githubError } = await signIn.social({
      provider: "github",
      callbackURL: githubCallbackURL,
    });
    // On success the browser is redirected to GitHub, so stay pending.
    if (githubError) {
      setPending(false);
      setError(githubError.message ?? "Failed to start GitHub sign-in");
    }
  };

  return { error, setError, pending, setPending, handleGithub };
}
