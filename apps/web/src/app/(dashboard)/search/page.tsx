import { Suspense } from "react";

import {
  SearchResults,
  SearchResultsSkeleton,
} from "~/app/_components/search-results";

export default function SearchPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Search Results</h1>
      <Suspense fallback={<SearchResultsSkeleton />}>
        <SearchResults />
      </Suspense>
    </div>
  );
}
