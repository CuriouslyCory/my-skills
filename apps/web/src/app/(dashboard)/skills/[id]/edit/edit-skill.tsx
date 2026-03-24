"use client";

import Link from "next/link";
import { useSuspenseQuery } from "@tanstack/react-query";

import { Button } from "@curiouslycory/ui/button";
import { Card, CardContent } from "@curiouslycory/ui/card";

import { SkillEditor } from "~/app/_components/skill-editor";
import { useTRPC } from "~/trpc/react";

function parseTags(tags: string): string[] {
  try {
    return JSON.parse(tags) as string[];
  } catch {
    return [];
  }
}

export function EditSkill({ id }: { id: string }) {
  const trpc = useTRPC();
  const { data: skill } = useSuspenseQuery(
    trpc.skill.byId.queryOptions({ id }),
  );

  if (!skill) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold tracking-tight">Skill Not Found</h1>
        <p className="text-muted-foreground">
          The requested skill could not be found.
        </p>
        <Button asChild variant="outline">
          <Link href="/skills">Back to Skills</Link>
        </Button>
      </div>
    );
  }

  return (
    <SkillEditor
      mode="edit"
      skillId={skill.id}
      initialFrontmatter={{
        name: skill.name,
        description: skill.description,
        tags: parseTags(skill.tags),
        author: skill.author ?? "",
        version: skill.version ?? "",
      }}
      initialContent={skill.content}
      cancelHref={`/skills/${skill.id}`}
    />
  );
}

export function EditSkillSkeleton() {
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
