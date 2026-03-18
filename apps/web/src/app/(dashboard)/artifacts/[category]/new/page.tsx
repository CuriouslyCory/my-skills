import { ArtifactEditor } from "~/app/_components/artifact-editor";

export default async function NewArtifactPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;

  return (
    <ArtifactEditor
      mode="create"
      category={category as "agent" | "prompt" | "claudemd"}
      cancelHref="/artifacts"
    />
  );
}
