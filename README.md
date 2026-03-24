<p align="center">
  <img src="https://img.shields.io/npm/v/my-skills?color=blue&label=npm" alt="npm version" />
  <img src="https://img.shields.io/npm/l/my-skills" alt="license" />
  <img src="https://img.shields.io/node/v/my-skills" alt="node version" />
  <img src="https://img.shields.io/npm/dm/my-skills" alt="downloads" />
</p>

# my-skills

**The package manager for AI agent skills.** Install, update, and share reusable skills across Claude Code, Cursor, Cline, GitHub Copilot, Codex, Gemini CLI, and more — from a single CLI.

Compatible with the [agentskills.io](https://agentskills.io) spec and works as a drop-in replacement for the `skills.sh` CLI — except `ms install` actually works.

Think of it like npm, but for the prompts, workflows, and capabilities you give your AI coding tools.

---

## Table of Contents

- [Why my-skills?](#why-my-skills)
- [Quick Start](#quick-start)
- [CLI Reference](#cli-reference)
- [Supported AI Tools](#supported-ai-tools)
- [Per-Project Install](#per-project-install)
- [Creating Your Own Skills](#creating-your-own-skills)
- [Contributing](#contributing)
  - [Deploy the Web UI to Vercel](#deploy-the-web-ui-to-vercel)
- [Troubleshooting](#troubleshooting)
- [Roadmap](#roadmap)
- [License](#license)

---

## Why my-skills?

AI coding agents are powerful, but their skills live scattered across projects — copy-pasted markdown files, one-off prompts, and tribal knowledge buried in Slack threads. **my-skills** fixes that:

- **One command to install a skill** — `ms add code-review` and it's wired into your agent, ready to go.
- **Works with every major AI coding tool** — Claude Code, Cursor, Cline, GitHub Copilot, Codex, and Gemini CLI are all supported out of the box.
- **Share skills across teams and projects** — publish skills to any Git repo and install them anywhere.
- **Keep skills up to date** — `ms update` pulls the latest versions from the source.
- **Version-tracked and reproducible** — a manifest file locks your installed skills so teammates get the same setup.

---

## Quick Start

### Install

```sh
npm install -g my-skills
# or
pnpm add -g my-skills
```

### Add your first skill

```sh
ms add <skill-name>
```

That's it. The skill is installed and configured for whichever AI agents you have in your project.

### Try it without installing

```sh
npx my-skills add <skill-name>
```

---

## CLI Reference

Both `my-skills` and `ms` work as the CLI command.

| Command                       | Description                                 |
| ----------------------------- | ------------------------------------------- |
| `ms add <skill>`              | Install a skill from a GitHub repository    |
| `ms add <skill> --repo <url>` | Install from a specific repository          |
| `ms add`                      | Restore all skills from the manifest        |
| `ms find [query]`             | Search for available skills                 |
| `ms list`                     | List installed skills                       |
| `ms update`                   | Update all installed skills to latest       |
| `ms check`                    | Check which skills have updates available   |
| `ms remove <skill>`           | Remove an installed skill                   |
| `ms init`                     | Scaffold a new skill in the current project |
| `ms config get <key>`         | Read a config value                         |
| `ms config set <key> <value>` | Set a config value                          |
| `ms config list`              | Show all config values                      |
| `ms config reset <key>`       | Reset a config key to default               |

### Examples

```sh
# Search for skills matching "review"
ms find review

# Install a skill from a custom repository
ms add my-custom-skill --repo https://github.com/myorg/our-skills

# See what's outdated
ms check

# Update everything
ms update
```

---

## Supported AI Tools

my-skills automatically detects which AI coding tools are configured in your project and installs skills in the right format for each:

| Tool           | Status    |
| -------------- | --------- |
| Claude Code    | Supported |
| Cursor         | Supported |
| Cline          | Supported |
| GitHub Copilot | Supported |
| Codex          | Supported |
| Gemini CLI     | Supported |

Don't see your tool? [Open an issue](https://github.com/CuriouslyCory/my-skills/issues) or [submit a PR](#contributing) to add an adapter.

---

## Per-Project Install

Pin the version per project so the whole team stays in sync:

```sh
npm install --save-dev my-skills
# or
pnpm add -D my-skills
```

Add convenience scripts to `package.json`:

```json
{
  "scripts": {
    "skills:add": "my-skills add",
    "skills:update": "my-skills update",
    "skills:list": "my-skills list"
  }
}
```

---

## Creating Your Own Skills

You can author and share skills with `ms init`:

```sh
ms init
```

This scaffolds a new `SKILL.md` with the required frontmatter. Skills are plain markdown files with metadata — easy to read, easy to version, easy to share.

### Publishing Skills

Skills live in Git repositories. To share them:

1. Create a repository (public or private)
2. Add your skill markdown files
3. Others install with `ms add <skill-name> --repo <your-repo-url>`

You can also configure favorite repositories so your team doesn't need to type the URL every time:

```sh
ms config set favorites '["myorg/our-skills"]'
```

---

## Contributing

Contributions are welcome! Whether it's a bug fix, a new adapter for another AI tool, or a skill you want to share with the community — we'd love your help.

### Prerequisites

- **Node.js** >= 18
- **pnpm** (the repo uses pnpm workspaces)

### Setup

```sh
# 1. Fork and clone
git clone https://github.com/<your-username>/my-skills.git
cd my-skills

# 2. Install dependencies
pnpm install

# 3. Copy and configure environment
cp .env.example .env

# 4. Create the database
pnpm db:push

# 5. Build all packages
pnpm build

# 6. Run in watch mode
pnpm dev
```

### Running the CLI locally

```sh
# After building, run the CLI from the repo root
pnpm ms <command>
pnpm my-skills <command>

# Or watch just the CLI for faster iteration
pnpm dev --filter my-skills
```

### Running the web app

```sh
cp apps/web/.env.example apps/web/.env.local
pnpm dev:next
```

The web app runs at `http://localhost:3000`.

### Deploy the Web UI to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FCuriouslyCory%2Fmy-skills&env=POSTGRES_URL,AUTH_SECRET,AUTH_DISCORD_ID,AUTH_DISCORD_SECRET&envDescription=Database%20connection%20and%20auth%20credentials%20needed%20for%20the%20web%20UI&envLink=https%3A%2F%2Fgithub.com%2FCuriouslyCory%2Fmy-skills%2Fblob%2Fmain%2F.env.example&root-directory=apps/web)

You'll need a PostgreSQL database. Any of these work well with Vercel:

- [Supabase](https://supabase.com) — generous free tier, built-in auth and realtime
- [Neon](https://neon.tech) — serverless Postgres with branching, great free tier
- [Vercel Postgres](https://vercel.com/docs/storage/vercel-postgres) — native Vercel integration, zero-config

| Variable              | Description                                                            |
| --------------------- | ---------------------------------------------------------------------- |
| `POSTGRES_URL`        | PostgreSQL connection string                                           |
| `AUTH_SECRET`         | Secret for session encryption (generate via `openssl rand -base64 32`) |
| `AUTH_DISCORD_ID`     | Discord OAuth application ID                                           |
| `AUTH_DISCORD_SECRET` | Discord OAuth application secret                                       |

### Project Structure

```
my-skills/
├── apps/
│   ├── cli/            # The my-skills CLI (tsup, ESM)
│   └── web/            # Next.js web app (T3 stack)
├── packages/
│   ├── api/            # tRPC routers
│   ├── auth/           # Session / JWT auth
│   ├── db/             # Drizzle + SQLite
│   ├── git-service/    # Git abstraction layer
│   ├── shared-types/   # Zod schemas and shared types
│   └── ui/             # shadcn/ui component library
├── skills/             # Skill library (source of truth)
└── artifacts/          # Agents, prompts, compositions
```

### Development Commands

```sh
pnpm build          # Build all packages
pnpm dev            # Watch mode for all packages
pnpm typecheck      # Type-check all packages
pnpm lint           # Lint all packages
pnpm test           # Run all tests
pnpm format         # Check formatting
pnpm format:fix     # Fix formatting
```

### Before Submitting a PR

Please make sure the following all pass:

```sh
pnpm lint
pnpm typecheck
pnpm build
```

### Adding a New Adapter

Want to support another AI coding tool? Adapters live in `apps/cli/src/adapters/`. Each adapter implements a simple interface for reading and writing skill files in the format the target tool expects. Check the existing adapters for examples.

---

## Troubleshooting

<details>
<summary><strong>Command not found: ms</strong></summary>

Make sure you installed globally:

```sh
npm install -g my-skills
```

If using pnpm, ensure the global bin directory is on your `PATH`:

```sh
pnpm setup
```

</details>

<details>
<summary><strong>Skills not appearing in my AI tool</strong></summary>

Run `ms list` to confirm the skill is installed, then check that my-skills detected your AI tool:

```sh
ms add <skill-name>
```

The output will show which adapters were used. If your tool isn't detected, make sure its config files exist in the project (e.g., `.claude/` for Claude Code, `.cursor/` for Cursor).

</details>

<details>
<summary><strong>Permission errors on global install</strong></summary>

Avoid `sudo npm install -g`. Instead, configure npm to use a directory you own:

```sh
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'
# Add to your shell profile:
export PATH="$HOME/.npm-global/bin:$PATH"
```

</details>

<details>
<summary><strong>pnpm install fails during development</strong></summary>

Make sure you're using the correct pnpm version. The repo specifies `pnpm@10.32.0` via `packageManager` in `package.json`. Enable corepack to use the exact version:

```sh
corepack enable
corepack prepare
pnpm install
```

</details>

---

## Roadmap

- [ ] Skill dependency resolution
- [ ] `ms publish` command for streamlined skill sharing
- [ ] Skill templates and scaffolding improvements
- [ ] Community skill registry / discovery

Have an idea? [Open a discussion](https://github.com/CuriouslyCory/my-skills/issues) — we'd love to hear it.

---

## License

[MIT](LICENSE) &copy; Cory Sougstad

---

<p align="center">
  Built with TypeScript, Turborepo, and a mass surplus of enthusiasm for AI tooling.<br/>
  If my-skills helps you, consider giving it a star on GitHub.
</p>
