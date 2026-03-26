/**
 * Typed boundary for platejs MarkdownPlugin API and plugin configuration.
 *
 * The platejs library's `.getApi()`, `.api`, and plugin `.configure()` methods
 * return loosely-typed (`any`) values. These helpers provide a single,
 * well-documented boundary where `any` is narrowed to specific types that
 * match the actual runtime shape. All other code should import from here
 * rather than accessing platejs markdown APIs directly.
 */

import type { Value } from "platejs";
import type { PlateEditor } from "platejs/react";
import { MarkdownPlugin } from "@platejs/markdown";
import type { usePlateEditor } from "platejs/react";

/**
 * Extract the plugins type that `usePlateEditor` expects.
 * `AnyPluginConfig` is not directly exported from platejs, so we derive it
 * from the function's parameter type.
 */
type EditorOptions = NonNullable<Parameters<typeof usePlateEditor>[0]>;
export type EditorPlugins = NonNullable<EditorOptions["plugins"]>;

interface MarkdownEditorApi {
  markdown: {
    deserialize: (content: string) => Value;
    serialize: () => string;
  };
}

/**
 * Returns a typed handle to the MarkdownPlugin API on the given editor.
 * Uses a two-step cast (any → unknown → typed) to provide a clean boundary.
 */
function getMarkdownApi(editor: PlateEditor): MarkdownEditorApi {
  return editor.getApi(MarkdownPlugin) as unknown as MarkdownEditorApi;
}

/** Deserialize a markdown string into Plate editor Value (Descendant[]). */
export function deserializeMarkdown(
  editor: PlateEditor,
  content: string,
): Value {
  return getMarkdownApi(editor).markdown.deserialize(content);
}

/** Serialize the current editor content to a markdown string. */
export function serializeMarkdown(editor: PlateEditor): string {
  return (editor.api as unknown as MarkdownEditorApi).markdown.serialize();
}

/** Replace all editor nodes with deserialized markdown content. */
export function replaceEditorContent(
  editor: PlateEditor,
  markdown: string,
): void {
  const nodes = deserializeMarkdown(editor, markdown);
  // editor.tf is loosely typed when plugins use EditorPlugins cast;
  // provide a typed boundary for the replaceNodes transform
  const tf = editor.tf as unknown as {
    replaceNodes: (
      nodes: Value,
      options: { at: number[]; children: boolean },
    ) => void;
  };
  tf.replaceNodes(nodes, { at: [], children: true });
}
