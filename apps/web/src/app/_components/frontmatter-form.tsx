"use client";

import { useState } from "react";
import { Cross2Icon } from "@radix-ui/react-icons";

import { Badge } from "@curiouslycory/ui/badge";
import { Button } from "@curiouslycory/ui/button";
import { Input } from "@curiouslycory/ui/input";
import { Label } from "@curiouslycory/ui/label";
import { Textarea } from "@curiouslycory/ui/textarea";

export interface SkillFrontmatter {
  name: string;
  description: string;
  tags: string[];
  author: string;
  version: string;
}

interface FrontmatterFormProps {
  initialValues?: Partial<SkillFrontmatter>;
  onChange: (frontmatter: SkillFrontmatter) => void;
}

export function FrontmatterForm({
  initialValues,
  onChange,
}: FrontmatterFormProps) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [description, setDescription] = useState(
    initialValues?.description ?? "",
  );
  const [tags, setTags] = useState<string[]>(initialValues?.tags ?? []);
  const [author, setAuthor] = useState(initialValues?.author ?? "");
  const [version, setVersion] = useState(initialValues?.version ?? "");
  const [tagInput, setTagInput] = useState("");

  function emit(patch: Partial<SkillFrontmatter>) {
    const next = { name, description, tags, author, version, ...patch };
    onChange(next);
  }

  function addTag() {
    const trimmed = tagInput.trim();
    if (trimmed && !tags.includes(trimmed)) {
      const next = [...tags, trimmed];
      setTags(next);
      setTagInput("");
      emit({ tags: next });
    }
  }

  function removeTag(tag: string) {
    const next = tags.filter((t) => t !== tag);
    setTags(next);
    emit({ tags: next });
  }

  const nameInvalid = name.trim() === "";

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="fm-name">Name</Label>
        <Input
          id="fm-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            emit({ name: e.target.value });
          }}
          aria-invalid={nameInvalid || undefined}
          placeholder="Skill name"
        />
        {nameInvalid && (
          <p className="text-destructive text-sm">Name is required.</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="fm-description">Description</Label>
        <Textarea
          id="fm-description"
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            emit({ description: e.target.value });
          }}
          placeholder="A brief description of this skill"
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="fm-tags">Tags</Label>
        <div className="flex gap-2">
          <Input
            id="fm-tags"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag();
              }
            }}
            placeholder="Type a tag and press Enter"
          />
          <Button type="button" variant="secondary" onClick={addTag}>
            Add
          </Button>
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="gap-1 pr-1">
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="hover:text-destructive rounded-full p-0.5"
                  aria-label={`Remove tag ${tag}`}
                >
                  <Cross2Icon className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="fm-author">Author</Label>
          <Input
            id="fm-author"
            value={author}
            onChange={(e) => {
              setAuthor(e.target.value);
              emit({ author: e.target.value });
            }}
            placeholder="Author name"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="fm-version">Version</Label>
          <Input
            id="fm-version"
            value={version}
            onChange={(e) => {
              setVersion(e.target.value);
              emit({ version: e.target.value });
            }}
            placeholder="1.0.0"
          />
        </div>
      </div>
    </div>
  );
}
