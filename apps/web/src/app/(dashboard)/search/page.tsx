export default function SearchPage(_props: {
  searchParams: Promise<{ q?: string }>;
}) {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Search Results</h1>
      <p className="text-muted-foreground">
        Search results will appear here.
      </p>
    </div>
  );
}
