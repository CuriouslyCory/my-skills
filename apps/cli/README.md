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

## Install

```sh
npm install -g my-skills
# or
pnpm add -g my-skills
```

### Per-project install

Pin the version per project so the whole team stays in sync:

```sh
npm install --save-dev my-skills
# or
pnpm add -D my-skills
```

---

## Usage

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

---

## Contributing

See the [main repository](https://github.com/CuriouslyCory/my-skills) for development setup and contribution guidelines.

## License

[MIT](https://github.com/CuriouslyCory/my-skills/blob/main/LICENSE) © Cory Sougstad
