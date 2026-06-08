import { describe, expect, it } from 'vitest';
import {
  aggregateRuns,
  botPolicy,
  simulateEncounter,
  type EncounterOptions,
} from './balance.js';
import { createGame, type GameState } from './gameState.js';

/** Fixed, replayable seed set: seeds 1..60. */
const SEEDS: readonly number[] = Array.from({ length: 60 }, (_, i) => i + 1);

const BASE: EncounterOptions = { enemyCount: 4, maxTicks: 60 * 30 };

/** A real GameState with a single enemy placed directly to the player's right. */
function stateWithEnemyToTheRight(): GameState {
  const state = createGame(1, { enemyCount: 1 });
  const enemy = state.enemies[0];
  if (enemy) {
    enemy.pos = { x: state.player.pos.x + 4, y: state.player.pos.y };
  }
  return state;
}

describe('balance: bot policy', () => {
  it('returns a normalized aim at the nearest enemy and fires', () => {
    const out = botPolicy(stateWithEnemyToTheRight());
    // Enemy is to the right, so aim should point +x.
    expect(out.aimX).toBeGreaterThan(0);
    expect(Math.hypot(out.aimX ?? 0, out.aimY ?? 0)).toBeCloseTo(1, 6);
  });

  it('produces no aim when the room is already clear', () => {
    const state = stateWithEnemyToTheRight();
    state.enemies = [];
    const out = botPolicy(state);
    expect(out.aimX).toBe(0);
    expect(out.aimY).toBe(0);
  });
});

describe('balance: simulation harness', () => {
  it('is deterministic — same seed + item yields identical metrics', () => {
    const a = simulateEncounter(7, { ...BASE, applyItemId: 'sharp-tears' });
    const b = simulateEncounter(7, { ...BASE, applyItemId: 'sharp-tears' });
    expect(a).toEqual(b);
  });

  it('clears at least some encounters at baseline (sanity)', () => {
    const baseline = aggregateRuns(SEEDS, BASE);
    expect(baseline.clearedRatio).toBeGreaterThan(0);
    expect(baseline.avgTicks).toBeGreaterThan(0);
  });
});

describe('balance: item impact properties', () => {
  const baseline = aggregateRuns(SEEDS, BASE);

  it("'rapid-fire' lowers average time-to-kill vs baseline (more shots/sec)", () => {
    const rapid = aggregateRuns(SEEDS, { ...BASE, applyItemId: 'rapid-fire' });
    // Time-to-kill is bottlenecked by how often the bot can fire, so a higher
    // fire rate directly clears the room faster. This is the robust direction.
    expect(rapid.avgTicks).toBeLessThan(baseline.avgTicks);
  });

  it("'sharp-tears' is a breakpoint item: 1x is neutral, 2x cuts time-to-kill", () => {
    // Basic enemies have 6 HP and base tearDamage is 3 → 2 hits to kill.
    // A single +2 sharp-tears (5 dmg) is still 2 hits, so it must NOT make
    // kills slower (no regression) — and in practice is neutral here.
    const oneSharp = aggregateRuns(SEEDS, { ...BASE, applyItemId: 'sharp-tears' });
    expect(oneSharp.avgTicks).toBeLessThanOrEqual(baseline.avgTicks);

    // Two sharp-tears (7 dmg) crosses the one-shot breakpoint → far faster.
    const twoSharp = aggregateRuns(SEEDS, {
      ...BASE,
      applyItemIds: ['sharp-tears', 'sharp-tears'],
    });
    expect(twoSharp.avgTicks).toBeLessThan(baseline.avgTicks);
  });

  it("'vitality' is purely defensive — it never speeds up kills", () => {
    const vit = aggregateRuns(SEEDS, { ...BASE, applyItemId: 'vitality' });
    // HP only: it should never reduce time-to-kill, and not regress clears.
    expect(vit.avgTicks).toBeGreaterThanOrEqual(baseline.avgTicks - 1);
    expect(vit.clearedRatio).toBeGreaterThanOrEqual(baseline.clearedRatio);
  });
});
