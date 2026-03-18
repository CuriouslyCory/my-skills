import { Suspense } from "react";

import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import {
  FragmentSelectionTable,
  FragmentSelectionTableSkeleton,
} from "~/app/_components/fragment-selection-table";

export default function NewCompositionPage() {
  prefetch(trpc.artifact.list.queryOptions({ category: "claudemd" }));

  return (
    <HydrateClient>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">
          New Composition
        </h1>
        <p className="text-muted-foreground">
          Select fragments to compose a CLAUDE.md file.
        </p>

        <Suspense fallback={<FragmentSelectionTableSkeleton />}>
          <FragmentSelectionTable />
        </Suspense>
      </div>
    </HydrateClient>
  );
}
