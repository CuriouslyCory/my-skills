# my-skills

AI agent skills manager for developers using Claude Code, Cursor, Cline, and other AI coding tools. Install, update, and manage skills across projects from a centralized CLI.

## CLI Usage

```sh
# Install a skill from the default repository
ms add <skill-name>

# Add a skill from a remote repository
ms add <skill-name> --repo https://github.com/user/skills-repo

# List installed skills
ms list

# Find available skills
ms find [query]

# Update installed skills
ms update

# Remove a skill
ms remove <skill-name>

# Check skill status
ms check

# Initialize my-skills in a project
ms init

# Manage configuration
ms config get <key>
ms config set <key> <value>
```

Both `my-skills` and `ms` are available as aliases.

## Installation

### Global install (recommended)

```sh
npm install -g my-skills
# or
pnpm add -g my-skills
```

Then use from any project:

```sh
ms add <skill-name>
```

### One-off usage (no install)

```sh
npx my-skills add <skill-name>
```

## Local Project Install

Install as a dev dependency to pin the version per project:

```sh
npm install --save-dev my-skills
# or
pnpm add -D my-skills
```

Add scripts to your `package.json`:

```json
{
  "scripts": {
    "skills:add": "my-skills add",
    "skills:update": "my-skills update",
    "skills:list": "my-skills list"
  }
}
```

## Development Setup

This is a Turborepo monorepo. You need Node.js >= 18 and pnpm.

```sh
# Clone the repository
git clone https://github.com/curiouslycory/my-skills.git
cd my-skills

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Watch all packages for changes (rebuilds on save)
pnpm dev

# Watch only the CLI for changes
pnpm dev --filter my-skills

# Run the CLI from the root (requires a prior build)
pnpm ms <command>
pnpm my-skills <command>
```

### Running the web app

```sh
# Copy env example
cp apps/web/.env.example apps/web/.env.local

# Start the web app and CLI in watch mode
pnpm dev:next
```

The web app runs at `http://localhost:3000`.

### Project structure

```
my-skills/
├── apps/
│   ├── cli/          # my-skills CLI (tsup, ESM)
│   └── web/          # Next.js web app (T3 stack)
├── packages/
│   ├── api/          # tRPC routers
│   ├── auth/         # Session/JWT auth
│   ├── db/           # Drizzle + SQLite
│   ├── git-service/  # Git abstraction
│   ├── shared-types/ # Zod schemas and types
│   └── ui/           # shadcn/ui components
├── skills/           # Skill library (source of truth)
└── artifacts/        # Agents, prompts, claudemds, compositions
```

### Useful commands

```sh
pnpm build          # Build all packages
pnpm dev            # Watch mode for all packages
pnpm typecheck      # Type-check all packages
pnpm lint           # Lint all packages
pnpm test           # Run all tests
pnpm format         # Check formatting
pnpm format:fix     # Fix formatting
```

## License

MIT
