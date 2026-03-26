import type { ReactElement, ReactNode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render as rtlRender, screen, waitFor } from "@testing-library/react";
import type * as TanStackQuery from "@tanstack/react-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FavoriteList } from "../favorite-list";

// Stable references for navigation mocks — must be defined BEFORE vi.mock
const stableSearchParams = new URLSearchParams();
const mockReplace = vi.fn();
const stableRouter = {
  push: vi.fn(),
  replace: mockReplace,
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
};

vi.mock("next/navigation", () => ({
  useRouter: () => stableRouter,
  useSearchParams: () => stableSearchParams,
  usePathname: () => "/favorites",
}));

// Mock radix icons used by DataTable
vi.mock("@radix-ui/react-icons", () => ({
  CaretSortIcon: (props: Record<string, unknown>) => (
    <svg data-testid="caret-sort-icon" {...props} />
  ),
  ChevronDownIcon: (props: Record<string, unknown>) => (
    <svg data-testid="chevron-down-icon" {...props} />
  ),
  ChevronUpIcon: (props: Record<string, unknown>) => (
    <svg data-testid="chevron-up-icon" {...props} />
  ),
}));

// Mock toast
vi.mock("@curiouslycory/ui/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Mock AddFavoriteDialog to isolate FavoriteList tests
vi.mock("../add-favorite-dialog", () => ({
  AddFavoriteDialog: () => <button type="button">+ Add Favorite</button>,
}));

// Mock useSuspenseQuery and useMutation from react-query
// vi.hoisted ensures these are available before vi.mock factories run
const mockUseSuspenseQuery = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => { data: unknown }>(),
);
const mockUseMutation = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => { mutate: unknown; isPending: boolean }>(),
);
const mockInvalidateQueries = vi.fn();

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof TanStackQuery>();
  return {
    ...actual,
    useSuspenseQuery: (...args: unknown[]): { data: unknown } =>
      mockUseSuspenseQuery(...args) as { data: unknown },
    useMutation: (...args: unknown[]): { mutate: unknown; isPending: boolean } =>
      mockUseMutation(...args) as { mutate: unknown; isPending: boolean },
    useQueryClient: () => ({
      invalidateQueries: mockInvalidateQueries,
    }),
  };
});

// Mock useTRPC
const mockListQueryOptions = vi.hoisted(() => vi.fn());
const mockRemoveMutationOptions = vi.hoisted(() => vi.fn());
const mockStatsQueryOptions = vi.hoisted(() => vi.fn());

vi.mock("~/trpc/react", () => ({
  useTRPC: () => ({
    favorite: {
      list: {
        queryOptions: mockListQueryOptions,
      },
      remove: {
        mutationOptions: mockRemoveMutationOptions,
      },
      stats: {
        queryOptions: mockStatsQueryOptions,
      },
    },
  }),
}));

// Local render wrapper (avoids test-utils which has its own next/navigation mock)
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
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

interface FavoriteItem {
  id: string;
  repoUrl: string;
  name: string;
  description: string | null;
  skillName: string | null;
  type: "repo" | "skill";
  addedAt: string;
}

function makeFavorite(overrides: Partial<FavoriteItem> = {}): FavoriteItem {
  return {
    id: overrides.id ?? "fav-1",
    repoUrl: overrides.repoUrl ?? "https://github.com/owner/repo",
    name: overrides.name ?? "Test Favorite",
    description: overrides.description ?? null,
    skillName: overrides.skillName ?? null,
    type: overrides.type ?? "repo",
    addedAt: overrides.addedAt ?? "2026-03-01T00:00:00.000Z",
  };
}

const mockMutate = vi.fn();

function setupMocks(items: FavoriteItem[] = [], totalCount?: number) {
  mockListQueryOptions.mockReturnValue({
    queryKey: ["favorite", "list"],
    queryFn: vi.fn(),
  });
  mockStatsQueryOptions.mockReturnValue({
    queryKey: ["favorite", "stats"],
    queryFn: vi.fn(),
  });
  mockRemoveMutationOptions.mockImplementation(
    (opts: Record<string, unknown>) => opts,
  );

  mockUseSuspenseQuery.mockReturnValue({
    data: {
      items,
      totalCount: totalCount ?? items.length,
    },
  });

  mockUseMutation.mockReturnValue({
    mutate: mockMutate,
    isPending: false,
  });
}

