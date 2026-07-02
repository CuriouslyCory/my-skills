"use client";

import { useState } from "react";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";

import { cn } from "@curiouslycory/ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@curiouslycory/ui/alert-dialog";
import { Button } from "@curiouslycory/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@curiouslycory/ui/card";
import { Checkbox } from "@curiouslycory/ui/checkbox";
import { Input } from "@curiouslycory/ui/input";
import { Label } from "@curiouslycory/ui/label";
import { toast } from "@curiouslycory/ui/toast";

import { authClient } from "~/auth/client";
import { useTRPC } from "~/trpc/react";

const AGENT_OPTIONS = [
  { id: "claude-code", label: "Claude Code" },
  { id: "cursor", label: "Cursor" },
  { id: "cline", label: "Cline" },
  { id: "warp", label: "Warp" },
  { id: "amp", label: "Amp" },
  { id: "opencode", label: "OpenCode" },
  { id: "github-copilot", label: "GitHub Copilot" },
  { id: "codex", label: "Codex" },
  { id: "gemini-cli", label: "Gemini CLI" },
  { id: "kimi-code", label: "Kimi Code" },
] as const;

export function SettingsContent() {
  return (
    <div className="space-y-6">
      <GeneralSection />
      <ConnectorsSection />
      <PublishSection />
      <TokensSection />
      <FavoritesSection />
      <AgentDefaultsSection />
    </div>
  );
}

