import { applyDamage, isDead } from './combat.js';
import {
  computeDoors,
  generateDungeon,
  DEFAULT_DUNGEON,
  type DungeonOptions,
} from './dungeon.js';
import { makeEnemy, makeProjectile, type Enemy, type Projectile } from './entities.js';
import { aabbHitsWall, circlesOverlap, moveBody } from './physics.js';
import { Rng } from './rng.js';
import {
  carveDoor,
  doorWorldPos,
  entryPosition,
  makeRoomGrid,
  opposite,
  ROOM_H,
  ROOM_W,
  type RoomGrid,
} from './room.js';
import type { Combatant, Direction, Door, Dungeon, RoomId, Vec2 } from './types.js';

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

/** Distance from a door's opening at which the player transitions through it. */
export const DOOR_TRIGGER = 0.7;

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

/** Cached, lazily-populated runtime state for a single room. */
export interface RoomRuntime {
  enemies: Enemy[];
  spawned: boolean;
}

/**
 * The complete, serializable simulation state. Everything the game IS lives
 * here — rendering reads from it and never owns gameplay state of its own.
 *
 * `enemies` and `projectiles` always refer to the CURRENT room. Enemies are
 * persisted per-room in `roomRuntimes`; `enemies` aliases the current room's
 * array (dead enemies are removed in place to keep that alias valid).
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
  roomRuntimes: Map<RoomId, RoomRuntime>;
  doors: Door[];
  /** Whether the current room's doors are open (true when no enemies remain). */
  doorsOpen: boolean;
  /** Monotonic id source for spawned entities (deterministic). */
  nextEntityId: number;
}

export interface NewGameOptions {
  dungeon?: DungeonOptions;
  /** Force this many enemies into the START room (default 0 — start is safe). */
  enemyCount?: number;
}

/** Deterministic per-room seed so a room's contents are fixed regardless of path. */
function roomSeed(seed: number, roomId: RoomId): number {
  let h = Math.imul(seed ^ 0x9e3779b9, 2654435761);
  h = Math.imul(h ^ roomId, 2246822519);
  h ^= h >>> 13;
  return h >>> 0;
}

export function createGame(seed: number, opts: NewGameOptions = {}): GameState {
  const rng = new Rng(seed);
  const dungeon = generateDungeon(rng, opts.dungeon ?? DEFAULT_DUNGEON);
  const player: Player = {
    pos: { x: ROOM_W / 2, y: ROOM_H / 2 },
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
    grid: makeRoomGrid(),
    player,
    enemies: [],
    projectiles: [],
    roomRuntimes: new Map(),
    doors: [],
    doorsOpen: true,
    nextEntityId: 1,
  };
  for (const id of dungeon.rooms.keys()) {
    state.roomRuntimes.set(id, { enemies: [], spawned: false });
  }
  // The start room is populated up front (optionally forced, for tests).
  populateRoom(state, dungeon.startRoom, opts.enemyCount ?? 0);
  enterRoom(state, dungeon.startRoom);
  return state;
}

/**
 * Generates a room's enemies the first time it is entered. Deterministic via a
 * per-room seed. `forcedCount`, when given, overrides the type-based count
 * (used for the start room / tests).
 */
export function populateRoom(state: GameState, roomId: RoomId, forcedCount?: number): void {
  const rt = state.roomRuntimes.get(roomId);
  if (!rt || rt.spawned) return;
  rt.spawned = true;

  const room = state.dungeon.rooms.get(roomId);
  if (!room) return;
  const rng = new Rng(roomSeed(state.seed, roomId));

  if (forcedCount === undefined && room.type === 'boss') {
    rt.enemies.push(
      makeEnemy(state.nextEntityId++, { x: ROOM_W / 2, y: 2.5 }, {
        hp: 30,
        radius: 0.7,
        speed: 1.8,
        touchDamage: 2,
      }),
    );
    return;
  }

  let count: number;
  if (forcedCount !== undefined) count = forcedCount;
  else if (room.type === 'normal') count = rng.range(2, 4);
  else count = 0; // start, treasure, shop

  const center: Vec2 = { x: ROOM_W / 2, y: ROOM_H / 2 };
  let placed = 0;
  let attempts = 0;
  const maxAttempts = count * 50;
  while (placed < count && attempts < maxAttempts) {
    attempts++;
    const tx = rng.range(1, ROOM_W - 2);
    const ty = rng.range(1, ROOM_H - 2);
    const pos: Vec2 = { x: tx + 0.5, y: ty + 0.5 };
    if (Math.hypot(pos.x - center.x, pos.y - center.y) < 3) continue;
    rt.enemies.push(makeEnemy(state.nextEntityId++, pos));
    placed++;
  }
}

/**
 * Makes `roomId` the current room: lazily populates it, points `enemies` at its
 * runtime array, clears projectiles, computes doors, rebuilds the grid (carving
 * doors only if the room is already clear), and positions the player.
 */
export function enterRoom(state: GameState, roomId: RoomId, fromDir?: Direction): void {
  populateRoom(state, roomId);
  const rt = state.roomRuntimes.get(roomId);
  state.currentRoom = roomId;
  state.enemies = rt ? rt.enemies : [];
  state.projectiles = [];
  state.doors = computeDoors(state.dungeon, roomId);
  state.grid = makeRoomGrid();
  state.doorsOpen = state.enemies.length === 0;
  if (state.doorsOpen) {
    for (const d of state.doors) carveDoor(state.grid, d.dir);
  }
  state.player.vel = { x: 0, y: 0 };
  state.player.pos = fromDir
    ? entryPosition(state.grid, opposite(fromDir))
    : { x: state.grid.width / 2, y: state.grid.height / 2 };
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
  stepRoomClear(state);
  stepDoors(state);
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
  // Remove dead enemies in place so `state.enemies` keeps aliasing the runtime array.
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    if (isDead(state.enemies[i]!)) state.enemies.splice(i, 1);
  }
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

/** When a locked room runs out of enemies, mark it cleared and open the doors. */
function stepRoomClear(state: GameState): void {
  if (state.doorsOpen || state.enemies.length > 0) return;
  state.doorsOpen = true;
  for (const d of state.doors) carveDoor(state.grid, d.dir);
  const room = state.dungeon.rooms.get(state.currentRoom);
  if (room) room.cleared = true;
}

/** Transition to a neighbor when the player reaches an open door. */
function stepDoors(state: GameState): void {
  if (!state.doorsOpen) return;
  for (const d of state.doors) {
    const o = doorWorldPos(state.grid, d.dir);
    if (Math.hypot(state.player.pos.x - o.x, state.player.pos.y - o.y) < DOOR_TRIGGER) {
      enterRoom(state, d.to, d.dir);
      return;
    }
  }
}
