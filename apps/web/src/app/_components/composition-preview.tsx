"use client";

import type { PlateEditor as PlateEditorType } from "platejs/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { ClipboardCopyIcon } from "@radix-ui/react-icons";
import { useQuery } from "@tanstack/react-query";
import { Plate, PlateContent, usePlateEditor } from "platejs/react";

import { Button } from "@curiouslycory/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@curiouslycory/ui/card";
import { toast } from "@curiouslycory/ui/toast";

import { useTRPC } from "~/trpc/react";
import type { EditorPlugins } from "./plate-markdown-utils";
import { deserializeMarkdown, replaceEditorContent } from "./plate-markdown-utils";

interface CompositionPreviewProps {
  fragmentIds: string[];
  orderedIds: string[];
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
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

export function CompositionPreview({
  fragmentIds,
  orderedIds,
}: CompositionPreviewProps) {
  const trpc = useTRPC();

  // Stabilize array references for debouncing
  const fragmentKey = JSON.stringify(fragmentIds);
  const orderKey = JSON.stringify(orderedIds);
  const debouncedFragmentKey = useDebounce(fragmentKey, 500);
  const debouncedOrderKey = useDebounce(orderKey, 500);

  const debouncedFragmentIds: string[] = useMemo(
    () => JSON.parse(debouncedFragmentKey) as string[],
    [debouncedFragmentKey],
  );
  const debouncedOrderedIds: string[] = useMemo(
    () => JSON.parse(debouncedOrderKey) as string[],
    [debouncedOrderKey],
  );

  const { data: previewMarkdown } = useQuery(
    trpc.composition.preview.queryOptions(
      {
        fragmentIds: debouncedFragmentIds,
        order: debouncedOrderedIds,
      },
      { enabled: debouncedFragmentIds.length > 0 },
    ),
  );

  const markdown = previewMarkdown ?? "";

  const plugins = useMemo(() => buildPlugins(), []);

  const editor = usePlateEditor({
    plugins,
    value: (ed: PlateEditorType) =>
      deserializeMarkdown(ed, markdown || " "),
  });

  // Update editor content when markdown changes
  const prevMarkdownRef = useRef(markdown);
  useEffect(() => {
    if (markdown !== prevMarkdownRef.current) {
      prevMarkdownRef.current = markdown;
      replaceEditorContent(editor, markdown || " ");
    }
  }, [markdown, editor]);

  const handleCopyMarkdown = useCallback(async () => {
    await navigator.clipboard.writeText(markdown);
    toast.success("Markdown copied to clipboard");
  }, [markdown]);

  const handleCopyCommand = useCallback(async () => {
    await navigator.clipboard.writeText("ms add claudemd <name>");
    toast.success("Command copied to clipboard");
  }, []);

  if (fragmentIds.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Select fragments to see a live preview of the merged output.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Preview</CardTitle>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopyMarkdown}
            title="Copy as Markdown"
          >
            <ClipboardCopyIcon className="mr-1 h-3.5 w-3.5" />
            Copy as Markdown
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="border-border rounded-lg border">
          <Plate editor={editor}>
            <PlateContent
              className="prose dark:prose-invert max-h-[500px] max-w-none overflow-y-auto p-4"
              readOnly
            />
          </Plate>
        </div>

        <div className="bg-muted flex items-center justify-between rounded-md px-3 py-2">
          <code className="text-muted-foreground text-xs">
            ms add claudemd &lt;name&gt;
          </code>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={handleCopyCommand}
          >
            <ClipboardCopyIcon className="mr-1 h-3 w-3" />
            Copy Command
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
