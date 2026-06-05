import { applyDamage, isDead } from './combat.js';
import { generateDungeon, DEFAULT_DUNGEON, type DungeonOptions } from './dungeon.js';
import { makeEnemy, makeProjectile, type Enemy, type Projectile } from './entities.js';
import { aabbHitsWall, circlesOverlap, moveBody } from './physics.js';
import { Rng } from './rng.js';
import { isWall, makeRoomGrid, type RoomGrid } from './room.js';
import type { Combatant, Dungeon, RoomId, Vec2 } from './types.js';

/** Fixed simulation timestep, in seconds. The render layer steps in multiples of this. */
export const FIXED_DT = 1 / 60;
/** Player movement speed, in tiles per second. */
export const PLAYER_SPEED = 6;
/** Player collision box half-extent, in tiles. */
export const PLAYER_RADIUS = 0.4;

/** Projectile speed, in tiles per second. */
export const PROJECTILE_SPEED = 12;
/** Projectile lifetime, in seconds. */
export const PROJECTILE_LIFE = 1.2;
/** Damage dealt by a player projectile (will become item-driven later). */
export const PLAYER_TEAR_DAMAGE = 3;
/** Player shots per second. */
export const PLAYER_FIRE_RATE = 3;
/** Player invulnerability window after taking contact damage, in seconds. */
export const PLAYER_IFRAMES = 0.8;

/** Default number of enemies spawned into the starting room. */
export const DEFAULT_ENEMY_COUNT = 4;

export interface Player extends Combatant {
  pos: Vec2;
  vel: Vec2;
  radius: number;
  /** Seconds until the player can fire again. */
  fireCooldown: number;
  /** Seconds of remaining invulnerability. */
  invuln: number;
}

/**
 * Per-tick player intent. `move*` drive movement, `aim*` drive shooting
 * (twin-stick). Each is in [-1, 1]; vectors are normalized. A zero aim vector
 * means "not firing".
 */
export interface InputState {
  moveX: number;
  moveY: number;
  aimX?: number;
  aimY?: number;
}

export const NO_INPUT: InputState = { moveX: 0, moveY: 0, aimX: 0, aimY: 0 };

/**
 * The complete, serializable simulation state. Everything the game IS lives
 * here — rendering reads from it and never owns gameplay state of its own.
 */
export interface GameState {
  seed: number;
  rng: Rng;
  dungeon: Dungeon;
  currentRoom: RoomId;
  grid: RoomGrid;
  player: Player;
  enemies: Enemy[];
  projectiles: Projectile[];
  /** Monotonic id source for spawned entities (deterministic). */
  nextEntityId: number;
}

export interface NewGameOptions {
  dungeon?: DungeonOptions;
  enemyCount?: number;
}

export function createGame(seed: number, opts: NewGameOptions = {}): GameState {
  const rng = new Rng(seed);
  const dungeon = generateDungeon(rng, opts.dungeon ?? DEFAULT_DUNGEON);
  const grid = makeRoomGrid();
  const player: Player = {
    pos: { x: grid.width / 2, y: grid.height / 2 },
    vel: { x: 0, y: 0 },
    radius: PLAYER_RADIUS,
    fireCooldown: 0,
    invuln: 0,
    hp: 6,
    maxHp: 6,
    attack: 3,
    defense: 0,
  };
  const state: GameState = {
    seed,
    rng,
    dungeon,
    currentRoom: dungeon.startRoom,
    grid,
    player,
    enemies: [],
    projectiles: [],
    nextEntityId: 1,
  };
  spawnEnemies(state, opts.enemyCount ?? DEFAULT_ENEMY_COUNT);
  return state;
}

/**
 * Spawns `count` enemies on open interior tiles, kept a minimum distance from
 * the player. Uses the seeded Rng, so spawns are reproducible.
 */
export function spawnEnemies(state: GameState, count: number): void {
  const { grid, rng, player } = state;
  const minDistFromPlayer = 3;
  let placed = 0;
  let attempts = 0;
  const maxAttempts = count * 50;
  while (placed < count && attempts < maxAttempts) {
    attempts++;
    const tx = rng.range(1, grid.width - 2);
    const ty = rng.range(1, grid.height - 2);
    if (isWall(grid, tx, ty)) continue;
    const pos: Vec2 = { x: tx + 0.5, y: ty + 0.5 };
    if (Math.hypot(pos.x - player.pos.x, pos.y - player.pos.y) < minDistFromPlayer) continue;
    state.enemies.push(makeEnemy(state.nextEntityId++, pos));
    placed++;
  }
}

