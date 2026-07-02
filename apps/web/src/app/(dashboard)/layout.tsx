import { AppShell } from "~/app/_components/app-shell";
import { env } from "~/env";

export const dynamic = "force-dynamic";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Resolved server-side and passed down as a plain prop so client components
  // (sidebar) can hide filesystem-coupled navigation in hosted mode (#26).
  return <AppShell deployMode={env.DEPLOY_MODE}>{children}</AppShell>;
}
