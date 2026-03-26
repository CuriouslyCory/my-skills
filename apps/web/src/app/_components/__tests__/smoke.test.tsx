import { describe, it, expect } from "vitest";
import { render, screen } from "~/test-utils";

describe("smoke test", () => {
  it("renders a simple div and asserts it exists", () => {
    render(<div>Hello test infrastructure</div>);
    expect(screen.getByText("Hello test infrastructure")).toBeInTheDocument();
  });
});
