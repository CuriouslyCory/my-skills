"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useSuspenseQuery } from "@tanstack/react-query";

import { Badge } from "@curiouslycory/ui/badge";
import { Button } from "@curiouslycory/ui/button";

import { useTRPC } from "~/trpc/react";
import {
  FragmentSelectionTable,
  FragmentSelectionTableSkeleton,
} from "./fragment-selection-table";

export function CompositionDetail({ id }: { id: string }) {
  const trpc = useTRPC();
  const { data: composition } = useSuspenseQuery(
    trpc.composition.byId.queryOptions({ id }),
  );

  const initialSelection = useMemo(() => {
    if (!composition) return {};
    const fragmentIds: string[] = JSON.parse(composition.fragments);
    const sel: Record<string, boolean> = {};
    for (const fid of fragmentIds) {
      sel[fid] = true;
    }
    return sel;
  }, [composition]);

  const initialOrder = useMemo(() => {
    if (!composition) return [];
    const order: string[] = JSON.parse(composition.order);
    if (order.length > 0) return order;
    return JSON.parse(composition.fragments) as string[];
  }, [composition]);

  if (!composition) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold tracking-tight">
          Composition Not Found
        </h1>
        <p className="text-muted-foreground">
          The requested composition could not be found.
        </p>
        <Button asChild variant="outline">
          <Link href="/compositions">Back to Compositions</Link>
        </Button>
      </div>
    );
  }

  // Check if any fragment has been updated after the composition
  const outdated =
    composition.resolvedFragments?.some(
      (f) => f !== undefined && f.updatedAt && f.updatedAt > composition.updatedAt,
    ) ?? false;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/compositions">&larr; Back</Link>
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">
            {composition.name}
          </h1>
          {outdated && (
            <Badge variant="destructive">outdated</Badge>
          )}
        </div>
        {composition.description && (
          <p className="text-muted-foreground">{composition.description}</p>
        )}
      </div>

      <FragmentSelectionTable
        initialSelection={initialSelection}
        initialOrder={initialOrder}
        compositionId={composition.id}
        compositionName={composition.name}
        compositionDescription={composition.description ?? ""}
      />
    </div>
  );
}

export function CompositionDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="bg-muted h-4 w-16 animate-pulse rounded" />
        <div className="bg-muted h-8 w-1/3 animate-pulse rounded" />
        <div className="bg-muted h-4 w-2/3 animate-pulse rounded" />
      </div>
      <FragmentSelectionTableSkeleton />
    </div>
  );
}
