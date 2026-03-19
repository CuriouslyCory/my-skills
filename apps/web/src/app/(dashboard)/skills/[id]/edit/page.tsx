import { Suspense } from "react";

import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import { EditSkill, EditSkillSkeleton } from "./edit-skill";

export default async function EditSkillPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  prefetch(trpc.skill.byId.queryOptions({ id }));

  return (
    <HydrateClient>
      <Suspense fallback={<EditSkillSkeleton />}>
        <EditSkill id={id} />
      </Suspense>
    </HydrateClient>
  );
}
