import { Suspense } from "react";

import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import {
  SettingsContent,
  SettingsContentSkeleton,
} from "~/app/_components/settings-page";

export default function SettingsPage() {
  prefetch(trpc.config.getAll.queryOptions());
  prefetch(trpc.config.favorites.list.queryOptions());

  return (
    <HydrateClient>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">
            Configure your preferences.
          </p>
        </div>

        <Suspense fallback={<SettingsContentSkeleton />}>
          <SettingsContent />
        </Suspense>
      </div>
    </HydrateClient>
  );
}
