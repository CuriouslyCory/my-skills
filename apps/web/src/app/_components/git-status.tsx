"use client";

import { Fragment, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";

import { cn } from "@curiouslycory/ui";
import { Badge } from "@curiouslycory/ui/badge";
import { Button } from "@curiouslycory/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@curiouslycory/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@curiouslycory/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@curiouslycory/ui/table";
import { toast } from "@curiouslycory/ui/toast";

import { CommitDialog } from "~/app/_components/commit-dialog";
import { DiffViewer } from "~/app/_components/diff-viewer";
import { useTRPC } from "~/trpc/react";

function statusLabel(index: string, workingDir: string): string {
  if (index === "A") return "staged (new)";
  if (index === "M") return "staged (modified)";
  if (index === "D") return "staged (deleted)";
  if (index === "R") return "staged (renamed)";
  if (workingDir === "M") return "modified";
  if (workingDir === "D") return "deleted";
  if (workingDir === "?") return "untracked";
  return `${index}${workingDir}`.trim();
}

function statusVariant(
  index: string,
  workingDir: string,
): "default" | "secondary" | "outline" | "destructive" {
  if (index !== " " && index !== "?") return "default"; // staged
  if (workingDir === "M") return "secondary"; // unstaged modified
  if (workingDir === "D") return "destructive"; // deleted
  return "outline"; // untracked
}

type FileGroup = "staged" | "unstaged" | "untracked";

function groupFile(index: string, workingDir: string): FileGroup {
  if (index !== " " && index !== "?") return "staged";
  if (workingDir === "?") return "untracked";
  return "unstaged";
}

function formatRelativeDate(date: Date | string | number): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const PAGE_SIZE = 20;

function CommitDiffRow({ commitHash }: { commitHash: string }) {
  const trpc = useTRPC();
  const { data, isLoading } = useQuery(
    trpc.git.diff.queryOptions({ commit: commitHash }),
  );

  return (
    <TableRow>
      <TableCell colSpan={4} className="p-0">
        <div className="p-4">
          {isLoading ? (
            <div className="text-muted-foreground flex items-center gap-2 py-4 text-sm">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Loading diff...
            </div>
          ) : (
            <DiffViewer diff={data?.diff ?? ""} />
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

export function GitStatus() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [expandedCommit, setExpandedCommit] = useState<string | null>(null);

  const { data: status } = useSuspenseQuery(trpc.git.status.queryOptions());

  const { data: logData } = useSuspenseQuery(
    trpc.git.log.queryOptions({
      maxCount: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
  );

  const { data: branchData } = useSuspenseQuery(
    trpc.git.branches.queryOptions(),
  );

  const pushMutation = useMutation(
    trpc.git.push.mutationOptions({
      onSuccess: () => {
        toast.success("Pushed successfully");
        void queryClient.invalidateQueries({
          queryKey: trpc.git.status.queryKey(),
        });
        void queryClient.invalidateQueries({
          queryKey: trpc.git.log.queryKey(),
        });
      },
      onError: (error) => {
        toast.error(`Push failed: ${error.message}`);
      },
    }),
  );

  const checkoutMutation = useMutation(
    trpc.git.checkout.mutationOptions({
      onSuccess: () => {
        toast.success("Branch switched");
        void queryClient.invalidateQueries({
          queryKey: trpc.git.status.queryKey(),
        });
        void queryClient.invalidateQueries({
          queryKey: trpc.git.log.queryKey(),
        });
        void queryClient.invalidateQueries({
          queryKey: trpc.git.branches.queryKey(),
        });
      },
      onError: (error) => {
        toast.error(`Checkout failed: ${error.message}`);
      },
    }),
  );

  const skillSyncMutation = useMutation(
    trpc.skill.syncFromDisk.mutationOptions(),
  );

  const artifactSyncMutation = useMutation(
    trpc.artifact.syncFromDisk.mutationOptions(),
  );

  const pullMutation = useMutation(
    trpc.git.pull.mutationOptions({
      onSuccess: () => {
        toast.success("Pulled successfully");
        void queryClient.invalidateQueries({
          queryKey: trpc.git.status.queryKey(),
        });
        void queryClient.invalidateQueries({
          queryKey: trpc.git.log.queryKey(),
        });
        void queryClient.invalidateQueries({
          queryKey: trpc.git.branches.queryKey(),
        });
        // Resync DB since files may have changed on disk
        skillSyncMutation.mutate();
        artifactSyncMutation.mutate();
      },
      onError: (error) => {
        toast.error(`Pull failed: ${error.message}`);
      },
    }),
  );

  const fetchMutation = useMutation(
    trpc.git.fetch.mutationOptions({
      onSuccess: () => {
        toast.success("Fetched successfully");
        void queryClient.invalidateQueries({
          queryKey: trpc.git.branches.queryKey(),
        });
      },
      onError: (error) => {
        toast.error(`Fetch failed: ${error.message}`);
      },
    }),
  );

  const grouped = {
    staged: status.files.filter(
      (f) => groupFile(f.index, f.workingDir) === "staged",
    ),
    unstaged: status.files.filter(
      (f) => groupFile(f.index, f.workingDir) === "unstaged",
    ),
    untracked: status.files.filter(
      (f) => groupFile(f.index, f.workingDir) === "untracked",
    ),
  };

  const totalPages = Math.ceil(logData.total / PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Branch & Status */}
      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-3">
          <CardTitle className="text-lg">Repository Status</CardTitle>
          <Badge variant={status.isClean ? "default" : "secondary"}>
            {status.isClean ? "Clean" : "Dirty"}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-sm">Branch:</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={checkoutMutation.isPending}
                >
                  {checkoutMutation.isPending ? (
                    <>
                      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Switching...
                    </>
                  ) : (
                    <span className="font-mono">{branchData.current}</span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuRadioGroup
                  value={branchData.current}
                  onValueChange={(branch) => {
                    if (branch !== branchData.current) {
                      checkoutMutation.mutate({ branch });
                    }
                  }}
                >
                  {branchData.all.map((branch) => (
                    <DropdownMenuRadioItem key={branch} value={branch}>
                      <span className="font-mono text-sm">{branch}</span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex flex-wrap gap-2">
            <CommitDialog
              files={status.files.map((f) => ({
                path: f.path,
                index: f.index,
                workingDir: f.workingDir,
              }))}
              disabled={status.files.length === 0}
            />
            <Button
              variant="outline"
              onClick={() => pullMutation.mutate()}
              disabled={pullMutation.isPending}
            >
              {pullMutation.isPending ? (
                <>
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Pulling...
                </>
              ) : (
                "Pull"
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => fetchMutation.mutate()}
              disabled={fetchMutation.isPending}
            >
              {fetchMutation.isPending ? (
                <>
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Fetching...
                </>
              ) : (
                "Fetch"
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => pushMutation.mutate()}
              disabled={pushMutation.isPending}
            >
              {pushMutation.isPending ? (
                <>
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Pushing...
                </>
              ) : (
                "Push"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Modified Files */}
      {status.files.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Changed Files</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {(["staged", "unstaged", "untracked"] as const).map((group) => {
              const files = grouped[group];
              if (files.length === 0) return null;
              return (
                <div key={group}>
                  <div className="bg-muted/50 border-b px-4 py-2">
                    <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                      {group} ({files.length})
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableBody>
                        {files.map((f) => (
                          <TableRow key={f.path}>
                            <TableCell className="font-mono text-sm">
                              {f.path}
                            </TableCell>
                            <TableCell className="w-40 text-right">
                              <Badge
                                variant={statusVariant(f.index, f.workingDir)}
                              >
                                {statusLabel(f.index, f.workingDir)}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Commit Log */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Commits</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Hash</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead className="w-36">Author</TableHead>
                  <TableHead className="w-28 text-right">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logData.commits.map((commit) => {
                  const isExpanded = expandedCommit === commit.hash;
                  return (
                    <Fragment key={commit.hash}>
                      <TableRow
                        className="cursor-pointer"
                        onClick={() =>
                          setExpandedCommit(isExpanded ? null : commit.hash)
                        }
                      >
                        <TableCell className="font-mono text-xs">
                          {commit.hash.slice(0, 8)}
                        </TableCell>
                        <TableCell className="max-w-md truncate text-sm">
                          {commit.message}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {commit.author}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-right text-xs">
                          {formatRelativeDate(commit.date)}
                        </TableCell>
                      </TableRow>
                      {isExpanded && <CommitDiffRow commitHash={commit.hash} />}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <span className="text-muted-foreground text-sm">
                Page {page + 1} of {totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function GitStatusSkeleton() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-3">
          <div className="bg-muted h-5 w-36 animate-pulse rounded-sm" />
          <div className="bg-muted h-5 w-16 animate-pulse rounded-full" />
        </CardHeader>
        <CardContent>
          <div className="bg-muted h-4 w-48 animate-pulse rounded-sm" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div className="bg-muted h-5 w-36 animate-pulse rounded-sm" />
        </CardHeader>
        <CardContent className="p-0">
          <div className="p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-center gap-4 py-3",
                  i > 0 && "border-t",
                )}
              >
                <div className="bg-muted h-4 w-20 animate-pulse rounded-sm" />
                <div className="bg-muted h-4 w-80 animate-pulse rounded-sm" />
                <div className="bg-muted h-4 w-24 animate-pulse rounded-sm" />
                <div className="bg-muted h-4 w-16 animate-pulse rounded-sm" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
