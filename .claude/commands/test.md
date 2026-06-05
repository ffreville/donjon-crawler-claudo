---
description: Run the full check suite (lint + typecheck + unit tests), and e2e if asked.
argument-hint: "[e2e]"
allowed-tools: Bash
---

Run the project's checks and report results concisely.

1. `npm run lint`
2. `npm run typecheck`
3. `npm test`

If the argument `$ARGUMENTS` contains `e2e`, also run `npm run test:e2e`.

If anything fails, show the relevant failing output and propose the smallest
fix. Do not mark the work done while any check is red.
