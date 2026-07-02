import { Suspense } from "react";
import { notFound } from "next/navigation";

import { GitStatus, GitStatusSkeleton } from "~/app/_components/git-status";
import { env } from "~/env";
import { HydrateClient, prefetch, trpc } from "~/trpc/server";

export default function GitPage() {
  // The git page is filesystem-coupled and disabled in hosted mode (#26). Return
  // a 404 for direct navigation so hosted deployments never surface it.
  if (env.DEPLOY_MODE !== "local") {
    notFound();
  }

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
