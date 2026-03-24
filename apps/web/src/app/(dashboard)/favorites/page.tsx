import { Suspense } from "react";

import {
  FavoriteList,
  FavoriteListSkeleton,
} from "~/app/_components/favorite-list";
import {
  FavoriteStats,
  FavoriteStatsSkeleton,
} from "~/app/_components/favorite-stats";
import { HydrateClient, prefetch, trpc } from "~/trpc/server";

export default function FavoritesPage() {
  prefetch(trpc.favorite.stats.queryOptions());
  prefetch(trpc.favorite.list.queryOptions());

  return (
    <HydrateClient>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Favorites</h1>
          <p className="text-muted-foreground">
            Your bookmarked repos and skills.
          </p>
        </div>

        <Suspense fallback={<FavoriteStatsSkeleton />}>
          <FavoriteStats />
        </Suspense>

        <Suspense fallback={<FavoriteListSkeleton />}>
          <FavoriteList />
        </Suspense>
      </div>
    </HydrateClient>
  );
}
