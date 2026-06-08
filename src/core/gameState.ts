import { applyDamage, isDead } from './combat.js';
import {
  computeDoors,
  generateDungeon,
  DEFAULT_DUNGEON,
  type DungeonOptions,
} from './dungeon.js';
import {
  makeEnemy,
  makePickup,
  makeProjectile,
  type Enemy,
  type Pickup,
  type Projectile,
} from './entities.js';
import { applyItem, getItem, ITEM_POOL } from './items.js';
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
/** Base projectile damage; item modifiers add on top (see Player.tearDamage). */
export const PLAYER_TEAR_DAMAGE = 3;
/** Player shots per second. */
export const PLAYER_FIRE_RATE = 3;
/** Player invulnerability window after taking contact damage, in seconds. */
export const PLAYER_IFRAMES = 0.8;

/** Distance from a door's opening at which the player transitions through it. */
export const DOOR_TRIGGER = 0.7;

/** Where the boss spawns (top-center) and where the player enters (bottom-center). */
export const BOSS_SPAWN: Vec2 = { x: ROOM_W / 2, y: 2.5 };
export const BOSS_ROOM_ENTRY: Vec2 = { x: ROOM_W / 2, y: ROOM_H - 1.5 };

/** The victory teleporter that appears (where the boss stood) once it is defeated. */
export const TELEPORTER_POS: Vec2 = { x: ROOM_W / 2, y: 2.5 };
export const TELEPORTER_RADIUS = 0.5;

/** Lifecycle of a single run. The simulation only advances while 'playing'. */
export type RunStatus = 'playing' | 'dead' | 'won';

export interface Player extends Combatant {
  pos: Vec2;
  vel: Vec2;
  radius: number;
  /** Movement speed in tiles/second (base + item modifiers). */
  speed: number;
  /** Projectile damage (base + item modifiers). */
  tearDamage: number;
  /** Shots per second (base + item modifiers). */
  fireRate: number;
  /** Ids of items the player has collected. */
  items: string[];
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
  pickups: Pickup[];
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
  /** Item pickups in the current room (aliases the current room's runtime array). */
  pickups: Pickup[];
  roomRuntimes: Map<RoomId, RoomRuntime>;
  doors: Door[];
  /** Whether the current room's doors are open (true when no enemies remain). */
  doorsOpen: boolean;
  /** Run lifecycle: 'playing', or terminal 'dead' / 'won'. */
  status: RunStatus;
  /** Set once the boss is defeated; the victory teleporter then exists in the boss room. */
  bossDefeated: boolean;
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
    speed: PLAYER_SPEED,
    tearDamage: PLAYER_TEAR_DAMAGE,
    fireRate: PLAYER_FIRE_RATE,
    items: [],
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
    pickups: [],
    roomRuntimes: new Map(),
    doors: [],
    doorsOpen: true,
    status: 'playing',
    bossDefeated: false,
    nextEntityId: 1,
  };
  for (const id of dungeon.rooms.keys()) {
    state.roomRuntimes.set(id, { enemies: [], pickups: [], spawned: false });
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
      makeEnemy(state.nextEntityId++, BOSS_SPAWN, {
        hp: 30,
        radius: 0.7,
        speed: 1.8,
        touchDamage: 2,
      }),
    );
    return;
  }

  const center: Vec2 = { x: ROOM_W / 2, y: ROOM_H / 2 };

  // A treasure room offers one item to collect, chosen deterministically.
  if (forcedCount === undefined && room.type === 'treasure' && ITEM_POOL.length > 0) {
    const itemId = rng.pick(ITEM_POOL);
    rt.pickups.push(makePickup(state.nextEntityId++, center, itemId));
  }

  let count: number;
  if (forcedCount !== undefined) count = forcedCount;
  else if (room.type === 'normal') count = rng.range(2, 4);
  else count = 0; // start, treasure, shop

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
  if (!rt) throw new Error(`enterRoom: no runtime for room ${roomId}`);
  state.currentRoom = roomId;
  // Alias the runtime arrays directly so in-place edits (splice) stay in sync.
  state.enemies = rt.enemies;
  state.pickups = rt.pickups;
  state.projectiles = [];
  state.doors = computeDoors(state.dungeon, roomId);
  state.grid = makeRoomGrid();
  state.doorsOpen = state.enemies.length === 0;
  if (state.doorsOpen) {
    for (const d of state.doors) carveDoor(state.grid, d.dir);
  }
  state.player.vel = { x: 0, y: 0 };
  if (roomId === state.dungeon.bossRoom) {
    // Always enter the boss arena far from the boss, whatever door was used,
    // so the player isn't hit the instant they arrive.
    state.player.pos = { x: BOSS_ROOM_ENTRY.x, y: BOSS_ROOM_ENTRY.y };
  } else {
    state.player.pos = fromDir
      ? entryPosition(state.grid, opposite(fromDir))
      : { x: state.grid.width / 2, y: state.grid.height / 2 };
  }
}

/**
 * Advances the simulation by one fixed step. Deterministic: same state + input
 * + dt always yields the same next state. No randomness is consumed here.
 */
export function tick(state: GameState, input: InputState, dt: number): void {
  if (state.status !== 'playing') return; // the run is over; freeze the world
  stepPlayerMovement(state, input, dt);
  stepPickups(state);
  stepFiring(state, input, dt);
  stepEnemies(state, dt);
  stepProjectiles(state, dt);
  stepContactDamage(state, dt);
  // Death is resolved BEFORE the boss-clear win, so a same-tick death takes
  // precedence: you can't win from the grave. Keep this order.
  if (isDead(state.player)) {
    state.status = 'dead';
    return;
  }
  stepRoomClear(state); // opens doors; flags bossDefeated in the boss room
  stepTeleporter(state); // win by reaching the teleporter after the boss falls
  if (state.status !== 'playing') return;
  stepDoors(state);
}

function stepPlayerMovement(state: GameState, input: InputState, dt: number): void {
  const { player } = state;
  const len = Math.hypot(input.moveX, input.moveY);
  if (len > 0) {
    player.vel = { x: (input.moveX / len) * player.speed, y: (input.moveY / len) * player.speed };
  } else {
    player.vel = { x: 0, y: 0 };
  }
  player.pos = moveBody(state.grid, player.pos, player.radius, player.vel.x * dt, player.vel.y * dt);
}

/** Collects any pickup the player is touching, applying its item immediately. */
function stepPickups(state: GameState): void {
  const { player } = state;
  for (let i = state.pickups.length - 1; i >= 0; i--) {
    const pickup = state.pickups[i]!;
    if (circlesOverlap(player.pos, player.radius, pickup.pos, pickup.radius)) {
      const item = getItem(pickup.itemId);
      if (item) applyItem(player, item);
      state.pickups.splice(i, 1);
    }
  }
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
      makeProjectile(state.nextEntityId++, player.pos, vel, player.tearDamage, PROJECTILE_LIFE, 'player'),
    );
    player.fireCooldown = 1 / player.fireRate;
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
  // Beating the boss no longer wins instantly: it drops a teleporter and leaves
  // the floor open so the player can backtrack before choosing to finish.
  if (state.currentRoom === state.dungeon.bossRoom) state.bossDefeated = true;
}

/** Once the boss is defeated, stepping on the teleporter (in the boss room) wins. */
function stepTeleporter(state: GameState): void {
  if (!state.bossDefeated || state.currentRoom !== state.dungeon.bossRoom) return;
  if (circlesOverlap(state.player.pos, state.player.radius, TELEPORTER_POS, TELEPORTER_RADIUS)) {
    state.status = 'won';
  }
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
