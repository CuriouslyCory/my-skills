import { Suspense } from "react";

import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import { SkillDetail, SkillDetailSkeleton } from "./skill-detail";

export default async function SkillDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  prefetch(trpc.skill.byId.queryOptions({ id }));
  prefetch(trpc.git.log.queryOptions({ maxCount: 20 }));

  return (
    <HydrateClient>
      <Suspense fallback={<SkillDetailSkeleton />}>
        <SkillDetail id={id} />
      </Suspense>
    </HydrateClient>
  );
}
