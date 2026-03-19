import { SkillEditor } from "~/app/_components/skill-editor";

export default function NewSkillPage() {
  return <SkillEditor mode="create" cancelHref="/skills" />;
}
