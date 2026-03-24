import { Suspense } from "react";
import Link from "next/link";

import { Button } from "@curiouslycory/ui/button";

import {
  CompositionList,
  CompositionListSkeleton,
} from "~/app/_components/composition-list";
import { HydrateClient, prefetch, trpc } from "~/trpc/server";

export default function CompositionsPage() {
  prefetch(trpc.composition.list.queryOptions());

  return (
    <HydrateClient>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Compositions</h1>
            <p className="text-muted-foreground">
              Build and manage your compositions.
            </p>
          </div>
          <Button asChild>
            <Link href="/compositions/new">New Composition</Link>
          </Button>
        </div>

        <Suspense fallback={<CompositionListSkeleton />}>
          <CompositionList />
        </Suspense>
      </div>
    </HydrateClient>
  );
}
