"use client";

import Link from "next/link";
import { useSuspenseQuery } from "@tanstack/react-query";

import { Button } from "@curiouslycory/ui/button";
import { Card, CardContent } from "@curiouslycory/ui/card";

import { ArtifactEditor } from "~/app/_components/artifact-editor";
import { useTRPC } from "~/trpc/react";

function parseTags(tags: string): string[] {
  try {
    return JSON.parse(tags) as string[];
  } catch {
    return [];
  }
}

export function EditArtifact({
  id,
  category,
}: {
  id: string;
  category: "agent" | "prompt" | "claudemd";
}) {
  const trpc = useTRPC();
  const { data: artifact } = useSuspenseQuery(
    trpc.artifact.byId.queryOptions({ id }),
  );

  if (!artifact) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold tracking-tight">
          Artifact Not Found
        </h1>
        <p className="text-muted-foreground">
          The requested artifact could not be found.
        </p>
        <Button asChild variant="outline">
          <Link href="/artifacts">Back to Artifacts</Link>
        </Button>
      </div>
    );
  }

  return (
    <ArtifactEditor
      mode="edit"
      artifactId={artifact.id}
      category={category}
      initialFrontmatter={{
        name: artifact.name,
        description: artifact.description,
        tags: parseTags(artifact.tags),
        author: artifact.author ?? "",
        version: artifact.version ?? "",
      }}
      initialContent={artifact.content}
      cancelHref={`/artifacts/${category}/${artifact.id}`}
    />
  );
}

export function EditArtifactSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="bg-muted h-4 w-16 animate-pulse rounded" />
        <div className="bg-muted h-8 w-1/3 animate-pulse rounded" />
      </div>
      <Card>
        <CardContent className="space-y-4 pt-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <div className="bg-muted h-3 w-20 animate-pulse rounded" />
              <div className="bg-muted h-9 w-full animate-pulse rounded" />
            </div>
          ))}
        </CardContent>
      </Card>
      <div className="bg-muted h-[300px] animate-pulse rounded-lg" />
    </div>
  );
}
