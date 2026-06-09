import { describe, expect, it } from 'vitest';
import {
  aggregateRuns,
  botPolicy,
  simulateEncounter,
  type EncounterOptions,
} from './balance.js';
import { createGame, type GameState } from './gameState.js';
import type { EnemyKind } from './entities.js';

/** Fixed, replayable seed set: seeds 1..60. */
const SEEDS: readonly number[] = Array.from({ length: 60 }, (_, i) => i + 1);

const BASE: EncounterOptions = { enemyCount: 4, maxTicks: 60 * 30 };

/** A tough composition the bot cannot trivialize, so hpLost discriminates. */
const TOUGH: readonly EnemyKind[] = ['shooter', 'shooter', 'tank', 'tank'];
const TOUGH_OPTS: EncounterOptions = {
  enemyCount: 0,
  enemyKinds: TOUGH,
  floor: 3,
  maxTicks: 60 * 30,
};

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

  it("'sharp-tears' (+3) crosses the one-shot breakpoint on a single pickup", () => {
    // Basic enemies have 6 HP; base tearDamage is 3 → 2 hits. sharp-tears is +3
    // (6 dmg) so ONE pickup one-shots them. This is the fix for the dead-item
    // problem: a single sharp-tears must now meaningfully cut time-to-kill,
    // not merely "not regress". Use a comfortable margin, not an exact number.
    const oneSharp = aggregateRuns(SEEDS, { ...BASE, applyItemId: 'sharp-tears' });
    expect(oneSharp.avgTicks).toBeLessThan(baseline.avgTicks * 0.85);

    // A second sharp-tears can't beat one-shotting, so it never regresses.
    const twoSharp = aggregateRuns(SEEDS, {
      ...BASE,
      applyItemIds: ['sharp-tears', 'sharp-tears'],
    });
    expect(twoSharp.avgTicks).toBeLessThanOrEqual(oneSharp.avgTicks + 1);
  });

  it("'fire-tears' (burn DoT) lowers time-to-kill vs a durable comp", () => {
    // Against tanky enemies, burn does meaningful extra work over time. The
    // robust direction is faster clears, not an exact tick count.
    const base = aggregateRuns(SEEDS, TOUGH_OPTS);
    const fire = aggregateRuns(SEEDS, { ...TOUGH_OPTS, applyItemId: 'fire-tears' });
    expect(fire.avgTicks).toBeLessThan(base.avgTicks);
  });

  it("'vitality' never speeds up kills (purely defensive)", () => {
    const vit = aggregateRuns(SEEDS, { ...BASE, applyItemId: 'vitality' });
    // HP only: it should never reduce time-to-kill, and not regress clears.
    expect(vit.avgTicks).toBeGreaterThanOrEqual(baseline.avgTicks - 1);
    expect(vit.clearedRatio).toBeGreaterThanOrEqual(baseline.clearedRatio);
  });
});

describe('balance: burn+slow synergy', () => {
  // Synergy lives in gameState: an enemy that is BOTH burning and slowed takes
  // +50% burn damage. So fire+frost together should out-kill fire alone — by
  // more than frost (which barely dents clear time on its own) would explain.
  const tanks: readonly EnemyKind[] = ['tank', 'tank', 'chaser'];
  const opts: EncounterOptions = { enemyCount: 0, enemyKinds: tanks, floor: 3, maxTicks: 60 * 30 };

  it('fire+frost clears faster than fire alone (synergy is live)', () => {
    const fire = aggregateRuns(SEEDS, { ...opts, applyItemId: 'fire-tears' });
    const fireFrost = aggregateRuns(SEEDS, {
      ...opts,
      applyItemIds: ['fire-tears', 'frost-tears'],
    });
    expect(fireFrost.avgTicks).toBeLessThan(fire.avgTicks);
  });
});

describe('balance: damage mitigation vs tough encounters', () => {
  // Against shooters + tanks the bot takes real damage, so hpLost discriminates
  // (it saturated near 0 against basic chasers). Measured over the seed set,
  // offensive power doubles as mitigation: ending fights sooner means fewer
  // incoming hits. swift-boots/vitality do NOT measurably reduce hpLost here
  // (speed doesn't help this comp; vitality is invisible to a start-full metric)
  // — so we assert the levers that robustly do.
  const base = aggregateRuns(SEEDS, TOUGH_OPTS);

  it('the tough comp actually hurts the bot (metric is discriminating)', () => {
    expect(base.avgHpLost).toBeGreaterThan(1);
  });

  it("'sharp-tears' reduces HP lost by ending fights sooner", () => {
    const sharp = aggregateRuns(SEEDS, { ...TOUGH_OPTS, applyItemId: 'sharp-tears' });
    expect(sharp.avgTicks).toBeLessThan(base.avgTicks);
    expect(sharp.avgHpLost).toBeLessThan(base.avgHpLost);
  });

  it("'fire-tears' also reduces HP lost (burn shortens fights)", () => {
    const fire = aggregateRuns(SEEDS, { ...TOUGH_OPTS, applyItemId: 'fire-tears' });
    expect(fire.avgHpLost).toBeLessThan(base.avgHpLost);
  });
});

describe('balance: composed encounters are deterministic', () => {
  it('same seed + explicit composition yields identical metrics', () => {
    const opts: EncounterOptions = {
      enemyCount: 0,
      enemyKinds: ['tank', 'shooter', 'swarmer'],
      floor: 2,
      maxTicks: 60 * 30,
    };
    expect(simulateEncounter(13, opts)).toEqual(simulateEncounter(13, opts));
  });

  it('honors per-floor HP scaling: a higher floor takes no less time to clear', () => {
    const f1 = aggregateRuns(SEEDS, {
      enemyCount: 0,
      enemyKinds: ['chaser', 'chaser', 'chaser'],
      floor: 1,
      maxTicks: 60 * 30,
    });
    const f3 = aggregateRuns(SEEDS, {
      enemyCount: 0,
      enemyKinds: ['chaser', 'chaser', 'chaser'],
      floor: 3,
      maxTicks: 60 * 30,
    });
    // Floor 3 chasers have +4 HP each, so they cannot clear faster than floor 1.
    expect(f3.avgTicks).toBeGreaterThan(f1.avgTicks);
  });
});
