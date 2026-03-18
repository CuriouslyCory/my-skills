"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  DashboardIcon,
  FileTextIcon,
  MixIcon,
  GearIcon,
  GitHubLogoIcon,
  MagicWandIcon,
} from "@radix-ui/react-icons";

import { cn } from "@curiouslycory/ui";

const navItems = [
  { href: "/", label: "Dashboard", icon: DashboardIcon },
  { href: "/skills", label: "Skills", icon: MagicWandIcon },
  { href: "/artifacts", label: "Artifacts", icon: FileTextIcon },
  { href: "/compositions", label: "Compositions", icon: MixIcon },
  { href: "/git", label: "Git", icon: GitHubLogoIcon },
  { href: "/settings", label: "Settings", icon: GearIcon },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

export function Sidebar({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "bg-sidebar text-sidebar-foreground border-sidebar-border flex h-full w-60 flex-col border-r",
        className,
      )}
    >
      <div className="border-sidebar-border flex h-14 items-center border-b px-4">
        <Link href="/" className="text-lg font-semibold">
          my-skills
        </Link>
      </div>
      <nav className="flex-1 space-y-1 p-2">
        {navItems.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

export function MobileSidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
        role="button"
        tabIndex={-1}
        aria-label="Close sidebar"
      />
      <aside className="bg-sidebar text-sidebar-foreground border-sidebar-border fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r">
        <div className="border-sidebar-border flex h-14 items-center border-b px-4">
          <Link href="/" className="text-lg font-semibold" onClick={onClose}>
            my-skills
          </Link>
        </div>
        <nav className="flex-1 space-y-1 p-2">
          {navItems.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                )}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
