---
description: Scaffold a new pure core gameplay system with a colocated test, following project conventions.
argument-hint: "<systemName>  e.g. status-effects"
allowed-tools: Read, Write, Edit, Bash
---

Scaffold a new gameplay system named `$ARGUMENTS` in the pure simulation core,
following the conventions in `CLAUDE.md`.

Requirements:

- Create `src/core/<systemName>.ts` and `src/core/<systemName>.test.ts`
  (use a sensible camelCase filename derived from `$ARGUMENTS`).
- The module must be PURE: no Phaser, no DOM, no `Math.random()` /
  `Date.now()`. If it needs randomness, accept an `Rng` parameter.
- Use TypeScript strict style, `import type` for type-only imports, and `.js`
  extensions on relative imports.
- Export the system's public types and functions; if appropriate, re-export
  from `src/core/index.ts`.
- The test file must cover the core invariants AND include a determinism test
  (same seed -> same result) if the system uses `Rng`.
- After scaffolding, run `npm run lint && npm run typecheck && npm test` and
  confirm green.

Before writing, briefly state the system's responsibility and its public API,
then implement a minimal but real first version (not just stubs).
