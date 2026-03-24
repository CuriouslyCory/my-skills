"use client";

import { useMemo } from "react";

import { cn } from "@curiouslycory/ui";

interface DiffViewerProps {
  diff: string;
}

interface DiffLine {
  type: "addition" | "deletion" | "context" | "header" | "meta";
  content: string;
  lineNumber?: number;
}

function parseDiffLines(diff: string): DiffLine[] {
  const lines = diff.split("\n");
  return lines.map((line) => {
    if (line.startsWith("diff --git") || line.startsWith("index ")) {
      return { type: "meta" as const, content: line };
    }
    if (
      line.startsWith("@@") ||
      line.startsWith("---") ||
      line.startsWith("+++")
    ) {
      return { type: "header" as const, content: line };
    }
    if (line.startsWith("+")) {
      return { type: "addition" as const, content: line };
    }
    if (line.startsWith("-")) {
      return { type: "deletion" as const, content: line };
    }
    return { type: "context" as const, content: line };
  });
}

const lineStyles: Record<DiffLine["type"], string> = {
  addition: "bg-green-500/15 text-green-700 dark:text-green-400",
  deletion: "bg-red-500/15 text-red-700 dark:text-red-400",
  context: "",
  header: "bg-blue-500/10 text-blue-700 dark:text-blue-400 font-medium",
  meta: "text-muted-foreground font-medium",
};

export function DiffViewer({ diff }: DiffViewerProps) {
  const lines = useMemo(() => parseDiffLines(diff), [diff]);

  if (!diff.trim()) {
    return (
      <p className="text-muted-foreground py-4 text-center text-sm">
        No changes in this commit.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <pre className="text-xs leading-relaxed">
        <code>
          {lines.map((line, i) => (
            <div
              key={i}
              className={cn(
                "px-4 py-0.5 whitespace-pre",
                lineStyles[line.type],
              )}
            >
              {line.content}
            </div>
          ))}
        </code>
      </pre>
    </div>
  );
}
