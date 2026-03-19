"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@curiouslycory/ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@curiouslycory/ui/alert-dialog";
import { Badge } from "@curiouslycory/ui/badge";
import { Button } from "@curiouslycory/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@curiouslycory/ui/card";
import { Separator } from "@curiouslycory/ui/separator";

import { DiffViewer } from "~/app/_components/diff-viewer";
import { useTRPC } from "~/trpc/react";

function parseTags(tags: string): string[] {
  try {
    return JSON.parse(tags) as string[];
  } catch {
    return [];
  }
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 30) {
    return date.toLocaleDateString();
  }
  if (diffDays > 0) {
    return `${diffDays}d ago`;
  }
  if (diffHours > 0) {
    return `${diffHours}h ago`;
  }
  if (diffMins > 0) {
    return `${diffMins}m ago`;
  }
  return "just now";
}

function SkillCommitDiff({ commitHash }: { commitHash: string }) {
  const trpc = useTRPC();
  const { data, isLoading } = useQuery(
    trpc.git.diff.queryOptions({ commit: commitHash }),
  );

  return (
    <div className="mt-2">
      {isLoading ? (
        <div className="text-muted-foreground flex items-center gap-2 py-4 text-sm">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          Loading diff...
        </div>
      ) : (
        <DiffViewer diff={data?.diff ?? ""} />
      )}
    </div>
  );
}

export function SkillDetail({ id }: { id: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [expandedCommit, setExpandedCommit] = useState<string | null>(null);

  const { data: skill } = useSuspenseQuery(
    trpc.skill.byId.queryOptions({ id }),
  );

  const { data: gitLog } = useSuspenseQuery(
    trpc.git.log.queryOptions({
      path: skill?.dirPath ?? undefined,
      maxCount: 20,
    }),
  );

  const deleteMutation = useMutation(
    trpc.skill.delete.mutationOptions({
      onSuccess: () => {
        router.push("/skills");
      },
    }),
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

  const tags = parseTags(skill.tags);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/skills">&larr; Back</Link>
            </Button>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{skill.name}</h1>
          <p className="text-muted-foreground">{skill.description}</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={`/skills/${skill.id}/edit`}>Edit</Link>
          </Button>
          <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">Delete</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Skill</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete &quot;{skill.name}&quot;? This
                  will remove the skill from the database and delete its files
                  from disk. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteMutation.mutate({ id: skill.id })}
                  className={cn(
                    "bg-destructive text-white hover:bg-destructive/90",
                  )}
                >
                  {deleteMutation.isPending ? "Deleting..." : "Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main content */}
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="prose dark:prose-invert max-w-none pt-6">
              <Markdown remarkPlugins={[remarkGfm]}>
                {skill.content}
              </Markdown>
            </CardContent>
          </Card>
        </div>

        {/* Metadata sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Metadata</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-muted-foreground text-xs font-medium uppercase">
                  Name
                </p>
                <p className="text-sm">{skill.name}</p>
              </div>

              <div>
                <p className="text-muted-foreground text-xs font-medium uppercase">
                  Description
                </p>
                <p className="text-sm">{skill.description}</p>
              </div>

              {skill.category && (
                <div>
                  <p className="text-muted-foreground text-xs font-medium uppercase">
                    Category
                  </p>
                  <Badge variant="secondary" className="mt-1">
                    {skill.category}
                  </Badge>
                </div>
              )}

              {tags.length > 0 && (
                <div>
                  <p className="text-muted-foreground text-xs font-medium uppercase">
                    Tags
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {tags.map((tag) => (
                      <Badge key={tag} variant="outline">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {skill.author && (
                <div>
                  <p className="text-muted-foreground text-xs font-medium uppercase">
                    Author
                  </p>
                  <p className="text-sm">{skill.author}</p>
                </div>
              )}

              {skill.version && (
                <div>
                  <p className="text-muted-foreground text-xs font-medium uppercase">
                    Version
                  </p>
                  <p className="text-sm">{skill.version}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Version History */}
      <Separator />
      <div className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">
          Version History
        </h2>
        {gitLog.commits.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No commit history found for this skill.
          </p>
        ) : (
          <div className="space-y-2">
            {gitLog.commits.map((commit) => {
              const isExpanded = expandedCommit === commit.hash;
              return (
                <div key={commit.hash}>
                  <div
                    className="bg-muted/50 flex cursor-pointer items-start justify-between gap-4 rounded-lg border p-3 transition-colors hover:bg-muted"
                    onClick={() =>
                      setExpandedCommit(isExpanded ? null : commit.hash)
                    }
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {commit.message}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">
                          {commit.hash.slice(0, 8)}
                        </code>
                        {" by "}
                        {commit.author}
                      </p>
                    </div>
                    <p className="text-muted-foreground shrink-0 text-xs">
                      {formatRelativeDate(commit.date)}
                    </p>
                  </div>
                  {isExpanded && (
                    <SkillCommitDiff commitHash={commit.hash} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function SkillDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="bg-muted h-4 w-16 animate-pulse rounded" />
        <div className="bg-muted h-8 w-1/3 animate-pulse rounded" />
        <div className="bg-muted h-4 w-2/3 animate-pulse rounded" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="space-y-3 pt-6">
              <div className="bg-muted h-4 w-full animate-pulse rounded" />
              <div className="bg-muted h-4 w-5/6 animate-pulse rounded" />
              <div className="bg-muted h-4 w-4/6 animate-pulse rounded" />
              <div className="bg-muted h-4 w-full animate-pulse rounded" />
              <div className="bg-muted h-4 w-3/4 animate-pulse rounded" />
            </CardContent>
          </Card>
        </div>
        <div>
          <Card>
            <CardHeader>
              <div className="bg-muted h-4 w-20 animate-pulse rounded" />
            </CardHeader>
            <CardContent className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-1">
                  <div className="bg-muted h-3 w-16 animate-pulse rounded" />
                  <div className="bg-muted h-4 w-32 animate-pulse rounded" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
