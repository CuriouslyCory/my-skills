"use client";

import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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

const PAGE_SIZE = 30;

type SortByField = "name" | "type" | "addedAt";
type SortOrder = "asc" | "desc";
type TypeFilter = "all" | "repo" | "skill";

const SORT_COLUMN_MAP: Record<string, SortByField> = {
  name: "name",
  type: "type",
  addedAt: "addedAt",
};

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

export function FavoriteList() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const router = useRouter();

  // Read state from URL params
  const urlSearch = searchParams.get("search") ?? "";
  const urlSort = (searchParams.get("sort") as SortByField | null) ?? undefined;
  const urlOrder = (searchParams.get("order") as SortOrder | null) ?? undefined;
  const urlPage = parseInt(searchParams.get("page") ?? "1", 10);
  const urlType = (searchParams.get("type") as TypeFilter | null) ?? "all";

  const [search, setSearch] = useState(urlSearch);
  const debouncedSearch = useDebounce(search, 300);

  // Sync URL search param changes back to local input state
  useEffect(() => {
    const s = searchParams.get("search") ?? "";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional setState for syncing URL params to state
    setSearch(s);
  }, [searchParams]);

  // Update URL params helper
  const updateParams = useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      }
      router.replace(`/favorites?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  // Sync debounced search to URL and reset page
  useEffect(() => {
    const currentSearch = searchParams.get("search") ?? "";
    if (debouncedSearch !== currentSearch) {
      updateParams({
        search: debouncedSearch || undefined,
        page: undefined, // reset to page 1
      });
    }
  }, [debouncedSearch, searchParams, updateParams]);

  const page = Math.max(1, urlPage);
  const typeFilter = urlType === "all" ? undefined : urlType;

  const { data } = useSuspenseQuery(
    trpc.favorite.list.queryOptions({
      search: debouncedSearch || undefined,
      type: typeFilter === "repo" || typeFilter === "skill" ? typeFilter : undefined,
      sortBy: urlSort,
      sortOrder: urlOrder,
      page,
      pageSize: PAGE_SIZE,
    }),
  );

  const totalPages = Math.max(1, Math.ceil(data.totalCount / PAGE_SIZE));

  // Convert URL sort state to tanstack SortingState
  const sorting: SortingState = useMemo(
    () => (urlSort ? [{ id: urlSort, desc: urlOrder === "desc" }] : []),
    [urlSort, urlOrder],
  );

  const handleSortingChange = useCallback(
    (updaterOrValue: SortingState | ((prev: SortingState) => SortingState)) => {
      const newSorting =
        typeof updaterOrValue === "function"
          ? updaterOrValue(sorting)
          : updaterOrValue;
      if (newSorting.length > 0) {
        const col = newSorting[0];
        if (col) {
          const sortBy = SORT_COLUMN_MAP[col.id];
          updateParams({
            sort: sortBy,
            order: col.desc ? "desc" : "asc",
            page: undefined, // reset page on sort change
          });
        }
      } else {
        updateParams({ sort: undefined, order: undefined, page: undefined });
      }
    },
    [sorting, updateParams],
  );

  const handleTypeFilter = useCallback(
    (type: TypeFilter) => {
      updateParams({
        type: type === "all" ? undefined : type,
        page: undefined, // reset page on filter change
      });
    },
    [updateParams],
  );

  const handlePageChange = useCallback(
    (newPage: number) => {
      updateParams({
        page: newPage === 1 ? undefined : String(newPage),
      });
    },
    [updateParams],
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

  if (data.items.length === 0 && !debouncedSearch && urlType === "all") {
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
              variant={urlType === type ? "default" : "outline"}
              size="sm"
              onClick={() => handleTypeFilter(type)}
            >
              {type === "all" ? "All" : type === "repo" ? "Repos" : "Skills"}
            </Button>
          ))}
        </div>
      </div>
      <DataTable
        columns={columns}
        data={data.items as FavoriteItem[]}
        sorting={sorting}
        onSortingChange={handleSortingChange}
        manualSorting
        manualPagination
        pageCount={totalPages}
        pagination={{ pageIndex: page - 1, pageSize: PAGE_SIZE }}
        onPaginationChange={(updater) => {
          const newState =
            typeof updater === "function"
              ? updater({ pageIndex: page - 1, pageSize: PAGE_SIZE })
              : updater;
          handlePageChange(newState.pageIndex + 1);
        }}
      />
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
