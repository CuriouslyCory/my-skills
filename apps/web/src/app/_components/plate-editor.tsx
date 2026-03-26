"use client";

import type { PlateEditor as PlateEditorType } from "platejs/react";
import { forwardRef, useCallback, useImperativeHandle, useMemo } from "react";
import {
  BlockquotePlugin,
  BoldPlugin,
  CodePlugin,
  H1Plugin,
  H2Plugin,
  H3Plugin,
  ItalicPlugin,
} from "@platejs/basic-nodes/react";
import {
  CodeBlockPlugin,
  CodeLinePlugin,
  CodeSyntaxPlugin,
} from "@platejs/code-block/react";
import { LinkPlugin } from "@platejs/link/react";
import { ListPlugin } from "@platejs/list/react";
import { MarkdownPlugin } from "@platejs/markdown";
import { Plate, PlateContent, usePlateEditor } from "platejs/react";

import { cn } from "@curiouslycory/ui";
import { Button } from "@curiouslycory/ui/button";

import type { EditorPlugins } from "./plate-markdown-utils";
import { deserializeMarkdown, serializeMarkdown } from "./plate-markdown-utils";

// --- Toolbar button ---

function ToolbarButton({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-8 px-2 text-xs"
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      title={title}
    >
      {children}
    </Button>
  );
}

// --- Toolbar ---

function EditorToolbar({ editor }: { editor: PlateEditorType }) {
  const toggleMark = useCallback(
    (type: string) => {
      editor.tf.toggleMark(type);
      editor.tf.focus();
    },
    [editor],
  );

  const toggleBlock = useCallback(
    (type: string) => {
      editor.tf.toggleBlock(type);
      editor.tf.focus();
    },
    [editor],
  );

  const insertLink = useCallback(() => {
    const url = window.prompt("Enter URL:");
    if (!url) return;
    editor.tf.wrapNodes({ type: "a", url, children: [] }, { split: true });
    editor.tf.focus();
  }, [editor]);

  return (
    <div className="border-border flex flex-wrap gap-1 border-b p-2">
      <ToolbarButton onClick={() => toggleMark("bold")} title="Bold (Ctrl+B)">
        <strong>B</strong>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => toggleMark("italic")}
        title="Italic (Ctrl+I)"
      >
        <em>I</em>
      </ToolbarButton>
      <ToolbarButton onClick={() => toggleMark("code")} title="Inline Code">
        <code className="font-mono">&lt;/&gt;</code>
      </ToolbarButton>

      <div className="bg-border mx-1 w-px" />

      <ToolbarButton onClick={() => toggleBlock("h1")} title="Heading 1">
        H1
      </ToolbarButton>
      <ToolbarButton onClick={() => toggleBlock("h2")} title="Heading 2">
        H2
      </ToolbarButton>
      <ToolbarButton onClick={() => toggleBlock("h3")} title="Heading 3">
        H3
      </ToolbarButton>

      <div className="bg-border mx-1 w-px" />

      <ToolbarButton
        onClick={() => toggleBlock("code_block")}
        title="Code Block"
      >
        Code
      </ToolbarButton>
      <ToolbarButton
        onClick={() => toggleBlock("blockquote")}
        title="Blockquote"
      >
        Quote
      </ToolbarButton>

      <div className="bg-border mx-1 w-px" />

      <ToolbarButton onClick={() => toggleBlock("ul")} title="Bullet List">
        &bull; List
      </ToolbarButton>
      <ToolbarButton onClick={() => toggleBlock("ol")} title="Numbered List">
        1. List
      </ToolbarButton>

      <div className="bg-border mx-1 w-px" />

      <ToolbarButton onClick={insertLink} title="Insert Link">
        Link
      </ToolbarButton>
    </div>
  );
}

// --- Main editor component ---

export interface PlateEditorHandle {
  getMarkdown: () => string;
}

interface PlateEditorProps {
  initialContent?: string;
  onSave?: (markdown: string) => void;
  className?: string;
}

