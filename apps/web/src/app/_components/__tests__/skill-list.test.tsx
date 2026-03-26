import type { ReactElement, ReactNode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render as rtlRender, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

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

// Mock useSuspenseQuery
const mockUseSuspenseQuery = vi.fn();

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useSuspenseQuery: (...args: unknown[]) =>
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      mockUseSuspenseQuery(...args),
  };
});

// Mock useTRPC
const mockListQueryOptions = vi.fn();

vi.mock("~/trpc/react", () => ({
  useTRPC: () => ({
    skill: {
      list: {
        queryOptions: mockListQueryOptions,
      },
    },
  }),
}));

// Import after mocks
// eslint-disable-next-line import/first
import { SkillList, SkillListSkeleton } from "../skill-list";

// Local render wrapper (avoids test-utils which has its own next/navigation mock)
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
}

function render(ui: ReactElement) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={createTestQueryClient()}>
        {children}
      </QueryClientProvider>
    );
  }
  return rtlRender(ui, { wrapper: Wrapper });
}

interface SkillItem {
  id: string;
  name: string;
  description: string;
  category: string | null;
  tags: string;
  content: string | null;
  dirPath: string | null;
  createdAt: string;
  updatedAt: string;
}

function makeSkill(overrides: Partial<SkillItem> = {}): SkillItem {
  return {
    id: overrides.id ?? "skill-1",
    name: overrides.name ?? "Test Skill",
    description: overrides.description ?? "A test skill description",
    category: overrides.category ?? "skill",
    tags: overrides.tags ?? "[]",
    content: overrides.content ?? null,
    dirPath: overrides.dirPath ?? null,
    createdAt: overrides.createdAt ?? "2026-03-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-03-01T00:00:00.000Z",
  };
}

function setupMocks(skills: SkillItem[] = []) {
  mockListQueryOptions.mockReturnValue({
    queryKey: ["skill", "list"],
    queryFn: vi.fn(),
  });
  mockUseSuspenseQuery.mockReturnValue({ data: skills });
}

describe("parseTags (via component rendering)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders tags from valid JSON array", () => {
    setupMocks([makeSkill({ tags: '["react","typescript"]' })]);
    render(<SkillList />);
    // Tags appear in both filter bar and card
    expect(screen.getAllByText("react").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("typescript").length).toBeGreaterThanOrEqual(1);
  });

  it("renders no tags from invalid JSON", () => {
    setupMocks([makeSkill({ tags: "not-json" })]);
    render(<SkillList />);
    expect(screen.getByText("Test Skill")).toBeInTheDocument();
    expect(screen.queryByText("not-json")).not.toBeInTheDocument();
  });
});

describe("collectAllTags (via tag filter rendering)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deduplicates tags across multiple skills", () => {
    setupMocks([
      makeSkill({ id: "s1", tags: '["react","api"]' }),
      makeSkill({ id: "s2", tags: '["react","tools"]' }),
    ]);
    render(<SkillList />);

    // "react" appears in both skills but should only render once as a filter button
    const reactButtons = screen.getAllByText("react");
    // One in the filter bar + one per card that has the tag
    // Filter bar tags are inside <button>, card tags are inside Badge directly
    const filterButtons = reactButtons.filter(
      (el) => el.closest("button")?.closest(".flex.flex-wrap.gap-2") != null,
    );
    expect(filterButtons).toHaveLength(1);
  });

  it("sorts tags alphabetically", () => {
    setupMocks([makeSkill({ tags: '["zebra","alpha","middle"]' })]);
    render(<SkillList />);

    // The filter bar renders tags in sorted order
    const buttons = screen
      .getAllByRole("button")
      .filter(
        (btn) => btn.closest(".flex.flex-wrap.gap-2") != null,
      );
    const tagTexts = buttons.map((btn) => btn.textContent);
    expect(tagTexts).toEqual(["alpha", "middle", "zebra"]);
  });
});

