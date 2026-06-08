/**
 * Headless balance simulation harness.
 *
 * The core is pure and deterministic, so we can play the game thousands of
 * times without a GPU or browser and aggregate metrics (time-to-kill, hp lost,
 * clear rate). This is how content claims like "sharp-tears kills faster" are
 * backed by numbers instead of guessed.
 *
 * PURE by construction: no Phaser/DOM, and no `Math.random()`. The only source
 * of randomness is the seeded core (`createGame(seed)`); the bot policy below is
 * a deterministic function of `GameState`, so a given `(seed, item)` pair always
 * yields identical metrics.
 */

import { createGame, tick, FIXED_DT, type GameState, type InputState } from './gameState.js';
import { applyItem, getItem } from './items.js';
import type { Enemy } from './entities.js';
import type { Vec2 } from './types.js';

/** Preferred standoff distance the bot tries to hold from the nearest enemy, in tiles. */
export const KITE_DISTANCE = 3.5;
/** Hysteresis band around `KITE_DISTANCE`: inside it the bot holds position. */
export const KITE_BAND = 0.6;
/** Interior margin kept from room walls so the bot doesn't pin itself in a corner. */
const WALL_MARGIN = 1.5;

/** Returns the nearest living enemy to `from`, or undefined if none remain. */
function nearestEnemy(from: Vec2, enemies: readonly Enemy[]): Enemy | undefined {
  let best: Enemy | undefined;
  let bestDist = Infinity;
  for (const e of enemies) {
    if (e.hp <= 0) continue;
    const d = Math.hypot(e.pos.x - from.x, e.pos.y - from.y);
    if (d < bestDist) {
      bestDist = d;
      best = e;
    }
  }
  return best;
}

/**
 * Deterministic kiting bot. Given the current state it:
 *  - aims at the nearest living enemy (firing every tick the cooldown allows),
 *  - retreats from that enemy when closer than the standoff band,
 *  - approaches when farther than the band,
 *  - holds position (and strafes toward room center) when inside the band.
 *
 * All tie-breaks derive from positions in the state, never from randomness, so
 * the policy is a pure function of `GameState`.
 */
export function botPolicy(state: GameState): InputState {
  const { player } = state;
  const target = nearestEnemy(player.pos, state.enemies);
  if (!target) return { moveX: 0, moveY: 0, aimX: 0, aimY: 0 };

  const dx = target.pos.x - player.pos.x;
  const dy = target.pos.y - player.pos.y;
  const dist = Math.hypot(dx, dy);

  // Aim straight at the nearest enemy.
  const aimX = dist > 0 ? dx / dist : 1;
  const aimY = dist > 0 ? dy / dist : 0;

  let moveX = 0;
  let moveY = 0;
  if (dist > 0) {
    const ux = dx / dist;
    const uy = dy / dist;
    if (dist < KITE_DISTANCE - KITE_BAND) {
      // Too close: back away from the enemy.
      moveX = -ux;
      moveY = -uy;
    } else if (dist > KITE_DISTANCE + KITE_BAND) {
      // Too far: close the gap.
      moveX = ux;
      moveY = uy;
    } else {
      // In the comfort band: strafe perpendicular to the enemy line, biased
      // toward room center so the bot keeps clear of walls. Perpendicular of
      // (ux,uy) is (-uy,ux); we pick the sign that points toward center.
      const cx = state.grid.width / 2 - player.pos.x;
      const cy = state.grid.height / 2 - player.pos.y;
      const sign = -uy * cx + ux * cy >= 0 ? 1 : -1;
      moveX = -uy * sign;
      moveY = ux * sign;
    }
  }

  // Keep clear of the walls: if a move would push the bot past the interior
  // margin, cancel that axis (deterministic, no randomness).
  const minX = WALL_MARGIN;
  const maxX = state.grid.width - WALL_MARGIN;
  const minY = WALL_MARGIN;
  const maxY = state.grid.height - WALL_MARGIN;
  if (player.pos.x <= minX && moveX < 0) moveX = -moveX;
  if (player.pos.x >= maxX && moveX > 0) moveX = -moveX;
  if (player.pos.y <= minY && moveY < 0) moveY = -moveY;
  if (player.pos.y >= maxY && moveY > 0) moveY = -moveY;

  return { moveX, moveY, aimX, aimY };
}

export interface EncounterOptions {
  /** Number of enemies forced into the start room. */
  enemyCount: number;
  /** Optional item id to grant the player before the fight (e.g. 'sharp-tears'). */
  applyItemId?: string;
  /**
   * Optional list of item ids to grant before the fight, applied in order.
   * Use this to model stacking (e.g. two 'sharp-tears' to cross a damage
   * breakpoint). Applied after `applyItemId` if both are given.
   */
  applyItemIds?: readonly string[];
  /** Hard cap on simulated ticks, so a stuck fight still terminates. */
  maxTicks: number;
}

export interface EncounterMetrics {
  /** True if every enemy was killed before the player died or time ran out. */
  cleared: boolean;
  /** Ticks elapsed (FIXED_DT each) until the encounter ended. */
  ticks: number;
  /** Player HP lost over the encounter (starting maxHp minus final hp). */
  hpLost: number;
}

/**
 * Plays a single locked-room encounter headlessly with the kiting bot.
 * Deterministic: same `(seed, options)` always returns identical metrics.
 */
export function simulateEncounter(seed: number, opts: EncounterOptions): EncounterMetrics {
  const state = createGame(seed, { enemyCount: opts.enemyCount });
  const grants: string[] = [];
  if (opts.applyItemId) grants.push(opts.applyItemId);
  if (opts.applyItemIds) grants.push(...opts.applyItemIds);
  for (const id of grants) {
    const item = getItem(id);
    if (item) applyItem(state.player, item);
  }
  const startHp = state.player.hp;

  let ticks = 0;
  while (ticks < opts.maxTicks && state.status === 'playing' && state.enemies.length > 0) {
    tick(state, botPolicy(state), FIXED_DT);
    ticks++;
  }

  const cleared = state.enemies.length === 0 && state.status !== 'dead';
  return {
    cleared,
    ticks,
    hpLost: startHp - state.player.hp,
  };
}

export interface AggregateMetrics {
  /** Fraction of seeds where the room was cleared. */
  clearedRatio: number;
  /** Mean ticks-to-resolution across all seeds. */
  avgTicks: number;
  /** Mean player HP lost across all seeds. */
  avgHpLost: number;
}

/**
 * Runs `simulateEncounter` over a fixed seed set and averages the metrics.
 * Reporting the seed list alongside results makes any claim replayable.
 */
export function aggregateRuns(seeds: readonly number[], opts: EncounterOptions): AggregateMetrics {
  if (seeds.length === 0) {
    return { clearedRatio: 0, avgTicks: 0, avgHpLost: 0 };
  }
  let cleared = 0;
  let totalTicks = 0;
  let totalHpLost = 0;
  for (const seed of seeds) {
    const m = simulateEncounter(seed, opts);
    if (m.cleared) cleared++;
    totalTicks += m.ticks;
    totalHpLost += m.hpLost;
  }
  const n = seeds.length;
  return {
    clearedRatio: cleared / n,
    avgTicks: totalTicks / n,
    avgHpLost: totalHpLost / n,
  };
}
