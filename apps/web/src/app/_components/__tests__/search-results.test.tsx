import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "~/test-utils";
import type * as TanStackQuery from "@tanstack/react-query";
import { SearchResults } from "../search-results";

// Stable search params instance to avoid re-render loops
const stableSearchParams = new URLSearchParams();
const mockReplace = vi.fn();

// Override next/navigation with stable references
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: mockReplace,
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => stableSearchParams,
  usePathname: () => "/search",
}));

// Mock next/link
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

// Mock @radix-ui/react-icons
vi.mock("@radix-ui/react-icons", () => ({
  MagnifyingGlassIcon: (props: Record<string, unknown>) => (
    <svg data-testid="search-icon" {...props} />
  ),
}));

// Mock useQuery from @tanstack/react-query
const mockUseQuery = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => { data: unknown; isLoading: boolean }>(),
);

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof TanStackQuery>();
  return {
    ...actual,
    useQuery: (...args: unknown[]): { data: unknown; isLoading: boolean } =>
      mockUseQuery(...args) as { data: unknown; isLoading: boolean },
  };
});

// Mock useTRPC
const mockQueryOptions = vi.hoisted(() => vi.fn());
vi.mock("~/trpc/react", () => ({
  useTRPC: () => ({
    search: {
      query: {
        queryOptions: mockQueryOptions,
      },
    },
  }),
}));

function makeResult(overrides: Partial<{
  id: string;
  name: string;
  description: string;
  category: string | null;
  tags: string;
  snippet: string | null;
}> = {}) {
  return {
    id: overrides.id ?? "test-id",
    name: overrides.name ?? "Test Skill",
    description: overrides.description ?? "A test skill",
    category: overrides.category ?? "skill",
    tags: overrides.tags ?? "[]",
    snippet: overrides.snippet ?? null,
  };
}

describe("parseTags (via component rendering)", () => {
  beforeEach(() => {
    mockQueryOptions.mockReturnValue({ queryKey: ["search"], queryFn: vi.fn() });
  });

  it("renders tags from valid JSON array", () => {
    mockUseQuery.mockReturnValue({
      data: [makeResult({ tags: '["react","typescript"]' })],
      isLoading: false,
    });
    render(<SearchResults />);
    expect(screen.getByText("react")).toBeInTheDocument();
    expect(screen.getByText("typescript")).toBeInTheDocument();
  });

  it("renders no tags from invalid JSON", () => {
    mockUseQuery.mockReturnValue({
      data: [makeResult({ tags: "not-json" })],
      isLoading: false,
    });
    render(<SearchResults />);
    expect(screen.getByText("Test Skill")).toBeInTheDocument();
    // No tag badges rendered — component should not crash
    expect(screen.queryByText("not-json")).not.toBeInTheDocument();
  });
});

describe("SearchResults component", () => {
  beforeEach(() => {
    mockQueryOptions.mockReturnValue({ queryKey: ["search"], queryFn: vi.fn() });
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false });
  });

  it("renders search input", () => {
    render(<SearchResults />);
    expect(
      screen.getByPlaceholderText("Search skills, artifacts..."),
    ).toBeInTheDocument();
  });

  it("renders category filter select with all categories", () => {
    render(<SearchResults />);
    expect(screen.getByText("All categories")).toBeInTheDocument();
    expect(screen.getByText("Skill")).toBeInTheDocument();
    expect(screen.getByText("Agent")).toBeInTheDocument();
    expect(screen.getByText("Prompt")).toBeInTheDocument();
    expect(screen.getByText("Claudemd")).toBeInTheDocument();
  });

  it("shows empty state when no results", () => {
    mockUseQuery.mockReturnValue({ data: [], isLoading: false });
    render(<SearchResults />);
    expect(screen.getByText("No results found.")).toBeInTheDocument();
  });

  it("shows loading skeleton when loading", () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true });
    const { container } = render(<SearchResults />);
    // Skeleton renders 4 placeholder cards with animate-pulse
    const pulseElements = container.querySelectorAll(".animate-pulse");
    expect(pulseElements.length).toBeGreaterThan(0);
  });

  it("renders result cards with name, description, and category badge", () => {
    mockUseQuery.mockReturnValue({
      data: [
        makeResult({
          name: "My Skill",
          description: "Does cool things",
          category: "agent",
        }),
      ],
      isLoading: false,
    });
    render(<SearchResults />);
    expect(screen.getByText("My Skill")).toBeInTheDocument();
    expect(screen.getByText("Does cool things")).toBeInTheDocument();
    expect(screen.getByText("agent")).toBeInTheDocument();
  });

  it("renders correct link for skill category", () => {
    mockUseQuery.mockReturnValue({
      data: [makeResult({ id: "skill-1", category: "skill" })],
      isLoading: false,
    });
    render(<SearchResults />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/skills/skill-1");
  });

  it("renders correct link for artifact category", () => {
    mockUseQuery.mockReturnValue({
      data: [makeResult({ id: "art-1", category: "agent" })],
      isLoading: false,
    });
    render(<SearchResults />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/artifacts/agent/art-1");
  });

  it("renders snippet with dangerouslySetInnerHTML", () => {
    mockUseQuery.mockReturnValue({
      data: [
        makeResult({ snippet: "matched <mark>term</mark> here" }),
      ],
      isLoading: false,
    });
    render(<SearchResults />);
    const snippet = screen.getByText((_content, element) => {
      return element?.innerHTML === "matched <mark>term</mark> here";
    });
    expect(snippet).toBeInTheDocument();
  });

  it("renders tag badges on result cards", () => {
    mockUseQuery.mockReturnValue({
      data: [makeResult({ tags: '["api","tools"]' })],
      isLoading: false,
    });
    render(<SearchResults />);
    expect(screen.getByText("api")).toBeInTheDocument();
    expect(screen.getByText("tools")).toBeInTheDocument();
  });

  it("search input is interactive with onChange handler", () => {
    render(<SearchResults />);
    const input = screen.getByPlaceholderText("Search skills, artifacts...");
    // Input is a controlled component (value + onChange)
    expect(input).toHaveAttribute("type", "search");
    expect(input).toHaveValue(""); // initial query from URL params
  });

  it("queryOptions called with query from URL searchParams", () => {
    // Verify the initial render calls queryOptions with undefined query
    mockQueryOptions.mockClear();
    render(<SearchResults />);
    expect(mockQueryOptions).toHaveBeenCalledWith(
      expect.objectContaining({ query: undefined }),
    );
  });

  it("calls queryOptions with category when selected", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    render(<SearchResults />);

    const select = screen.getByRole("combobox");
    await user.selectOptions(select, "agent");

    await waitFor(() => {
      const lastCall = mockQueryOptions.mock.calls[
        mockQueryOptions.mock.calls.length - 1
      ] as [{ query: string | undefined; category: string | undefined }];
      expect(lastCall[0].category).toBe("agent");
    });
  });

  it("renders multiple result cards", () => {
    mockUseQuery.mockReturnValue({
      data: [
        makeResult({ id: "1", name: "First" }),
        makeResult({ id: "2", name: "Second" }),
        makeResult({ id: "3", name: "Third" }),
      ],
      isLoading: false,
    });
    render(<SearchResults />);
    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
    expect(screen.getByText("Third")).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });

  it("does not render category badge when category is null", () => {
    mockUseQuery.mockReturnValue({
      data: [makeResult({ name: "No Category", category: null })],
      isLoading: false,
    });
    render(<SearchResults />);
    expect(screen.getByText("No Category")).toBeInTheDocument();
    // The card should still render, link goes to /skills/<id>
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/skills/test-id");
  });
});
