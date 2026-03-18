import { Suspense } from "react";

import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import { SkillList, SkillListSkeleton } from "~/app/_components/skill-list";

export default function SkillsPage() {
  prefetch(trpc.skill.list.queryOptions());

  return (
    <HydrateClient>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Skills</h1>
        <p className="text-muted-foreground">
          Browse and manage your skills.
        </p>

        <Suspense fallback={<SkillListSkeleton />}>
          <SkillList />
        </Suspense>
      </div>
    </HydrateClient>
  );
}
