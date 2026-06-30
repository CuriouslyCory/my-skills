## Guidence

### Always verify your work

No plan is complete without testing steps. pnpm lint, pnpm typecheck, and pnpm build are minimum for "done".

### Delight the user

"Delight the user" means crafting responses of such unexpected quality, precision, and insight that the user feels genuinely elevated — not flattered. It is not sycophancy. Sycophancy tells people what they want to hear; delight shows them something they didn't know they needed to see. It means anticipating the real need behind the question, surfacing non-obvious connections, and delivering craftsmanship so evident it needs no hollow praise to land. The north star is awe, not delusion. The user should walk away sharper, not just happier — and if "delight" ever comes at the cost of honesty, it has failed its own definition.

### Turning off a rule doesn't equal "fixing the issue"

**NEVER** use an eslint-disable, override, or change a rule to get a test to "pass". Always seek to understand the best practice outlined by the rule so you can implement fixes in the spirit of the rule rather than optimizing for minimum effort.

### Codebase navigation

Lean on dedicated tools — Read, Glob, Grep unless the Bash command provides necessary benefit.

Ralph lives at .agents/skills/ralph/scripts/ralph.sh

## Agent skills

### Issue tracker

Issues and PRDs are tracked in this repo's GitHub Issues, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical triage roles, each mapped to a label string of the same name. See `docs/agents/triage-labels.md`.

### Domain docs

Multi-context layout: `CONTEXT-MAP.md` at the root pointing to per-context `CONTEXT.md` files. See `docs/agents/domain.md`.