/**
 * Builds the shared plugin list for the Plate editor.
 * Platejs .configure() returns loosely-typed values; the `as unknown[]` cast
 * provides a clean boundary that prevents `any` from propagating further.
 */
function buildPlugins(): EditorPlugins {
  return [
    H1Plugin.configure({
      render: {
        node: ({ attributes, children }) => (
          <h1 className="mt-6 mb-2 text-3xl font-bold" {...attributes}>
            {children}
          </h1>
        ),
      },
    }),
    H2Plugin.configure({
      render: {
        node: ({ attributes, children }) => (
          <h2 className="mt-5 mb-2 text-2xl font-semibold" {...attributes}>
            {children}
          </h2>
        ),
      },
    }),
    H3Plugin.configure({
      render: {
        node: ({ attributes, children }) => (
          <h3 className="mt-4 mb-2 text-xl font-semibold" {...attributes}>
            {children}
          </h3>
        ),
      },
    }),
    BoldPlugin.configure({
      render: {
        node: ({ attributes, children }) => (
          <strong {...attributes}>{children}</strong>
        ),
      },
    }),
    ItalicPlugin.configure({
      render: {
        node: ({ attributes, children }) => (
          <em {...attributes}>{children}</em>
        ),
      },
    }),
    CodePlugin.configure({
      render: {
        node: ({ attributes, children }) => (
          <code
            className="bg-muted rounded px-1.5 py-0.5 font-mono text-sm"
            {...attributes}
          >
            {children}
          </code>
        ),
      },
    }),
    BlockquotePlugin.configure({
      render: {
        node: ({ attributes, children }) => (
          <blockquote
            className="border-muted-foreground/30 my-2 border-l-4 pl-4 italic"
            {...attributes}
          >
            {children}
          </blockquote>
        ),
      },
    }),
    CodeBlockPlugin.configure({
      render: {
        node: ({ attributes, children }) => (
          <pre
            className="bg-muted my-2 overflow-x-auto rounded-md p-4 font-mono text-sm"
            {...attributes}
          >
            <code>{children}</code>
          </pre>
        ),
      },
    }),
    CodeLinePlugin.configure({
      render: {
        node: ({ attributes, children }) => (
          <div {...attributes}>{children}</div>
        ),
      },
    }),
    CodeSyntaxPlugin,
    LinkPlugin.configure({
      render: {
        node: ({ attributes, children, element }) => {
          const url = (element as Record<string, unknown>).url as
            | string
            | undefined;
          return (
            <a
              className="text-primary underline underline-offset-4"
              href={url}
              {...attributes}
            >
              {children}
            </a>
          );
        },
      },
    }),
    ListPlugin,
    MarkdownPlugin,
  ] as EditorPlugins;
}

export const PlateEditor = forwardRef<PlateEditorHandle, PlateEditorProps>(
  function PlateEditor({ initialContent, onSave, className }, ref) {
    const plugins = useMemo(() => buildPlugins(), []);

    const editor = usePlateEditor({
      plugins,
      value: initialContent
        ? (ed: PlateEditorType) => deserializeMarkdown(ed, initialContent)
        : undefined,
    });

    useImperativeHandle(
      ref,
      () => ({
        getMarkdown: () => serializeMarkdown(editor),
      }),
      [editor],
    );

    const handleSave = useCallback(() => {
      if (!onSave) return;
      onSave(serializeMarkdown(editor));
    }, [editor, onSave]);

    return (
      <div className={cn("border-border rounded-lg border", className)}>
        <Plate editor={editor}>
          <EditorToolbar editor={editor} />
          <PlateContent
            className="prose dark:prose-invert min-h-[300px] max-w-none p-4 focus:outline-none"
            placeholder="Start writing..."
          />
        </Plate>
        {onSave && (
          <div className="border-border flex justify-end border-t p-2">
            <Button onClick={handleSave} size="sm">
              Save
            </Button>
          </div>
        )}
      </div>
    );
  },
);