describe("FavoriteList component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset search params between tests
    for (const key of [...stableSearchParams.keys()]) {
      stableSearchParams.delete(key);
    }
  });

  describe("render with data", () => {
    it("shows table with favorite items including name, type badge, and repo URL", () => {
      setupMocks([
        makeFavorite({
          name: "My Repo",
          type: "repo",
          repoUrl: "https://github.com/foo/bar",
        }),
        makeFavorite({
          id: "fav-2",
          name: "My Skill",
          type: "skill",
          repoUrl: "https://github.com/baz/qux",
          skillName: "cool-skill",
        }),
      ]);
      render(<FavoriteList />);

      expect(screen.getByText("My Repo")).toBeInTheDocument();
      expect(screen.getByText("My Skill")).toBeInTheDocument();
      expect(
        screen.getByText("https://github.com/foo/bar"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("https://github.com/baz/qux"),
      ).toBeInTheDocument();
      expect(screen.getByText("Repo")).toBeInTheDocument();
      expect(screen.getByText("Skill")).toBeInTheDocument();
    });

    it("shows skill name column for skill favorites", () => {
      setupMocks([
        makeFavorite({ type: "skill", skillName: "my-awesome-skill" }),
      ]);
      render(<FavoriteList />);
      expect(screen.getByText("my-awesome-skill")).toBeInTheDocument();
    });

    it("shows dash for null skill name", () => {
      setupMocks([makeFavorite({ type: "repo", skillName: null })]);
      render(<FavoriteList />);
      const cells = screen.getAllByText("—");
      expect(cells.length).toBeGreaterThan(0);
    });

    it("formats addedAt date correctly", () => {
      setupMocks([makeFavorite({ addedAt: "2026-03-15T12:00:00.000Z" })]);
      render(<FavoriteList />);
      expect(screen.getByText("Mar 15, 2026")).toBeInTheDocument();
    });
  });

  describe("search input", () => {
    it("renders search input with placeholder", () => {
      setupMocks([makeFavorite()]);
      render(<FavoriteList />);
      expect(
        screen.getByPlaceholderText("Search favorites..."),
      ).toBeInTheDocument();
    });

    it("updates search value on typing", async () => {
      const { default: userEvent } = await import(
        "@testing-library/user-event"
      );
      const user = userEvent.setup();
      setupMocks([makeFavorite()]);
      render(<FavoriteList />);

      const input = screen.getByPlaceholderText("Search favorites...");
      await user.type(input, "test query");
      expect(input).toHaveValue("test query");
    });
  });

  describe("type filter buttons", () => {
    it("renders All, Repos, Skills filter buttons", () => {
      setupMocks([makeFavorite()]);
      render(<FavoriteList />);
      expect(screen.getByText("All")).toBeInTheDocument();
      expect(screen.getByText("Repos")).toBeInTheDocument();
      expect(screen.getByText("Skills")).toBeInTheDocument();
    });

    it("clicking Repos filter calls router.replace with type param", async () => {
      const { default: userEvent } = await import(
        "@testing-library/user-event"
      );
      const user = userEvent.setup();
      setupMocks([makeFavorite()]);
      render(<FavoriteList />);

      await user.click(screen.getByText("Repos"));
      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith(
          expect.stringContaining("type=repo"),
          expect.objectContaining({ scroll: false }),
        );
      });
    });

    it("clicking Skills filter calls router.replace with type param", async () => {
      const { default: userEvent } = await import(
        "@testing-library/user-event"
      );
      const user = userEvent.setup();
      setupMocks([makeFavorite()]);
      render(<FavoriteList />);

      await user.click(screen.getByText("Skills"));
      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith(
          expect.stringContaining("type=skill"),
          expect.objectContaining({ scroll: false }),
        );
      });
    });
  });

  describe("pagination", () => {
    it("shows page indicator and navigation buttons", () => {
      setupMocks([makeFavorite()], 1);
      render(<FavoriteList />);
      expect(screen.getByText(/Page 1 of 1/)).toBeInTheDocument();
      expect(screen.getByText("Previous")).toBeInTheDocument();
      expect(screen.getByText("Next")).toBeInTheDocument();
    });

    it("Previous button is disabled on first page", () => {
      setupMocks([makeFavorite()], 1);
      render(<FavoriteList />);
      expect(screen.getByText("Previous")).toBeDisabled();
    });

    it("shows correct page count for multi-page data", () => {
      setupMocks([makeFavorite()], 61);
      render(<FavoriteList />);
      expect(screen.getByText(/Page 1 of 3/)).toBeInTheDocument();
    });
  });

  describe("empty state", () => {
    it("shows empty message when no favorites and no filters", () => {
      setupMocks([], 0);
      render(<FavoriteList />);
      expect(
        screen.getByText(
          "No favorites yet. Add a repo or skill to get started.",
        ),
      ).toBeInTheDocument();
    });

    it("shows Add Favorite button in empty state", () => {
      setupMocks([], 0);
      render(<FavoriteList />);
      expect(screen.getByText("+ Add Favorite")).toBeInTheDocument();
    });

    it("shows table No results when items empty but filter active", () => {
      stableSearchParams.set("type", "repo");
      setupMocks([], 0);
      render(<FavoriteList />);
      expect(screen.getByText("No results.")).toBeInTheDocument();
    });
  });

  describe("remove action", () => {
    it("renders Remove button for each row", () => {
      setupMocks([
        makeFavorite({ id: "fav-1", name: "First" }),
        makeFavorite({ id: "fav-2", name: "Second" }),
      ]);
      render(<FavoriteList />);
      const removeButtons = screen.getAllByText("Remove");
      expect(removeButtons).toHaveLength(2);
    });

    it("clicking Remove opens confirmation dialog", async () => {
      const { default: userEvent } = await import(
        "@testing-library/user-event"
      );
      const user = userEvent.setup();
      setupMocks([makeFavorite({ name: "My Favorite" })]);
      render(<FavoriteList />);

      await user.click(screen.getByText("Remove"));
      await waitFor(() => {
        expect(screen.getByText("Remove Favorite")).toBeInTheDocument();
        expect(
          screen.getByText(/Are you sure you want to remove "My Favorite"/),
        ).toBeInTheDocument();
      });
    });

    it("confirmation dialog has Cancel and Remove buttons", async () => {
      const { default: userEvent } = await import(
        "@testing-library/user-event"
      );
      const user = userEvent.setup();
      setupMocks([makeFavorite()]);
      render(<FavoriteList />);

      await user.click(screen.getByText("Remove"));
      await waitFor(() => {
        expect(screen.getByText("Cancel")).toBeInTheDocument();
        const removeButtons = screen.getAllByText("Remove");
        expect(removeButtons.length).toBeGreaterThanOrEqual(2);
      });
    });

    it("confirming removal calls mutate with correct id", async () => {
      const { default: userEvent } = await import(
        "@testing-library/user-event"
      );
      const user = userEvent.setup();
      setupMocks([makeFavorite({ id: "fav-42" })]);
      render(<FavoriteList />);

      await user.click(screen.getByText("Remove"));
      await waitFor(() => {
        expect(screen.getByText("Remove Favorite")).toBeInTheDocument();
      });

      const dialogActions = screen.getAllByText("Remove");
      const confirmBtn = dialogActions[dialogActions.length - 1];
      if (confirmBtn) {
        await user.click(confirmBtn);
      }

      expect(mockMutate).toHaveBeenCalledWith({ id: "fav-42" });
    });
  });

  describe("query options", () => {
    it("passes correct params to favorite.list.queryOptions", () => {
      setupMocks([makeFavorite()]);
      render(<FavoriteList />);

      expect(mockListQueryOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 1,
          pageSize: 30,
        }),
      );
    });

    it("passes type filter to queryOptions when set", () => {
      stableSearchParams.set("type", "skill");
      setupMocks([makeFavorite()]);
      render(<FavoriteList />);

      expect(mockListQueryOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "skill",
        }),
      );
    });
  });
});
