import { Suspense } from "react";

import { AuthShowcase } from "~/app/_components/auth-showcase";
import {
  RecentSkillList,
  SkillCardSkeleton,
} from "~/app/_components/recent-skills";
import { HydrateClient, prefetch, trpc } from "~/trpc/server";

export default function HomePage() {
  prefetch(trpc.skill.list.queryOptions());

  return (
    <HydrateClient>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <AuthShowcase />
        </div>

        <div className="w-full max-w-2xl">
          <Suspense
            fallback={
              <div className="flex w-full flex-col gap-4">
                <SkillCardSkeleton />
                <SkillCardSkeleton />
                <SkillCardSkeleton />
              </div>
            }
          >
            <RecentSkillList />
          </Suspense>
        </div>
      </div>
    </HydrateClient>
  );
}
