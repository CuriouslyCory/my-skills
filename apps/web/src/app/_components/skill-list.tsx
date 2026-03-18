"use client";

import { useState } from "react";
import Link from "next/link";
import { useSuspenseQuery } from "@tanstack/react-query";

import type { RouterOutputs } from "@curiouslycory/api";
import { cn } from "@curiouslycory/ui";
import { Badge } from "@curiouslycory/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@curiouslycory/ui/card";

import { useTRPC } from "~/trpc/react";

type Skill = RouterOutputs["skill"]["list"][number];

function parseTags(tags: string): string[] {
  try {
    return JSON.parse(tags) as string[];
  } catch {
    return [];
  }
}

function collectAllTags(skills: Skill[]): string[] {
  const tagSet = new Set<string>();
  for (const skill of skills) {
    for (const tag of parseTags(skill.tags)) {
      tagSet.add(tag);
    }
  }
  return Array.from(tagSet).sort();
}

export function SkillList() {
  const trpc = useTRPC();
  const { data: skills } = useSuspenseQuery(trpc.skill.list.queryOptions());
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());

  const allTags = collectAllTags(skills);

  const filteredSkills =
    selectedTags.size === 0
      ? skills
      : skills.filter((skill) => {
          const tags = parseTags(skill.tags);
          return Array.from(selectedTags).some((t) => tags.includes(t));
        });

  function toggleTag(tag: string) {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
  }

  if (skills.length === 0) {
    return (
      <p className="text-muted-foreground">
        No skills found. Add skills to the skills/ directory.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {allTags.map((tag) => (
            <button key={tag} onClick={() => toggleTag(tag)}>
              <Badge
                variant={selectedTags.has(tag) ? "default" : "outline"}
                className="cursor-pointer"
              >
                {tag}
              </Badge>
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredSkills.map((skill) => (
          <SkillCard key={skill.id} skill={skill} />
        ))}
      </div>

      {filteredSkills.length === 0 && selectedTags.size > 0 && (
        <p className="text-muted-foreground">
          No skills match the selected tags.
        </p>
      )}
    </div>
  );
}

function SkillCard({ skill }: { skill: Skill }) {
  const tags = parseTags(skill.tags);

  return (
    <Link href={`/skills/${skill.id}`}>
      <Card className="hover:bg-accent/50 h-full transition-colors">
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-lg">{skill.name}</CardTitle>
            {skill.category && (
              <Badge variant="secondary" className="shrink-0">
                {skill.category}
              </Badge>
            )}
          </div>
          <CardDescription className="line-clamp-2">
            {skill.description}
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

export function SkillListSkeleton() {
  return (
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
  );
}
