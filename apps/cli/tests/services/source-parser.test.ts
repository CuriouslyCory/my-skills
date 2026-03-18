import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { parseSource } from "../../src/services/source-parser.js";
import type { GitHubSource, LocalSource } from "../../src/services/source-parser.js";

describe("source-parser", () => {
  describe("local paths", () => {
    it("parses relative path starting with ./", () => {
      const result = parseSource("./my-skill") as LocalSource;
      expect(result.type).toBe("local");
      expect(result.path).toBe(resolve("./my-skill"));
    });

    it("parses relative path starting with ../", () => {
      const result = parseSource("../other/skill") as LocalSource;
      expect(result.type).toBe("local");
      expect(result.path).toBe(resolve("../other/skill"));
    });

    it("parses absolute path", () => {
      const result = parseSource("/home/user/skills/my-skill") as LocalSource;
      expect(result.type).toBe("local");
      expect(result.path).toBe("/home/user/skills/my-skill");
    });
  });

  describe("GitHub URLs", () => {
    it("parses full GitHub URL", () => {
      const result = parseSource(
        "https://github.com/owner/repo",
      ) as GitHubSource;
      expect(result.type).toBe("github");
      expect(result.owner).toBe("owner");
      expect(result.repo).toBe("repo");
      expect(result.skill).toBeUndefined();
      expect(result.url).toBe("https://github.com/owner/repo.git");
    });

    it("parses GitHub URL with .git suffix", () => {
      const result = parseSource(
        "https://github.com/owner/repo.git",
      ) as GitHubSource;
      expect(result.type).toBe("github");
      expect(result.owner).toBe("owner");
      expect(result.repo).toBe("repo");
      expect(result.url).toBe("https://github.com/owner/repo.git");
    });

    it("parses GitHub URL with skill name", () => {
      const result = parseSource(
        "https://github.com/owner/repo/my-skill",
      ) as GitHubSource;
      expect(result.type).toBe("github");
      expect(result.owner).toBe("owner");
      expect(result.repo).toBe("repo");
      expect(result.skill).toBe("my-skill");
    });

    it("parses http GitHub URL", () => {
      const result = parseSource(
        "http://github.com/owner/repo",
      ) as GitHubSource;
      expect(result.type).toBe("github");
      expect(result.owner).toBe("owner");
      expect(result.repo).toBe("repo");
    });
  });

  describe("shorthand format", () => {
    it("parses owner/repo shorthand", () => {
      const result = parseSource("owner/repo") as GitHubSource;
      expect(result.type).toBe("github");
      expect(result.owner).toBe("owner");
      expect(result.repo).toBe("repo");
      expect(result.skill).toBeUndefined();
      expect(result.url).toBe("https://github.com/owner/repo.git");
    });

    it("parses owner/repo/skill shorthand", () => {
      const result = parseSource("owner/repo/my-skill") as GitHubSource;
      expect(result.type).toBe("github");
      expect(result.owner).toBe("owner");
      expect(result.repo).toBe("repo");
      expect(result.skill).toBe("my-skill");
    });
  });

  describe("error cases", () => {
    it("throws for unrecognized source format", () => {
      expect(() => parseSource("just-a-name")).toThrow(
        /Unable to parse source/,
      );
    });

    it("throws for empty-ish invalid strings", () => {
      expect(() => parseSource(".hidden")).toThrow(/Unable to parse source/);
    });
  });
});
