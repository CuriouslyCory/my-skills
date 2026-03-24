"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";

import { Button } from "@curiouslycory/ui/button";
import { toast } from "@curiouslycory/ui/toast";

import type { SkillFrontmatter } from "./frontmatter-form";
import type { PlateEditorHandle } from "./plate-editor";
import { useTRPC } from "~/trpc/react";
import { FrontmatterForm } from "./frontmatter-form";
import { PlateEditor } from "./plate-editor";

type ArtifactCategory = "agent" | "prompt" | "claudemd";

interface ArtifactEditorProps {
  mode: "create" | "edit";
  artifactId?: string;
  category: ArtifactCategory;
  initialFrontmatter?: Partial<SkillFrontmatter>;
  initialContent?: string;
  cancelHref: string;
}

const CATEGORY_LABELS: Record<ArtifactCategory, string> = {
  agent: "Agent",
  prompt: "Prompt",
  claudemd: "Claude.md",
};

export function ArtifactEditor({
  mode,
  artifactId,
  category,
  initialFrontmatter,
  initialContent,
  cancelHref,
}: ArtifactEditorProps) {
  const trpc = useTRPC();
  const router = useRouter();
  const editorRef = useRef<PlateEditorHandle>(null);
  const [frontmatter, setFrontmatter] = useState<SkillFrontmatter>({
    name: initialFrontmatter?.name ?? "",
    description: initialFrontmatter?.description ?? "",
    tags: initialFrontmatter?.tags ?? [],
    author: initialFrontmatter?.author ?? "",
    version: initialFrontmatter?.version ?? "",
  });

  const label = CATEGORY_LABELS[category];

  const createMutation = useMutation(
    trpc.artifact.create.mutationOptions({
      onSuccess: (data) => {
        toast.success(`${label} created successfully`);
        if (data) {
          router.push(`/artifacts/${category}/${data.id}`);
        } else {
          router.push("/artifacts");
        }
      },
      onError: (err) => {
        toast.error(`Failed to create ${label.toLowerCase()}: ${err.message}`);
      },
    }),
  );

  const updateMutation = useMutation(
    trpc.artifact.update.mutationOptions({
      onSuccess: () => {
        toast.success(`${label} updated successfully`);
        router.push(`/artifacts/${category}/${artifactId}`);
      },
      onError: (err) => {
        toast.error(`Failed to update ${label.toLowerCase()}: ${err.message}`);
      },
    }),
  );

  const isPending = createMutation.isPending || updateMutation.isPending;

  function handleSave() {
    if (!frontmatter.name.trim()) {
      toast.error("Name is required");
      return;
    }

    const markdown = editorRef.current?.getMarkdown() ?? "";

    if (mode === "create") {
      createMutation.mutate({
        name: frontmatter.name,
        description: frontmatter.description,
        category,
        tags: frontmatter.tags,
        author: frontmatter.author || undefined,
        version: frontmatter.version || undefined,
        content: markdown,
      });
    } else {
      if (!artifactId) return;
      updateMutation.mutate({
        id: artifactId,
        name: frontmatter.name,
        description: frontmatter.description,
        tags: frontmatter.tags,
        author: frontmatter.author || undefined,
        version: frontmatter.version || undefined,
        content: markdown,
      });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href={cancelHref}>&larr; Back</Link>
            </Button>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">
            {mode === "create" ? `New ${label}` : `Edit ${label}`}
          </h1>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={cancelHref}>Cancel</Link>
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      <FrontmatterForm
        initialValues={initialFrontmatter}
        onChange={setFrontmatter}
      />

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Content</h2>
        <PlateEditor ref={editorRef} initialContent={initialContent} />
      </div>
    </div>
  );
}
