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

import {
  createGame,
  tick,
  ENEMY_FIRE_INTERVAL,
  ENEMY_HP_PER_FLOOR,
  FIXED_DT,
  type GameState,
  type InputState,
} from './gameState.js';
import { applyItem, getItem } from './items.js';
import { ENEMY_ARCHETYPES, makeEnemy, type Enemy, type EnemyKind } from './entities.js';
import { Rng } from './rng.js';
import { ROOM_W, ROOM_H } from './room.js';
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

  // Hold a standoff the tears can actually reach: never beyond (tearRange − 0.5),
  // so a short range makes the bot fight closer instead of whiffing from afar.
  const standoff = Math.min(KITE_DISTANCE, Math.max(1, player.tearRange - 0.5));

  let moveX = 0;
  let moveY = 0;
  if (dist > 0) {
    const ux = dx / dist;
    const uy = dy / dist;
    if (dist < standoff - KITE_BAND) {
      // Too close: back away from the enemy.
      moveX = -ux;
      moveY = -uy;
    } else if (dist > standoff + KITE_BAND) {
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
  /**
   * Number of enemies forced into the start room. Ignored when `enemyKinds` is
   * given (the composition then determines the count).
   */
  enemyCount: number;
  /**
   * Optional explicit enemy composition. When set, the start room is populated
   * with exactly these archetypes (in order), instead of the default
   * floor-1 random chaser/swarmer mix. Lets a balance question target a
   * specific threat profile (e.g. all shooters, or a tank wall).
   */
  enemyKinds?: readonly EnemyKind[];
  /**
   * Floor number used only for per-floor HP scaling of an explicit
   * `enemyKinds` composition (+`ENEMY_HP_PER_FLOOR` HP per floor above 1).
   * Defaults to 1. Has no effect without `enemyKinds`.
   */
  floor?: number;
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
 * Replaces the current room's enemies with an explicit `kinds` composition,
 * scaled to `floor`. Placement is deterministic (seeded by the encounter seed)
 * and uses the same wall-clearance + center-exclusion rules as the real
 * `populateRoom`, so positions are plausible in-game and reproducible.
 *
 * Pure: the only randomness is a fresh seeded `Rng`; no `Math.random`.
 */
function composeEnemies(
  state: GameState,
  seed: number,
  kinds: readonly EnemyKind[],
  floor: number,
): void {
  const rng = new Rng((seed ^ 0x5bd1e995) >>> 0);
  const tier = Math.max(0, floor - 1);
  const center: Vec2 = { x: ROOM_W / 2, y: ROOM_H / 2 };
  const enemies: Enemy[] = [];
  for (const kind of kinds) {
    const r = ENEMY_ARCHETYPES[kind].radius;
    // Find a spot away from the player's center spawn, fully inside the walls.
    let pos: Vec2 = center;
    for (let attempt = 0; attempt < 50; attempt++) {
      const tx = rng.range(1, ROOM_W - 2);
      const ty = rng.range(1, ROOM_H - 2);
      const cand: Vec2 = { x: tx + 0.5, y: ty + 0.5 };
      if (Math.hypot(cand.x - center.x, cand.y - center.y) < 3) continue;
      pos = {
        x: Math.min(Math.max(cand.x, 1 + r), ROOM_W - 1 - r),
        y: Math.min(Math.max(cand.y, 1 + r), ROOM_H - 1 - r),
      };
      break;
    }
    const hp = ENEMY_ARCHETYPES[kind].hp + tier * ENEMY_HP_PER_FLOOR;
    const enemy = makeEnemy(state.nextEntityId++, pos, { kind, hp });
    // Match populateRoom: stagger shooter cooldowns so they don't all fire in sync.
    if (kind === 'shooter') enemy.fireCooldown = rng.next() * ENEMY_FIRE_INTERVAL;
    enemies.push(enemy);
  }
  // Splice in place so the GameState.enemies alias to the room runtime stays valid.
  state.enemies.splice(0, state.enemies.length, ...enemies);
  state.doorsOpen = state.enemies.length === 0;
}

/**
 * Plays a single locked-room encounter headlessly with the kiting bot.
 * Deterministic: same `(seed, options)` always returns identical metrics.
 */
export function simulateEncounter(seed: number, opts: EncounterOptions): EncounterMetrics {
  // When an explicit composition is requested we still want a populated start
  // room to alias into, so spawn one chaser then replace the lot.
  const startCount = opts.enemyKinds ? 1 : opts.enemyCount;
  const state = createGame(seed, { enemyCount: startCount });
  if (opts.enemyKinds) {
    composeEnemies(state, seed, opts.enemyKinds, opts.floor ?? 1);
  }
  const grants: string[] = [];
  if (opts.applyItemId) grants.push(opts.applyItemId);
  if (opts.applyItemIds) grants.push(...opts.applyItemIds);
  for (const id of grants) {
    const item = getItem(id);
    if (item) applyItem(state.player, item);
  }
  // Measure steady-state combat, not the entry grace window.
  state.graceTimer = 0;
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
