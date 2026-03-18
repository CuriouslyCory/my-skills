"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";

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
import { Badge } from "@curiouslycory/ui/badge";
import { Button } from "@curiouslycory/ui/button";
import { Card, CardContent } from "@curiouslycory/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@curiouslycory/ui/table";
import { toast } from "@curiouslycory/ui/toast";

import { useTRPC } from "~/trpc/react";

function formatDate(date: Date | string | null): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fragmentCount(fragments: string): number {
  try {
    return (JSON.parse(fragments) as string[]).length;
  } catch {
    return 0;
  }
}

export function CompositionList() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: compositions } = useSuspenseQuery(
    trpc.composition.list.queryOptions(),
  );

  const [deleteId, setDeleteId] = useState<string | null>(null);

  const deleteMutation = useMutation(
    trpc.composition.delete.mutationOptions({
      onSuccess: () => {
        toast.success("Composition deleted");
        setDeleteId(null);
        void queryClient.invalidateQueries({
          queryKey: trpc.composition.list.queryOptions().queryKey,
        });
      },
      onError: (error) => {
        toast.error(`Failed to delete: ${error.message}`);
      },
    }),
  );

  if (compositions.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12">
          <p className="text-muted-foreground">No saved compositions yet.</p>
          <Button asChild>
            <Link href="/compositions/new">Create your first composition</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-24 text-center">Fragments</TableHead>
              <TableHead className="w-32">Updated</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {compositions.map((comp) => (
              <TableRow key={comp.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/compositions/${comp.id}`}
                      className="font-medium hover:underline"
                    >
                      {comp.name}
                    </Link>
                    {comp.outdated && (
                      <Badge variant="destructive" className="text-xs">
                        outdated
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-muted-foreground line-clamp-1">
                    {comp.description ?? "—"}
                  </span>
                </TableCell>
                <TableCell className="text-center">
                  {fragmentCount(comp.fragments)}
                </TableCell>
                <TableCell>
                  <span className="text-muted-foreground text-xs">
                    {formatDate(comp.updatedAt)}
                  </span>
                </TableCell>
                <TableCell>
                  <AlertDialog
                    open={deleteId === comp.id}
                    onOpenChange={(open) =>
                      setDeleteId(open ? comp.id : null)
                    }
                  >
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm">
                        Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Delete Composition
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete &quot;{comp.name}
                          &quot;? This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() =>
                            deleteMutation.mutate({ id: comp.id })
                          }
                          className={cn(
                            "bg-destructive text-white hover:bg-destructive/90",
                          )}
                        >
                          {deleteMutation.isPending
                            ? "Deleting..."
                            : "Delete"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

export function CompositionListSkeleton() {
  return (
    <div className="rounded-md border">
      <div className="p-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "flex items-center gap-4 py-3",
              i > 0 && "border-t",
            )}
          >
            <div className="bg-muted h-4 w-40 animate-pulse rounded-sm" />
            <div className="bg-muted h-4 w-60 animate-pulse rounded-sm" />
            <div className="bg-muted h-4 w-12 animate-pulse rounded-sm" />
            <div className="bg-muted h-4 w-24 animate-pulse rounded-sm" />
          </div>
        ))}
      </div>
    </div>
  );
}
