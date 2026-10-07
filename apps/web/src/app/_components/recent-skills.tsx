"use client";

import Link from "next/link";
import { useSuspenseQuery } from "@tanstack/react-query";

import type { RouterOutputs } from "@curiouslycory/api";
import { cn } from "@curiouslycory/ui";

import { useTRPC } from "~/trpc/react";

const RECENT_SKILL_LIMIT = 10;

export function RecentSkillList() {
  const trpc = useTRPC();
  // `skill.list` is scoped to the signed-in user and ordered newest first.
  const { data: skills } = useSuspenseQuery(trpc.skill.list.queryOptions());
  const recent = skills.slice(0, RECENT_SKILL_LIMIT);

  if (recent.length === 0) {
    return (
      <div className="relative flex w-full flex-col gap-4">
        <SkillCardSkeleton pulse={false} />

        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/10">
          <p className="text-2xl font-bold text-white">No skills yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-4">
      {recent.map((skill) => {
        return <SkillCard key={skill.id} skill={skill} />;
      })}
    </div>
  );
}

export function SkillCard(props: {
  skill: RouterOutputs["skill"]["list"][number];
}) {
  return (
    <Link
      href={`/skills/${props.skill.id}`}
      className="bg-muted hover:bg-muted/80 flex flex-row rounded-lg p-4"
    >
      <div className="grow">
        <h2 className="text-primary text-2xl font-bold">{props.skill.name}</h2>
        <p className="mt-2 text-sm">{props.skill.description}</p>
      </div>
    </Link>
  );
}

export function SkillCardSkeleton(props: { pulse?: boolean }) {
  const { pulse = true } = props;
  return (
    <div className="bg-muted flex flex-row rounded-lg p-4">
      <div className="grow">
        <h2
          className={cn(
            "bg-primary w-1/4 rounded-sm text-2xl font-bold",
            pulse && "animate-pulse",
          )}
        >
          &nbsp;
        </h2>
        <p
          className={cn(
            "mt-2 w-1/3 rounded-sm bg-current text-sm",
            pulse && "animate-pulse",
          )}
        >
          &nbsp;
        </p>
      </div>
    </div>
  );
}
