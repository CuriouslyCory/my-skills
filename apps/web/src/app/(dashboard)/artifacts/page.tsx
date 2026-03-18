import { Suspense } from "react";

import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import {
  ArtifactList,
  ArtifactListSkeleton,
} from "~/app/_components/artifact-list";

export default function ArtifactsPage() {
  prefetch(trpc.artifact.list.queryOptions());

  return (
    <HydrateClient>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Artifacts</h1>
            <p className="text-muted-foreground">
              Browse and manage your artifacts.
            </p>
          </div>
        </div>

        <Suspense fallback={<ArtifactListSkeleton />}>
          <ArtifactList />
        </Suspense>
      </div>
    </HydrateClient>
  );
}
