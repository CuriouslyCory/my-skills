Based on: [Ryan Carson](https://github.com/snarktank/ralph)
Inspired by: [Geoffrey Huntley's Ralph article](https://ghuntley.com/ralph/)

I add the following to my package.json so I can call `pnpm ralph` to start the loop.

```json
{
  ...
  "scripts": {
    ...
    "ralph": "STORIES=$(jq '.userStories | length' .agents/skills/ralph/scripts/prd.json) && .agents/skills/ralph/scripts/ralph.sh $((STORIES + 4))",
    ...
  }
}
```
