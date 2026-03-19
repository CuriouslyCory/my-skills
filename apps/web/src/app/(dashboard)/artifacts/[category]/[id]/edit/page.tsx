import { Suspense } from "react";

import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import { EditArtifact, EditArtifactSkeleton } from "./edit-artifact";

export default async function EditArtifactPage({
  params,
}: {
  params: Promise<{ category: string; id: string }>;
}) {
  const { category, id } = await params;

  prefetch(trpc.artifact.byId.queryOptions({ id }));

  return (
    <HydrateClient>
      <Suspense fallback={<EditArtifactSkeleton />}>
        <EditArtifact
          id={id}
          category={category as "agent" | "prompt" | "claudemd"}
        />
      </Suspense>
    </HydrateClient>
  );
}
