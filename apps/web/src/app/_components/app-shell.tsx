"use client";

import { useState } from "react";

import type { DeployMode } from "@curiouslycory/api";

import { Header } from "./header";
import { MobileSidebar, Sidebar } from "./sidebar";

export function AppShell({
  children,
  deployMode,
}: {
  children: React.ReactNode;
  deployMode: DeployMode;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <Sidebar className="hidden md:flex" deployMode={deployMode} />

      {/* Mobile sidebar */}
      <MobileSidebar
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        deployMode={deployMode}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <Header onMenuClick={() => setMobileMenuOpen((prev) => !prev)} />
        <main className="flex-1 overflow-y-auto p-3 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
