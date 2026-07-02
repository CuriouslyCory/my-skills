import { Suspense } from "react";

import {
  SettingsContent,
  SettingsContentSkeleton,
} from "~/app/_components/settings-page";
import { HydrateClient, prefetch, trpc } from "~/trpc/server";

export default function SettingsPage() {
  prefetch(trpc.config.getAll.queryOptions());
  prefetch(trpc.favorite.list.queryOptions());
  prefetch(trpc.github.status.queryOptions());
  prefetch(trpc.token.list.queryOptions());

  return (
    <HydrateClient>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">Configure your preferences.</p>
        </div>

        <Suspense fallback={<SettingsContentSkeleton />}>
          <SettingsContent />
        </Suspense>
      </div>
    </HydrateClient>
  );
}