function ConnectorsSection() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: status } = useSuspenseQuery(
    trpc.github.status.queryOptions(),
  );

  const [connecting, setConnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const invalidateStatus = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.github.status.queryOptions().queryKey,
    });

  const verifyMutation = useMutation(
    trpc.github.verifyConnection.mutationOptions({
      onSuccess: (data) => {
        toast.success(`GitHub connection is healthy (@${data.login})`);
      },
      onError: (error) => {
        toast.error(error.message);
      },
    }),
  );

  const disconnectMutation = useMutation(
    trpc.github.disconnect.mutationOptions({
      onSuccess: () => {
        toast.success("GitHub disconnected");
        setConfirmDisconnect(false);
        void invalidateStatus();
      },
      onError: (error) => {
        toast.error(`Failed to disconnect: ${error.message}`);
      },
    }),
  );

  // Requests the `repo` scope via incremental authorization WITHOUT altering the
  // base sign-in scopes. better-auth's link-social flow adds the scope to the
  // existing GitHub account and returns to the settings page on completion.
  const handleConnect = async () => {
    setConnecting(true);
    const { error } = await authClient.linkSocial({
      provider: "github",
      scopes: ["repo"],
      callbackURL: "/settings",
    });
    if (error) {
      setConnecting(false);
      toast.error(error.message ?? "Failed to start GitHub authorization");
    }
    // On success the browser is redirected to GitHub, so no further work here.
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connectors</CardTitle>
        <CardDescription>
          Connect external services so my-skills can act on your behalf.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 rounded-md border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="font-medium">GitHub</p>
            {status.connected ? (
              <p className="text-muted-foreground text-sm">
                Connected with repo access. Granted scopes:{" "}
                {status.scopes.join(", ")}
              </p>
            ) : (
              <p className="text-muted-foreground text-sm">
                Grant repository access so you can publish your library to
                GitHub. Sign-in never requests this permission.
              </p>
            )}
          </div>

          {status.connected ? (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => verifyMutation.mutate()}
                disabled={verifyMutation.isPending}
              >
                {verifyMutation.isPending ? "Verifying..." : "Verify"}
              </Button>
              <AlertDialog
                open={confirmDisconnect}
                onOpenChange={setConfirmDisconnect}
              >
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    Disconnect
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Disconnect GitHub</AlertDialogTitle>
                    <AlertDialogDescription>
                      This removes the stored access token so my-skills can no
                      longer publish on your behalf. You can reconnect at any
                      time. To fully revoke access, also remove the app in your
                      GitHub settings.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => disconnectMutation.mutate()}
                      className={cn(
                        "bg-destructive hover:bg-destructive/90 text-white",
                      )}
                    >
                      {disconnectMutation.isPending
                        ? "Disconnecting..."
                        : "Disconnect"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ) : (
            <Button
              type="button"
              onClick={() => void handleConnect()}
              disabled={connecting}
            >
              {connecting ? "Redirecting..." : "Connect GitHub"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

const PUBLISH_STATE_LABEL: Record<string, string> = {
  published: "Published",
  changed: "Changed",
  pending: "Pending",
  excluded: "Excluded",
};

function formatDateTime(value: Date | null | undefined): string {
  if (!value) return "Never";
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function PublishSection() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: status } = useSuspenseQuery(trpc.publish.status.queryOptions());

  const [repoName, setRepoName] = useState(status.repoName ?? "");
  const [visibility, setVisibility] = useState<"public" | "private">(
    status.visibility,
  );
  const [selected, setSelected] = useState<Set<string>>(
    new Set(status.selection),
  );

  const invalidateStatus = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.publish.status.queryOptions().queryKey,
    });

  const configureMutation = useMutation(
    trpc.publish.configure.mutationOptions({
      onError: (error) => {
        toast.error(`Failed to save publish settings: ${error.message}`);
      },
    }),
  );

  const runMutation = useMutation(
    trpc.publish.run.mutationOptions({
      onSuccess: (data) => {
        toast.success(
          data.unchanged ? "Already up to date." : "Library published.",
        );
        void invalidateStatus();
      },
      onError: (error) => {
        toast.error(error.message);
      },
    }),
  );

  const toggleArtifact = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleSave = () => {
    configureMutation.mutate(
      {
        repoName: repoName.trim(),
        visibility,
        selection: [...selected],
      },
      {
        onSuccess: () => {
          toast.success("Publish settings saved.");
          void invalidateStatus();
        },
      },
    );
  };

  const handlePublish = async () => {
    // Persist the current form first so `run` publishes exactly what is shown.
    try {
      await configureMutation.mutateAsync({
        repoName: repoName.trim(),
        visibility,
        selection: [...selected],
      });
    } catch {
      return; // configure error already surfaced via toast
    }
    runMutation.mutate();
  };

  const canPublish =
    repoName.trim().length > 0 &&
    selected.size > 0 &&
    !runMutation.isPending &&
    !configureMutation.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Publish Library</CardTitle>
        <CardDescription>
          Publish your selected skills to a GitHub repository in the
          agentskills.io layout, so anyone can install them with{" "}
          <code className="font-mono text-xs">ms add owner/repo</code>. Requires a
          connected GitHub account with repo access (see Connectors above).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1">
            <Label htmlFor="publishRepo">Repository name</Label>
            <Input
              id="publishRepo"
              placeholder="my-skills"
              value={repoName}
              onChange={(e) => setRepoName(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Visibility</Label>
            <div className="flex gap-2">
              {(["public", "private"] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setVisibility(opt)}
                  className={cn(
                    "rounded-md border px-4 py-2 text-sm capitalize",
                    visibility === opt
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:bg-muted",
                  )}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Artifacts to include</Label>
          {status.artifacts.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Your library is empty. Create skills first, then publish them here.
            </p>
          ) : (
            <div className="divide-y rounded-md border">
              {status.artifacts.map((artifact) => (
                <div
                  key={artifact.name}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`publish-${artifact.name}`}
                      checked={selected.has(artifact.name)}
                      onCheckedChange={() => toggleArtifact(artifact.name)}
                    />
                    <Label
                      htmlFor={`publish-${artifact.name}`}
                      className="text-sm"
                    >
                      {artifact.name}{" "}
                      <span className="text-muted-foreground">
                        [{artifact.category}]
                      </span>
                    </Label>
                  </div>
                  <span className="text-muted-foreground text-xs">
                    {PUBLISH_STATE_LABEL[artifact.state] ?? artifact.state}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-muted/50 space-y-1 rounded-md border p-4 text-sm">
          <p>
            <span className="text-muted-foreground">Last published:</span>{" "}
            {formatDateTime(status.lastPublishedAt)}
          </p>
          {status.lastCommitSha && (
            <p className="text-muted-foreground font-mono text-xs">
              commit {status.lastCommitSha.slice(0, 7)}
            </p>
          )}
          {status.url && (
            <p>
              <a
                href={status.url}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline"
              >
                {status.url}
              </a>
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleSave}
            disabled={configureMutation.isPending}
          >
            {configureMutation.isPending ? "Saving..." : "Save"}
          </Button>
          <Button
            type="button"
            onClick={() => void handlePublish()}
            disabled={!canPublish}
          >
            {runMutation.isPending ? "Publishing..." : "Publish"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function formatDate(value: Date | null | undefined): string {
  if (!value) return "Never";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function TokensSection() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: tokens } = useSuspenseQuery(trpc.token.list.queryOptions());

  const [newName, setNewName] = useState("");
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [revokeId, setRevokeId] = useState<string | null>(null);

  const invalidateList = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.token.list.queryOptions().queryKey,
    });

  const createMutation = useMutation(
    trpc.token.create.mutationOptions({
      onSuccess: (data) => {
        // Shown exactly once: the plaintext is never returned again.
        setCreatedToken(data.token);
        setNewName("");
        toast.success("Token created");
        void invalidateList();
      },
      onError: (error) => {
        toast.error(`Failed to create token: ${error.message}`);
      },
    }),
  );

  const revokeMutation = useMutation(
    trpc.token.revoke.mutationOptions({
      onSuccess: () => {
        toast.success("Token revoked");
        setRevokeId(null);
        void invalidateList();
      },
      onError: (error) => {
        toast.error(`Failed to revoke token: ${error.message}`);
      },
    }),
  );

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    createMutation.mutate({ name: newName.trim() });
  };

  const handleCopy = async () => {
    if (!createdToken) return;
    try {
      await navigator.clipboard.writeText(createdToken);
      toast.success("Token copied to clipboard");
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>API Tokens</CardTitle>
        <CardDescription>
          Personal access tokens let the CLI and CI act on your behalf. A token is
          shown in full only once, right after you create it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          onSubmit={handleCreate}
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <div className="flex-1 space-y-1">
            <Label htmlFor="tokenName">Name</Label>
            <Input
              id="tokenName"
              placeholder="My laptop CLI"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </div>
          <Button
            type="submit"
            disabled={createMutation.isPending || !newName.trim()}
          >
            {createMutation.isPending ? "Creating..." : "Create token"}
          </Button>
        </form>

        {createdToken && (
          <div className="border-primary/50 bg-muted space-y-2 rounded-md border p-4">
            <p className="text-sm font-medium">
              Copy your new token now. You won&apos;t be able to see it again.
            </p>
            <div className="flex items-center gap-2">
              <code className="bg-background flex-1 overflow-x-auto rounded px-3 py-2 font-mono text-sm">
                {createdToken}
              </code>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleCopy()}
              >
                Copy
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setCreatedToken(null)}
              >
                Dismiss
              </Button>
            </div>
          </div>
        )}

        {tokens.length === 0 ? (
          <p className="text-muted-foreground text-sm">No API tokens yet.</p>
        ) : (
          <div className="divide-y rounded-md border">
            {tokens.map((token) => (
              <div
                key={token.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div className="space-y-1">
                  <p className="font-medium">{token.name}</p>
                  <p className="text-muted-foreground font-mono text-xs">
                    {token.tokenPrefix}
                    {"…"}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Last used: {formatDate(token.lastUsedAt)} &middot; Created:{" "}
                    {formatDate(token.createdAt)}
                  </p>
                </div>
                <AlertDialog
                  open={revokeId === token.id}
                  onOpenChange={(open) => setRevokeId(open ? token.id : null)}
                >
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm">
                      Revoke
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Revoke token</AlertDialogTitle>
                      <AlertDialogDescription>
                        Revoking &quot;{token.name}&quot; immediately stops it from
                        authenticating. Any CLI or CI using it will need a new
                        token.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => revokeMutation.mutate({ id: token.id })}
                        className={cn(
                          "bg-destructive hover:bg-destructive/90 text-white",
                        )}
                      >
                        {revokeMutation.isPending ? "Revoking..." : "Revoke"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function GeneralSection() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: allConfig } = useSuspenseQuery(
    trpc.config.getAll.queryOptions(),
  );

  const configMap = new Map(allConfig.map((c) => [c.key, c.value]));

  const setMutation = useMutation(
    trpc.config.set.mutationOptions({
      onSuccess: () => {
        toast.success("Setting saved");
        void queryClient.invalidateQueries({
          queryKey: trpc.config.getAll.queryOptions().queryKey,
        });
      },
      onError: (error) => {
        toast.error(`Failed to save: ${error.message}`);
      },
    }),
  );

  const [autoDetect, setAutoDetect] = useState(
    configMap.get("autoDetectAgents") !== "false",
  );
  const [symlinkBehavior, setSymlinkBehavior] = useState(
    configMap.get("symlinkBehavior") ?? "symlink",
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>General</CardTitle>
        <CardDescription>Global preferences for my-skills.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Checkbox
            id="autoDetect"
            checked={autoDetect}
            onCheckedChange={(checked) => {
              const val = checked === true;
              setAutoDetect(val);
              setMutation.mutate({
                key: "autoDetectAgents",
                value: String(val),
              });
            }}
          />
          <Label htmlFor="autoDetect">Auto-detect agents in projects</Label>
        </div>

        <div className="space-y-2">
          <Label>Symlink behavior</Label>
          <div className="flex gap-4">
            {(["symlink", "copy"] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  setSymlinkBehavior(opt);
                  setMutation.mutate({
                    key: "symlinkBehavior",
                    value: opt,
                  });
                }}
                className={cn(
                  "rounded-md border px-4 py-2 text-sm capitalize",
                  symlinkBehavior === opt
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-muted",
                )}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FavoritesSection() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: favoritesData } = useSuspenseQuery(
    trpc.favorite.list.queryOptions(),
  );
  const favoritesList = favoritesData.items;

  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const addMutation = useMutation(
    trpc.favorite.add.mutationOptions({
      onSuccess: () => {
        toast.success("Favorite added");
        setNewName("");
        setNewUrl("");
        void queryClient.invalidateQueries({
          queryKey: trpc.favorite.list.queryOptions().queryKey,
        });
      },
      onError: (error) => {
        toast.error(`Failed to add favorite: ${error.message}`);
      },
    }),
  );

  const removeMutation = useMutation(
    trpc.favorite.remove.mutationOptions({
      onSuccess: () => {
        toast.success("Favorite removed");
        setDeleteId(null);
        void queryClient.invalidateQueries({
          queryKey: trpc.favorite.list.queryOptions().queryKey,
        });
      },
      onError: (error) => {
        toast.error(`Failed to remove favorite: ${error.message}`);
      },
    }),
  );

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newUrl.trim()) return;
    addMutation.mutate({ name: newName.trim(), repoUrl: newUrl.trim() });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Favorites</CardTitle>
        <CardDescription>
          Manage your favorite repositories for quick access.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          onSubmit={handleAdd}
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <div className="flex-1 space-y-1">
            <Label htmlFor="favName">Name</Label>
            <Input
              id="favName"
              placeholder="My Project"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </div>
          <div className="flex-[2] space-y-1">
            <Label htmlFor="favUrl">Repository URL</Label>
            <Input
              id="favUrl"
              placeholder="https://github.com/user/repo"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
            />
          </div>
          <Button
            type="submit"
            disabled={
              addMutation.isPending || !newName.trim() || !newUrl.trim()
            }
          >
            {addMutation.isPending ? "Adding..." : "Add"}
          </Button>
        </form>

        {favoritesList.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No favorite repositories yet.
          </p>
        ) : (
          <div className="divide-y rounded-md border">
            {favoritesList.map((fav) => (
              <div
                key={fav.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div>
                  <p className="font-medium">{fav.name}</p>
                  <p className="text-muted-foreground text-sm">{fav.repoUrl}</p>
                </div>
                <AlertDialog
                  open={deleteId === fav.id}
                  onOpenChange={(open) => setDeleteId(open ? fav.id : null)}
                >
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm">
                      Remove
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove Favorite</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to remove &quot;{fav.name}&quot;
                        from your favorites?
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => removeMutation.mutate({ id: fav.id })}
                        className={cn(
                          "bg-destructive hover:bg-destructive/90 text-white",
                        )}
                      >
                        {removeMutation.isPending ? "Removing..." : "Remove"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AgentDefaultsSection() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: allConfig } = useSuspenseQuery(
    trpc.config.getAll.queryOptions(),
  );

  const configMap = new Map(allConfig.map((c) => [c.key, c.value]));
  const savedAgents: string[] = (() => {
    try {
      const raw = configMap.get("defaultAgents");
      if (!raw) return [];
      return JSON.parse(raw) as string[];
    } catch {
      return [];
    }
  })();

  const [selected, setSelected] = useState<Set<string>>(new Set(savedAgents));

  const setMutation = useMutation(
    trpc.config.set.mutationOptions({
      onSuccess: () => {
        toast.success("Default agents updated");
        void queryClient.invalidateQueries({
          queryKey: trpc.config.getAll.queryOptions().queryKey,
        });
      },
      onError: (error) => {
        toast.error(`Failed to save: ${error.message}`);
      },
    }),
  );

  const toggleAgent = (agentId: string) => {
    const next = new Set(selected);
    if (next.has(agentId)) {
      next.delete(agentId);
    } else {
      next.add(agentId);
    }
    setSelected(next);
    setMutation.mutate({
      key: "defaultAgents",
      value: JSON.stringify([...next]),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Agent Defaults</CardTitle>
        <CardDescription>
          Select which agents skills should target by default.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {AGENT_OPTIONS.map((agent) => (
            <div key={agent.id} className="flex items-center gap-2">
              <Checkbox
                id={`agent-${agent.id}`}
                checked={selected.has(agent.id)}
                onCheckedChange={() => toggleAgent(agent.id)}
              />
              <Label htmlFor={`agent-${agent.id}`} className="text-sm">
                {agent.label}
              </Label>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function SettingsContentSkeleton() {
  return (
    <div className="space-y-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-lg border p-6">
          <div className="bg-muted mb-4 h-6 w-32 animate-pulse rounded" />
          <div className="bg-muted mb-2 h-4 w-48 animate-pulse rounded" />
          <div className="bg-muted h-10 w-full animate-pulse rounded" />
        </div>
      ))}
    </div>
  );
}
