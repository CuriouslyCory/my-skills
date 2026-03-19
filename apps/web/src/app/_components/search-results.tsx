"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { MagnifyingGlassIcon } from "@radix-ui/react-icons";

import { cn } from "@curiouslycory/ui";
import { Badge } from "@curiouslycory/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@curiouslycory/ui/card";
import { Input } from "@curiouslycory/ui/input";

import { useTRPC } from "~/trpc/react";

const CATEGORIES = ["skill", "agent", "prompt", "claudemd"] as const;

function parseTags(tags: string): string[] {
  try {
    return JSON.parse(tags) as string[];
  } catch {
    return [];
  }
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function SearchResults() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const trpc = useTRPC();

  const initialQuery = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState<string>("");
  const debouncedQuery = useDebounce(query, 300);

  // Sync URL param changes to local state
  useEffect(() => {
    const q = searchParams.get("q") ?? "";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional setState for syncing URL params to state
    setQuery(q);
  }, [searchParams]);

  // Update URL when debounced query changes
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (debouncedQuery) {
      params.set("q", debouncedQuery);
    } else {
      params.delete("q");
    }
    router.replace(`/search?${params.toString()}`, { scroll: false });
  }, [debouncedQuery, router, searchParams]);

  const { data: results, isLoading } = useQuery(
    trpc.search.query.queryOptions({
      query: debouncedQuery || undefined,
      category: category || undefined,
    }),
  );

  const getDetailLink = useCallback((result: { id: string; category: string | null }) => {
    if (result.category === "skill") {
      return `/skills/${result.id}`;
    }
    if (result.category) {
      return `/artifacts/${result.category}/${result.id}`;
    }
    return `/skills/${result.id}`;
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="text-muted-foreground absolute left-2.5 top-1/2 size-4 -translate-y-1/2" />
          <Input
            type="search"
            placeholder="Search skills, artifacts..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="border-input bg-background ring-offset-background focus:ring-ring h-9 rounded-md border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-offset-2"
        >
          <option value="">All categories</option>
          {CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <SearchResultsSkeleton />}

      {!isLoading && results?.length === 0 && (
        <p className="text-muted-foreground py-8 text-center">
          No results found{debouncedQuery ? ` for "${debouncedQuery}"` : ""}.
        </p>
      )}

      {!isLoading && results && results.length > 0 && (
        <div className="space-y-3">
          {results.map((result) => (
            <Link key={result.id} href={getDetailLink(result)}>
              <Card className="hover:bg-accent/50 transition-colors">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-lg">{result.name}</CardTitle>
                    {result.category && (
                      <Badge variant="secondary" className="shrink-0">
                        {result.category}
                      </Badge>
                    )}
                  </div>
                  <CardDescription className="line-clamp-2">
                    {result.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {result.snippet && (
                    <p
                      className="text-muted-foreground text-sm [&_mark]:bg-yellow-200 [&_mark]:text-foreground dark:[&_mark]:bg-yellow-800"
                      dangerouslySetInnerHTML={{ __html: result.snippet }}
                    />
                  )}
                  {parseTags(result.tags).length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {parseTags(result.tags).map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function SearchResultsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <div className={cn("bg-muted h-5 w-1/3 animate-pulse rounded-sm")} />
              <div className={cn("bg-muted h-5 w-16 animate-pulse rounded-md")} />
            </div>
            <div className={cn("bg-muted mt-1 h-4 w-2/3 animate-pulse rounded-sm")} />
          </CardHeader>
          <CardContent>
            <div className={cn("bg-muted h-4 w-full animate-pulse rounded-sm")} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
