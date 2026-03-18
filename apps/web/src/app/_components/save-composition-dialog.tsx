"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";

import { Button } from "@curiouslycory/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@curiouslycory/ui/dialog";
import { Input } from "@curiouslycory/ui/input";
import { Label } from "@curiouslycory/ui/label";
import { Textarea } from "@curiouslycory/ui/textarea";
import { toast } from "@curiouslycory/ui/toast";

import { useTRPC } from "~/trpc/react";

interface SaveCompositionDialogProps {
  fragmentIds: string[];
  orderedIds: string[];
  disabled?: boolean;
}

export function SaveCompositionDialog({
  fragmentIds,
  orderedIds,
  disabled,
}: SaveCompositionDialogProps) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const createMutation = useMutation(
    trpc.composition.create.mutationOptions({
      onSuccess: (data) => {
        toast.success("Composition saved");
        setOpen(false);
        setName("");
        setDescription("");
        if (data) {
          router.push(`/compositions/${data.id}`);
        }
      },
      onError: (error) => {
        toast.error(`Failed to save: ${error.message}`);
      },
    }),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={disabled}>Save Composition</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save Composition</DialogTitle>
          <DialogDescription>
            Give your composition a name and optional description.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate({
              name,
              description: description || undefined,
              fragments: fragmentIds,
              order: orderedIds,
            });
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="composition-name">Name</Label>
            <Input
              id="composition-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My CLAUDE.md composition"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="composition-description">Description</Label>
            <Textarea
              id="composition-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description..."
              rows={3}
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
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