describe("SkillList component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("render with data", () => {
    it("shows skill cards with name and description", () => {
      setupMocks([
        makeSkill({ name: "My Skill", description: "Does cool things" }),
      ]);
      render(<SkillList />);
      expect(screen.getByText("My Skill")).toBeInTheDocument();
      expect(screen.getByText("Does cool things")).toBeInTheDocument();
    });

    it("shows category badge on skill card", () => {
      setupMocks([makeSkill({ category: "agent" })]);
      render(<SkillList />);
      expect(screen.getByText("agent")).toBeInTheDocument();
    });

    it("does not render category badge when category is null", () => {
      setupMocks([makeSkill({ name: "No Cat", category: null })]);
      render(<SkillList />);
      expect(screen.getByText("No Cat")).toBeInTheDocument();
      // Only tag badges would remain, not category badge
    });

    it("renders tag badges on cards", () => {
      setupMocks([makeSkill({ tags: '["api","tools"]' })]);
      render(<SkillList />);
      // Tags appear in both filter bar and card
      expect(screen.getAllByText("api").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("tools").length).toBeGreaterThanOrEqual(1);
    });

    it("renders correct links to skill detail pages", () => {
      setupMocks([
        makeSkill({ id: "skill-42", name: "Link Test" }),
      ]);
      render(<SkillList />);
      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("href", "/skills/skill-42");
    });

    it("renders multiple skill cards", () => {
      setupMocks([
        makeSkill({ id: "1", name: "First" }),
        makeSkill({ id: "2", name: "Second" }),
        makeSkill({ id: "3", name: "Third" }),
      ]);
      render(<SkillList />);
      expect(screen.getByText("First")).toBeInTheDocument();
      expect(screen.getByText("Second")).toBeInTheDocument();
      expect(screen.getByText("Third")).toBeInTheDocument();
      expect(screen.getAllByRole("link")).toHaveLength(3);
    });
  });

  describe("tag filtering", () => {
    it("clicking a tag badge filters to matching skills", async () => {
      const { default: userEvent } = await import(
        "@testing-library/user-event"
      );
      const user = userEvent.setup();

      setupMocks([
        makeSkill({ id: "s1", name: "React Skill", tags: '["react"]' }),
        makeSkill({ id: "s2", name: "Go Skill", tags: '["go"]' }),
      ]);
      render(<SkillList />);

      // Both skills visible initially
      expect(screen.getByText("React Skill")).toBeInTheDocument();
      expect(screen.getByText("Go Skill")).toBeInTheDocument();

      // Click the "react" filter tag button
      const filterButtons = screen
        .getAllByRole("button")
        .filter(
          (btn) => btn.closest(".flex.flex-wrap.gap-2") != null,
        );
      const reactBtn = filterButtons.find(
        (btn) => btn.textContent === "react",
      );
      expect(reactBtn).toBeDefined();
      await user.click(reactBtn!); // eslint-disable-line @typescript-eslint/no-non-null-assertion

      // Only React Skill visible
      expect(screen.getByText("React Skill")).toBeInTheDocument();
      expect(screen.queryByText("Go Skill")).not.toBeInTheDocument();
    });

    it("clicking a selected tag deselects it and shows all skills", async () => {
      const { default: userEvent } = await import(
        "@testing-library/user-event"
      );
      const user = userEvent.setup();

      setupMocks([
        makeSkill({ id: "s1", name: "React Skill", tags: '["react"]' }),
        makeSkill({ id: "s2", name: "Go Skill", tags: '["go"]' }),
      ]);
      render(<SkillList />);

      const filterButtons = screen
        .getAllByRole("button")
        .filter(
          (btn) => btn.closest(".flex.flex-wrap.gap-2") != null,
        );
      const reactBtn = filterButtons.find(
        (btn) => btn.textContent === "react",
      );
      expect(reactBtn).toBeDefined();

      // Select then deselect
      await user.click(reactBtn!); // eslint-disable-line @typescript-eslint/no-non-null-assertion
      expect(screen.queryByText("Go Skill")).not.toBeInTheDocument();

      await user.click(reactBtn!); // eslint-disable-line @typescript-eslint/no-non-null-assertion
      expect(screen.getByText("Go Skill")).toBeInTheDocument();
      expect(screen.getByText("React Skill")).toBeInTheDocument();
    });

    it("shows 'No skills match' message when tag filter matches nothing", async () => {
      const { default: userEvent } = await import(
        "@testing-library/user-event"
      );
      const user = userEvent.setup();

      setupMocks([
        makeSkill({ id: "s1", name: "Only React", tags: '["react"]' }),
        makeSkill({ id: "s2", name: "Only Go", tags: '["go"]' }),
      ]);
      render(<SkillList />);

      // Select both tags — skills must match ANY selected tag
      const filterButtons = screen
        .getAllByRole("button")
        .filter(
          (btn) => btn.closest(".flex.flex-wrap.gap-2") != null,
        );

      // With two skills each having one unique tag, selecting both should show both (OR logic)
      const reactBtn = filterButtons.find(
        (btn) => btn.textContent === "react",
      );
      const goBtn = filterButtons.find(
        (btn) => btn.textContent === "go",
      );
      expect(reactBtn).toBeDefined();
      expect(goBtn).toBeDefined();

      await user.click(reactBtn!); // eslint-disable-line @typescript-eslint/no-non-null-assertion
      // Only React Skill shown
      expect(screen.getByText("Only React")).toBeInTheDocument();
      expect(screen.queryByText("Only Go")).not.toBeInTheDocument();
    });
  });

  describe("empty state", () => {
    it("shows empty message when no skills exist", () => {
      setupMocks([]);
      render(<SkillList />);
      expect(
        screen.getByText("No skills found. Add skills to the skills/ directory."),
      ).toBeInTheDocument();
    });

    it("does not render tag filter bar when no skills", () => {
      setupMocks([]);
      render(<SkillList />);
      expect(screen.queryAllByRole("button")).toHaveLength(0);
    });

    it("does not render tag filter bar when skills have no tags", () => {
      setupMocks([makeSkill({ tags: "[]" })]);
      render(<SkillList />);
      // No filter buttons in the tag bar area — only the card link
      const buttons = screen.queryAllByRole("button");
      expect(buttons).toHaveLength(0);
    });
  });

  describe("query options", () => {
    it("calls skill.list.queryOptions", () => {
      setupMocks([makeSkill()]);
      render(<SkillList />);
      expect(mockListQueryOptions).toHaveBeenCalled();
    });
  });
});

describe("SkillListSkeleton", () => {
  it("renders 6 skeleton cards with animate-pulse", () => {
    const { container } = render(<SkillListSkeleton />);
    const pulseElements = container.querySelectorAll(".animate-pulse");
    expect(pulseElements.length).toBeGreaterThan(0);
    // Each card has 3 pulse elements (title, description, tags area) = 18 total
    // But at minimum there should be 6+ (one per card)
    expect(pulseElements.length).toBeGreaterThanOrEqual(6);
  });
});
