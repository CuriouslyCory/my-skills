"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@curiouslycory/ui/button";
import { Checkbox } from "@curiouslycory/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@curiouslycory/ui/dialog";
import { Label } from "@curiouslycory/ui/label";
import { Textarea } from "@curiouslycory/ui/textarea";
import { toast } from "@curiouslycory/ui/toast";

import { useTRPC } from "~/trpc/react";

interface FileEntry {
  path: string;
  index: string;
  workingDir: string;
}

interface CommitDialogProps {
  files: FileEntry[];
  disabled?: boolean;
}

export function CommitDialog({ files, disabled }: CommitDialogProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

  const commitMutation = useMutation(
    trpc.git.commit.mutationOptions({
      onSuccess: (data) => {
        toast.success(`Committed ${data.hash.slice(0, 8)}`);
        setOpen(false);
        setMessage("");
        setSelectedFiles(new Set());
        void queryClient.invalidateQueries({
          queryKey: trpc.git.status.queryKey(),
        });
        void queryClient.invalidateQueries({
          queryKey: trpc.git.log.queryKey(),
        });
      },
      onError: (error) => {
        toast.error(`Commit failed: ${error.message}`);
      },
    }),
  );

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      // Pre-select all files when opening
      setSelectedFiles(new Set(files.map((f) => f.path)));
      setMessage("");
    }
  }

  function toggleFile(path: string) {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  function toggleAll() {
    if (selectedFiles.size === files.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(files.map((f) => f.path)));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button disabled={disabled}>Commit</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Commit Changes</DialogTitle>
          <DialogDescription>
            Select files to include and write a commit message.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            commitMutation.mutate({
              files: Array.from(selectedFiles),
              message,
            });
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Files</Label>
              <button
                type="button"
                onClick={toggleAll}
                className="text-muted-foreground hover:text-foreground text-xs underline"
              >
                {selectedFiles.size === files.length
                  ? "Deselect all"
                  : "Select all"}
              </button>
            </div>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
              {files.map((f) => (
                <label
                  key={f.path}
                  className="hover:bg-muted/50 flex items-center gap-2 rounded px-1 py-0.5"
                >
                  <Checkbox
                    checked={selectedFiles.has(f.path)}
                    onCheckedChange={() => toggleFile(f.path)}
                  />
                  <span className="truncate font-mono text-sm">{f.path}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="commit-message">Commit Message</Label>
            <Textarea
              id="commit-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe your changes..."
              rows={3}
              required
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                commitMutation.isPending ||
                selectedFiles.size === 0 ||
                !message.trim()
              }
            >
              {commitMutation.isPending ? (
                <>
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Committing...
                </>
              ) : (
                `Commit (${selectedFiles.size} file${selectedFiles.size !== 1 ? "s" : ""})`
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
