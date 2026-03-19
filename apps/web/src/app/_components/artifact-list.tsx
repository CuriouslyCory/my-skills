"use client";

import { useState } from "react";
import Link from "next/link";
import { useSuspenseQuery } from "@tanstack/react-query";

import type { RouterOutputs } from "@curiouslycory/api";
import { cn } from "@curiouslycory/ui";
import { Badge } from "@curiouslycory/ui/badge";
import { Button } from "@curiouslycory/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@curiouslycory/ui/card";

import { useTRPC } from "~/trpc/react";

type Artifact = RouterOutputs["artifact"]["list"][number];

const CATEGORIES = [
  { label: "All", value: undefined },
  { label: "Agents", value: "agent" as const },
  { label: "Prompts", value: "prompt" as const },
  { label: "Claude.mds", value: "claudemd" as const },
];

function parseTags(tags: string): string[] {
  try {
    return JSON.parse(tags) as string[];
  } catch {
    return [];
  }
}

export function ArtifactList() {
  const trpc = useTRPC();
  const [selectedCategory, setSelectedCategory] = useState<
    "agent" | "prompt" | "claudemd" | undefined
  >(undefined);

  const { data: artifacts } = useSuspenseQuery(
    trpc.artifact.list.queryOptions(
      selectedCategory ? { category: selectedCategory } : undefined,
    ),
  );

  return (
    <div className="space-y-6">
      {/* Category tabs */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => (
          <Button
            key={cat.label}
            variant={selectedCategory === cat.value ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedCategory(cat.value)}
          >
            {cat.label}
          </Button>
        ))}
      </div>

      {artifacts.length === 0 ? (
        <p className="text-muted-foreground">
          No artifacts found. Add artifacts to the artifacts/ directory.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {artifacts.map((artifact) => (
            <ArtifactCard key={artifact.id} artifact={artifact} />
          ))}
        </div>
      )}
    </div>
  );
}

function ArtifactCard({ artifact }: { artifact: Artifact }) {
  const tags = parseTags(artifact.tags);

  return (
    <Link href={`/artifacts/${artifact.category}/${artifact.id}`}>
      <Card className="hover:bg-accent/50 h-full transition-colors">
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-lg">{artifact.name}</CardTitle>
            {artifact.category && (
              <Badge variant="secondary" className="shrink-0">
                {artifact.category}
              </Badge>
            )}
          </div>
          <CardDescription className="line-clamp-2">
            {artifact.description}
          </CardDescription>
        </CardHeader>
        {tags.length > 0 && (
          <CardContent>
            <div className="flex flex-wrap gap-1">
              {tags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          </CardContent>
        )}
      </Card>
    </Link>
  );
}

export function ArtifactListSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-muted h-9 w-20 animate-pulse rounded-md" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <div
                className={cn(
                  "bg-muted h-5 w-2/3 animate-pulse rounded-sm",
                )}
              />
              <div
                className={cn(
                  "bg-muted mt-1 h-4 w-full animate-pulse rounded-sm",
                )}
              />
            </CardHeader>
            <CardContent>
              <div className="flex gap-1">
                <div className="bg-muted h-5 w-12 animate-pulse rounded-md" />
                <div className="bg-muted h-5 w-16 animate-pulse rounded-md" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
