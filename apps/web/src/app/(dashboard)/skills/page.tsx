import { resolve } from "node:path";
import { Suspense } from "react";

import { scanAndSync } from "@curiouslycory/api";
import { db } from "@curiouslycory/db/client";

import { SkillList, SkillListSkeleton } from "~/app/_components/skill-list";
import { env } from "~/env";
import { HydrateClient, prefetch, trpc } from "~/trpc/server";

export default async function SkillsPage() {
  const repoPath = env.REPO_PATH ?? resolve(process.cwd(), "../..");
  await scanAndSync(repoPath, db);
  prefetch(trpc.skill.list.queryOptions());

  return (
    <HydrateClient>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Skills</h1>
        <p className="text-muted-foreground">Browse and manage your skills.</p>

        <Suspense fallback={<SkillListSkeleton />}>
          <SkillList />
        </Suspense>
      </div>
    </HydrateClient>
  );
}
