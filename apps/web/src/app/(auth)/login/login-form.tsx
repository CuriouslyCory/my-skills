"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@curiouslycory/ui/button";
import { Input } from "@curiouslycory/ui/input";
import { Label } from "@curiouslycory/ui/label";

import { signIn } from "~/auth/client";
import { useAuthForm } from "../use-auth-form";

export function LoginForm({ redirectTo = "/" }: { redirectTo?: string }) {
  const router = useRouter();
  const { error, setError, pending, setPending, handleGithub } =
    useAuthForm(redirectTo);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setPending(true);
    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    const { error: signInError } = await signIn.email({ email, password });
    setPending(false);
    if (signInError) {
      setError(signInError.message ?? "Failed to sign in");
      return;
    }
    router.push(redirectTo);
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            autoFocus
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
        </div>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <Button type="submit" disabled={pending}>
          {pending ? "Signing in..." : "Sign in"}
        </Button>
      </form>
      <Button
        type="button"
        variant="outline"
        onClick={handleGithub}
        disabled={pending}
      >
        Continue with GitHub
      </Button>
      <p className="text-muted-foreground text-center text-sm">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="underline">
          Sign up
        </Link>
      </p>
    </div>
  );
}
