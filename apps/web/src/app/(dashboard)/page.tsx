import { Suspense } from "react";

import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import { AuthShowcase } from "~/app/_components/auth-showcase";
import { PostCardSkeleton, PostList } from "~/app/_components/posts";

export default function HomePage() {
  prefetch(trpc.post.all.queryOptions());

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
                <PostCardSkeleton />
                <PostCardSkeleton />
                <PostCardSkeleton />
              </div>
            }
          >
            <PostList />
          </Suspense>
        </div>
      </div>
    </HydrateClient>
  );
}
