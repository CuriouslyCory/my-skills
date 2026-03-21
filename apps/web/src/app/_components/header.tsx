"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { HamburgerMenuIcon, MagnifyingGlassIcon } from "@radix-ui/react-icons";

import { Input } from "@curiouslycory/ui/input";
import { Button } from "@curiouslycory/ui/button";
import { ThemeToggle } from "@curiouslycory/ui/theme";

export function Header({ onMenuClick }: { onMenuClick: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed) {
      router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    }
  }

  return (
    <header className="bg-background border-b flex h-14 items-center gap-4 px-4">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={onMenuClick}
        aria-label="Toggle menu"
      >
        <HamburgerMenuIcon className="size-5" />
      </Button>

      <form
        onSubmit={handleSearch}
        className="ml-auto flex w-full max-w-sm items-center gap-2"
      >
        <div className="relative w-full">
          <MagnifyingGlassIcon className="text-muted-foreground absolute left-2.5 top-1/2 size-4 -translate-y-1/2" />
          <Input
            type="search"
            placeholder="Search skills, artifacts..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8"
          />
        </div>
      </form>

      <ThemeToggle />
    </header>
  );
}
