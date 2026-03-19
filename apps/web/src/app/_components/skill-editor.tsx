"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";

import { Button } from "@curiouslycory/ui/button";
import { toast } from "@curiouslycory/ui/toast";

import { useTRPC } from "~/trpc/react";
import type { SkillFrontmatter } from "./frontmatter-form";
import { FrontmatterForm } from "./frontmatter-form";
import type { PlateEditorHandle } from "./plate-editor";
import { PlateEditor } from "./plate-editor";

interface SkillEditorProps {
  mode: "create" | "edit";
  skillId?: string;
  initialFrontmatter?: Partial<SkillFrontmatter>;
  initialContent?: string;
  cancelHref: string;
}

export function SkillEditor({
  mode,
  skillId,
  initialFrontmatter,
  initialContent,
  cancelHref,
}: SkillEditorProps) {
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

  const createMutation = useMutation(
    trpc.skill.create.mutationOptions({
      onSuccess: (data) => {
        toast.success("Skill created successfully");
        if (data) {
          router.push(`/skills/${data.id}`);
        } else {
          router.push("/skills");
        }
      },
      onError: (err) => {
        toast.error(`Failed to create skill: ${err.message}`);
      },
    }),
  );

  const updateMutation = useMutation(
    trpc.skill.update.mutationOptions({
      onSuccess: () => {
        toast.success("Skill updated successfully");
        router.push(`/skills/${skillId}`);
      },
      onError: (err) => {
        toast.error(`Failed to update skill: ${err.message}`);
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
        tags: frontmatter.tags,
        author: frontmatter.author || undefined,
        version: frontmatter.version || undefined,
        content: markdown,
      });
    } else {
      if (!skillId) return;
      updateMutation.mutate({
        id: skillId,
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
            {mode === "create" ? "New Skill" : "Edit Skill"}
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
