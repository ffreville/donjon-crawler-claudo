# donjon-crawler-claudo

A 2D twin-stick roguelite dungeon crawler in the spirit of *The Binding of Isaac*:
procedurally generated floors of rooms, real-time combat, items with synergies,
permadeath, seed-reproducible runs.

This is a personal project. It has **nothing to do with the author's employer**.

## The one rule that governs everything: keep the core pure

The codebase is split into two layers, and the boundary is sacred:

- **`src/core/` — the simulation.** Pure, deterministic TypeScript. The game
  IS this code: dungeon generation, combat, entities, items, status effects,
  state transitions. It has **zero dependency on Phaser, the DOM, or any
  browser/engine API.** It never calls `Math.random()` — randomness flows
  through a seeded `Rng`. Given the same seed and inputs, it always produces
  the same run.
- **`src/render/` — the Phaser layer.** Reads from `GameState` and draws it;
  translates input into core mutations. Owns **no gameplay state of its own**.

Why this matters: the pure core can be unit-tested and replayed **headlessly**,
which is exactly what lets AI agents close the loop without a GPU or a browser.
The moment gameplay logic leaks into the render layer, that loop breaks.

This invariant is enforced by ESLint (`no-restricted-imports` on `src/core/**`),
not just by convention — a Phaser/render/DOM import in the core is a build error.

## Project layout

```
src/core/            Pure simulation (rng, dungeon, combat, room, gameState)
src/core/*.test.ts   Vitest unit tests, colocated with the code
src/render/          Phaser 3 rendering + input
tests/e2e/           Playwright smoke / integration tests
.claude/agents/      Specialist subagents
.claude/commands/    Slash-command workflows
.github/workflows/   CI (lint + typecheck + test + build)
```

`src/core/index.ts` is the public surface. **Render code imports only from
`../core/index.js`**, never reaches into individual core files.

## Conventions

- **TypeScript strict**, plus `noUncheckedIndexedAccess` and
  `verbatimModuleSyntax`. Use `import type { ... }` for type-only imports.
- Relative imports carry the `.js` extension (ESM + bundler resolution).
- **Determinism is non-negotiable** in the core. No `Math.random()`, no
  `Date.now()`, no wall-clock or ambient state. Thread `Rng` explicitly.
- Prefer pure functions that take state and return/ mutate it predictably.
  Keep side effects (rendering, audio, input) in `src/render/`.
- Every core system ships with Vitest tests covering its invariants,
  including a determinism test (same seed → same result).

## Commands

```
npm run dev         Vite dev server at http://localhost:5173
npm run typecheck   tsc --noEmit
npm run lint        ESLint (enforces the core-purity invariant)
npm test            Vitest (unit tests on the core)
npm run test:e2e    Playwright (boots the game in a headless browser)
npm run build       typecheck + production build
```

Definition of done for any change: `npm run lint && npm run typecheck && npm test`
all green, plus a build if render/config changed.

## The agent team (lightweight, on purpose)

Subagents are mapped to architectural seams, not job titles. They don't persist
state between runs and execute sequentially — treat them as specialists you
delegate bounded work to, not a standing team.

- **procgen-engineer** — dungeon/level generation in the core (room graphs,
  layout, placement, difficulty pacing). Owns `src/core/dungeon.ts` & friends.
- **content-balance-designer** — items, enemies, synergies, drop tables; writes
  headless balance simulations against the deterministic core.
- **code-reviewer** — read-only review; guards the core/render boundary, strict
  TS, and determinism.
- **qa-tester** — Vitest unit tests + Playwright e2e + deterministic replay tests.

The main thread acts as lead/integrator and handles the render layer and
general systems work directly.

### How the team is actually invoked (read this — it differs by runtime)

These subagents are **native to Claude Code (the CLI)**: there they can be
auto-routed or addressed directly (e.g. `@procgen-engineer`), and the
`.claude/commands/` slash commands are first-class.

In **Cowork (desktop)** there is **no automatic routing**: project subagents in
`.claude/agents/` and project commands in `.claude/commands/` are NOT loaded.
Only `CLAUDE.md` (this file) is read as project context. So in Cowork the agents
are **specialist briefs**, not self-triggering teammates. The working convention
is:

- The main thread is the orchestrator. When a task fits a specialist, it READS
  that agent's brief from `.claude/agents/<name>.md` and delegates the bounded
  work to a generic worker agent **primed with that brief** (this is the only
  mechanism that actually works in Cowork).
- The user can trigger this explicitly: e.g. *"as procgen-engineer, add a shop
  room"* → the main thread loads `procgen-engineer.md` and delegates accordingly.
- The briefs remain the single source of truth for each specialist's scope,
  invariants, and definition-of-done, regardless of runtime.

So: same files, two modes. CLI = auto-routed team. Cowork = briefs the
orchestrator applies by hand.

## Known limitation

The render layer's feedback loop is visual, which is hard to verify headlessly.
Agents are strongest on the pure core and weakest on game *feel*. Keep as much
behavior as possible in the core so it stays testable.
