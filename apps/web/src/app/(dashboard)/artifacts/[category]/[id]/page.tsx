import { Suspense } from "react";

import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import { ArtifactDetail, ArtifactDetailSkeleton } from "./artifact-detail";

export default async function ArtifactDetailPage({
  params,
}: {
  params: Promise<{ category: string; id: string }>;
}) {
  const { category, id } = await params;

  prefetch(trpc.artifact.byId.queryOptions({ id }));
  prefetch(trpc.git.log.queryOptions({ maxCount: 20 }));

  return (
    <HydrateClient>
      <Suspense fallback={<ArtifactDetailSkeleton />}>
        <ArtifactDetail id={id} category={category} />
      </Suspense>
    </HydrateClient>
  );
}
