import { Suspense } from "react";

import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import {
  GitStatus,
  GitStatusSkeleton,
} from "~/app/_components/git-status";

export default function GitPage() {
  prefetch(trpc.git.status.queryOptions());
  prefetch(trpc.git.log.queryOptions({ maxCount: 20, offset: 0 }));
  prefetch(trpc.git.branches.queryOptions());

  return (
    <HydrateClient>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Git</h1>
          <p className="text-muted-foreground">
            View git status and manage commits.
          </p>
        </div>

        <Suspense fallback={<GitStatusSkeleton />}>
          <GitStatus />
        </Suspense>
      </div>
    </HydrateClient>
  );
}
