"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@curiouslycory/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@curiouslycory/ui/dialog";
import { Input } from "@curiouslycory/ui/input";
import { Label } from "@curiouslycory/ui/label";
import { toast } from "@curiouslycory/ui/toast";

import { useTRPC } from "~/trpc/react";

type FavoriteType = "repo" | "skill";

const SHORTHAND_RE = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;

/** Convert `owner/repo` shorthand to a full GitHub URL, passthrough otherwise. */
function normalizeRepoUrl(input: string): string {
  const trimmed = input.trim();
  if (SHORTHAND_RE.test(trimmed)) {
    return `https://github.com/${trimmed}`;
  }
  return trimmed;
}

export function AddFavoriteDialog() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<FavoriteType>("repo");

  const resetForm = () => {
    setName("");
    setRepoUrl("");
    setDescription("");
    setType("repo");
  };

  const addMutation = useMutation(
    trpc.favorite.add.mutationOptions({
      onSuccess: () => {
        toast.success("Favorite added");
        resetForm();
        setOpen(false);
        void queryClient.invalidateQueries({
          queryKey: trpc.favorite.list.queryOptions().queryKey,
        });
        void queryClient.invalidateQueries({
          queryKey: trpc.favorite.stats.queryOptions().queryKey,
        });
      },
      onError: (error) => {
        toast.error(`Failed to add favorite: ${error.message}`);
      },
    }),
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !repoUrl.trim()) return;
    const resolved = normalizeRepoUrl(repoUrl);
    addMutation.mutate({
      name: name.trim(),
      repoUrl: resolved,
      description: description.trim() || undefined,
      type,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">+ Add Favorite</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Favorite</DialogTitle>
          <DialogDescription>
            Bookmark a repository or skill for quick access.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="add-fav-name">Name</Label>
            <Input
              id="add-fav-name"
              placeholder="My Project"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="add-fav-url">Repository URL</Label>
            <Input
              id="add-fav-url"
              placeholder="owner/repo or https://github.com/owner/repo"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="add-fav-desc">Description (optional)</Label>
            <Input
              id="add-fav-desc"
              placeholder="A brief description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <div className="flex gap-2">
              {(["repo", "skill"] as const).map((t) => (
                <Button
                  key={t}
                  type="button"
                  variant={type === t ? "default" : "outline"}
                  size="sm"
                  onClick={() => setType(t)}
                >
                  {t === "repo" ? "Repo" : "Skill"}
                </Button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              disabled={
                addMutation.isPending || !name.trim() || !repoUrl.trim()
              }
            >
              {addMutation.isPending ? "Adding..." : "Add Favorite"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