/**
 * Advances the simulation by one fixed step. Deterministic: same state + input
 * + dt always yields the same next state. No randomness is consumed here.
 */
export function tick(state: GameState, input: InputState, dt: number): void {
  stepPlayerMovement(state, input, dt);
  stepFiring(state, input, dt);
  stepEnemies(state, dt);
  stepProjectiles(state, dt);
  stepContactDamage(state, dt);
}

function stepPlayerMovement(state: GameState, input: InputState, dt: number): void {
  const { player } = state;
  const len = Math.hypot(input.moveX, input.moveY);
  if (len > 0) {
    player.vel = { x: (input.moveX / len) * PLAYER_SPEED, y: (input.moveY / len) * PLAYER_SPEED };
  } else {
    player.vel = { x: 0, y: 0 };
  }
  player.pos = moveBody(state.grid, player.pos, player.radius, player.vel.x * dt, player.vel.y * dt);
}

function stepFiring(state: GameState, input: InputState, dt: number): void {
  const { player } = state;
  player.fireCooldown = Math.max(0, player.fireCooldown - dt);
  const ax = input.aimX ?? 0;
  const ay = input.aimY ?? 0;
  const len = Math.hypot(ax, ay);
  if (len > 0 && player.fireCooldown <= 0) {
    const vel: Vec2 = { x: (ax / len) * PROJECTILE_SPEED, y: (ay / len) * PROJECTILE_SPEED };
    state.projectiles.push(
      makeProjectile(state.nextEntityId++, player.pos, vel, PLAYER_TEAR_DAMAGE, PROJECTILE_LIFE, 'player'),
    );
    player.fireCooldown = 1 / PLAYER_FIRE_RATE;
  }
}

function stepEnemies(state: GameState, dt: number): void {
  const { player, grid } = state;
  for (const enemy of state.enemies) {
    const dx = player.pos.x - enemy.pos.x;
    const dy = player.pos.y - enemy.pos.y;
    const len = Math.hypot(dx, dy);
    enemy.vel = len > 0 ? { x: (dx / len) * enemy.speed, y: (dy / len) * enemy.speed } : { x: 0, y: 0 };
    enemy.pos = moveBody(grid, enemy.pos, enemy.radius, enemy.vel.x * dt, enemy.vel.y * dt);
  }
}

function stepProjectiles(state: GameState, dt: number): void {
  const { grid } = state;
  const survivors: Projectile[] = [];
  for (const p of state.projectiles) {
    p.life -= dt;
    p.pos = { x: p.pos.x + p.vel.x * dt, y: p.pos.y + p.vel.y * dt };
    if (p.life <= 0) continue;
    if (aabbHitsWall(grid, p.pos.x, p.pos.y, p.radius)) continue; // absorbed by wall

    if (p.source === 'player') {
      // Point-in-time hit test. Relies on per-tick travel (speed * dt) staying
      // below enemyRadius + projectileRadius so a tear can't tunnel past an
      // enemy between ticks. Revisit with a swept test if speeds increase a lot.
      let hit = false;
      for (const enemy of state.enemies) {
        if (isDead(enemy)) continue;
        if (circlesOverlap(p.pos, p.radius, enemy.pos, enemy.radius)) {
          applyDamage(enemy, p.damage);
          hit = true;
          break;
        }
      }
      if (hit) continue; // projectile consumed
    }
    survivors.push(p);
  }
  state.projectiles = survivors;
  state.enemies = state.enemies.filter((e) => !isDead(e));
}

function stepContactDamage(state: GameState, dt: number): void {
  const { player } = state;
  player.invuln = Math.max(0, player.invuln - dt);
  if (player.invuln > 0) return;
  for (const enemy of state.enemies) {
    if (circlesOverlap(player.pos, player.radius, enemy.pos, enemy.radius)) {
      applyDamage(player, enemy.touchDamage);
      player.invuln = PLAYER_IFRAMES;
      break;
    }
  }
}
