"use client";

import { useState } from "react";
import {
  useMutation,
  useSuspenseQuery,
  useQueryClient,
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
      <FavoritesSection />
      <AgentDefaultsSection />
    </div>
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
        <form onSubmit={handleAdd} className="flex flex-col gap-3 sm:flex-row sm:items-end">
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
                          "bg-destructive text-white hover:bg-destructive/90",
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

  const [selected, setSelected] = useState<Set<string>>(
    new Set(savedAgents),
  );

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
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-lg border p-6">
          <div className="bg-muted mb-4 h-6 w-32 animate-pulse rounded" />
          <div className="bg-muted mb-2 h-4 w-48 animate-pulse rounded" />
          <div className="bg-muted h-10 w-full animate-pulse rounded" />
        </div>
      ))}
    </div>
  );
}
