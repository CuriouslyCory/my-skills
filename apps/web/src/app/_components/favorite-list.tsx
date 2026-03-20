"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { useEffect, useState } from "react";
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
import { Input } from "@curiouslycory/ui/input";
import { toast } from "@curiouslycory/ui/toast";

import { useTRPC } from "~/trpc/react";
import { DataTable } from "./data-table";

interface FavoriteItem {
  id: string;
  repoUrl: string;
  name: string;
  description: string | null;
  skillName: string | null;
  type: "repo" | "skill";
  addedAt: Date | string;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function formatDate(date: Date | string | null): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type TypeFilter = "all" | "repo" | "skill";

export function FavoriteList() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const debouncedSearch = useDebounce(search, 300);

  const { data } = useSuspenseQuery(
    trpc.favorite.list.queryOptions({
      search: debouncedSearch || undefined,
      type: typeFilter === "all" ? undefined : typeFilter,
    }),
  );

  const [deleteId, setDeleteId] = useState<string | null>(null);

  const deleteMutation = useMutation(
    trpc.favorite.remove.mutationOptions({
      onSuccess: () => {
        toast.success("Favorite removed");
        setDeleteId(null);
        void queryClient.invalidateQueries({
          queryKey: trpc.favorite.list.queryOptions().queryKey,
        });
        void queryClient.invalidateQueries({
          queryKey: trpc.favorite.stats.queryOptions().queryKey,
        });
      },
      onError: (error) => {
        toast.error(`Failed to remove: ${error.message}`);
      },
    }),
  );

  const columns: ColumnDef<FavoriteItem, unknown>[] = [
    {
      accessorKey: "name",
      header: "Name",
      enableSorting: true,
    },
    {
      accessorKey: "type",
      header: "Type",
      enableSorting: true,
      cell: ({ row }) => (
        <Badge variant={row.original.type === "repo" ? "secondary" : "outline"}>
          {row.original.type === "repo" ? "Repo" : "Skill"}
        </Badge>
      ),
    },
    {
      accessorKey: "repoUrl",
      header: "Repo URL",
      enableSorting: false,
    },
    {
      accessorKey: "skillName",
      header: "Skill Name",
      enableSorting: false,
      cell: ({ row }) => row.original.skillName ?? "—",
    },
    {
      accessorKey: "addedAt",
      header: "Added",
      enableSorting: true,
      cell: ({ row }) => formatDate(row.original.addedAt),
    },
    {
      id: "actions",
      header: "Actions",
      enableSorting: false,
      cell: ({ row }) => {
        const item = row.original;
        return (
          <AlertDialog
            open={deleteId === item.id}
            onOpenChange={(open) => setDeleteId(open ? item.id : null)}
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
                  Are you sure you want to remove &quot;{item.name}&quot; from
                  your favorites? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteMutation.mutate({ id: item.id })}
                  className={cn(
                    "bg-destructive text-white hover:bg-destructive/90",
                  )}
                >
                  {deleteMutation.isPending ? "Removing..." : "Remove"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        );
      },
    },
  ];

  if (data.items.length === 0 && !debouncedSearch && typeFilter === "all") {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <p className="text-muted-foreground">
            No favorites yet. Star repos and skills to see them here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Input
          placeholder="Search favorites..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <div className="flex gap-2">
          {(["all", "repo", "skill"] as const).map((type) => (
            <Button
              key={type}
              variant={typeFilter === type ? "default" : "outline"}
              size="sm"
              onClick={() => setTypeFilter(type)}
            >
              {type === "all" ? "All" : type === "repo" ? "Repos" : "Skills"}
            </Button>
          ))}
        </div>
      </div>
      <DataTable columns={columns} data={data.items as FavoriteItem[]} />
    </div>
  );
}

export function FavoriteListSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="h-10 w-full max-w-sm animate-pulse rounded-md bg-muted" />
        <div className="flex gap-2">
          <div className="h-8 w-14 animate-pulse rounded-md bg-muted" />
          <div className="h-8 w-16 animate-pulse rounded-md bg-muted" />
          <div className="h-8 w-14 animate-pulse rounded-md bg-muted" />
        </div>
      </div>
      <div className="animate-pulse rounded-md border">
        <div className="h-10 border-b bg-muted/50" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 border-b last:border-b-0 bg-muted/20" />
        ))}
      </div>
    </div>
  );
}
