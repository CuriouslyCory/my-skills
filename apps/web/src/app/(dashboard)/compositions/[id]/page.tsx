import { Suspense } from "react";

import {
  CompositionDetail,
  CompositionDetailSkeleton,
} from "~/app/_components/composition-detail";
import { HydrateClient, prefetch, trpc } from "~/trpc/server";

export default async function CompositionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  prefetch(trpc.composition.byId.queryOptions({ id }));
  prefetch(trpc.artifact.list.queryOptions({ category: "claudemd" }));

  return (
    <HydrateClient>
      <Suspense fallback={<CompositionDetailSkeleton />}>
        <CompositionDetail id={id} />
      </Suspense>
    </HydrateClient>
  );
}
