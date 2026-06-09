import { applyDamage, heal, isDead } from './combat.js';
import {
  computeDoors,
  generateDungeon,
  DEFAULT_DUNGEON,
  type DungeonOptions,
} from './dungeon.js';
import {
  ENEMY_ARCHETYPES,
  makeCoin,
  makeEnemy,
  makeHeart,
  makePickup,
  makeProjectile,
  type Enemy,
  type EnemyKind,
  type Pickup,
  type Projectile,
  type StatusSpec,
} from './entities.js';
import { applyItem, getItem, ITEM_POOL } from './items.js';
import { applyStatuses, slowFactor } from './status.js';
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
/** Player collision box half-extent, in tiles. Slightly under 0.5 for door clearance. */
export const PLAYER_RADIUS = 0.35;

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

/** Seconds after entering a room before enemies start moving/attacking. */
export const GRACE_PERIOD = 0.5;

/** Recoil impulse (tiles/s) applied to an enemy hit by a player tear, and its decay rate (/s). */
export const KNOCKBACK_SPEED = 12;
const KNOCKBACK_FRICTION = 14;

/** Where the boss spawns (top-center) and where the player enters (bottom-center). */
export const BOSS_SPAWN: Vec2 = { x: ROOM_W / 2, y: 2.5 };
export const BOSS_ROOM_ENTRY: Vec2 = { x: ROOM_W / 2, y: ROOM_H - 1.5 };

/** The victory teleporter that appears (where the boss stood) once it is defeated. */
export const TELEPORTER_POS: Vec2 = { x: ROOM_W / 2, y: 2.5 };
export const TELEPORTER_RADIUS = 0.5;

/** Number of floors to clear; reaching the teleporter on the last one wins. */
export const MAX_FLOORS = 3;

/** Difficulty scaling per floor (floor 1 = base values). */
export const ENEMY_HP_PER_FLOOR = 2;
const ENEMIES_PER_FLOOR = 1;
const BOSS_HP_BASE = 30;
const BOSS_HP_PER_FLOOR = 15;

/** Chance that clearing a combat room drops a healing heart, and how much it heals. */
export const HEART_DROP_CHANCE = 0.3;
export const HEART_HEAL = 1;

/** Coins: combat rooms drop 1..COIN_DROP_MAX coins; the shop sells with these. */
export const COIN_DROP_MAX = 3;

/** Shooter-enemy projectile tuning. */
export const ENEMY_SHOT_SPEED = 7;
export const ENEMY_SHOT_DAMAGE = 1;
export const ENEMY_SHOT_LIFE = 2.5;
export const ENEMY_FIRE_INTERVAL = 1.6;
/** Distance a shooter tries to hold from the player, and the range within which it fires. */
const SHOOTER_RANGE = 5;
const SHOOTER_FIRE_RANGE = 8;

/** Boss attack tuning. Interval shortens as phases escalate (see stepBoss). */
const BOSS_SHOT_SPEED = 6;
const BOSS_SHOT_DAMAGE = 1;
const BOSS_SHOT_LIFE = 3;

/** Synergy: an enemy that is both burning and slowed takes extra burn damage. */
export const BURN_SLOW_SYNERGY = 1.5;

/** Angle (radians) between adjacent tears when multishot is active. */
export const MULTISHOT_SPREAD = 0.26;
/** Max turn rate (radians/second) of a homing tear. */
export const HOMING_TURN_RATE = 7;

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
  /** Statuses the player's tears apply on hit (from items). */
  tearEffects: StatusSpec[];
  /** Number of tears fired per shot (multishot). */
  shotCount: number;
  /** Tears pass through enemies instead of being consumed on first hit. */
  piercing: boolean;
  /** Tears curve toward the nearest enemy. */
  homing: boolean;
  /** Currency for the shop. */
  coins: number;
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
  /** Seconds of remaining entry grace (enemies frozen, no contact damage). */
  graceTimer: number;
  /** Current floor number, starting at 1. */
  floor: number;
  /** Dungeon options, reused to generate each new floor. */
  dungeonOpts: DungeonOptions;
  /** Monotonic id source for spawned entities (deterministic). */
  nextEntityId: number;
}

export interface NewGameOptions {
  dungeon?: DungeonOptions;
  /** Force this many enemies into the START room (default 0 — start is safe). */
  enemyCount?: number;
}

/** Deterministic seed for a floor's dungeon layout. */
function floorSeed(seed: number, floor: number): number {
  let h = Math.imul(seed ^ 0x85ebca6b, 2654435761);
  h = Math.imul(h ^ floor, 2246822519);
  h ^= h >>> 13;
  return h >>> 0;
}

/** Deterministic seed for a room's reward roll (independent of the spawn seed). */
function rewardSeed(seed: number, floor: number, roomId: RoomId): number {
  let h = Math.imul(seed ^ 0xc2b2ae35, 2654435761);
  h = Math.imul(h ^ floor, 2246822519);
  h = Math.imul(h ^ roomId, 3266489917);
  h ^= h >>> 13;
  return h >>> 0;
}

/** Deterministic per-room seed so a room's contents are fixed regardless of path. */
function roomSeed(seed: number, floor: number, roomId: RoomId): number {
  let h = Math.imul(seed ^ 0x9e3779b9, 2654435761);
  h = Math.imul(h ^ floor, 2246822519);
  h = Math.imul(h ^ roomId, 3266489917);
  h ^= h >>> 13;
  return h >>> 0;
}

export function createGame(seed: number, opts: NewGameOptions = {}): GameState {
  const player: Player = {
    pos: { x: ROOM_W / 2, y: ROOM_H / 2 },
    vel: { x: 0, y: 0 },
    radius: PLAYER_RADIUS,
    speed: PLAYER_SPEED,
    tearDamage: PLAYER_TEAR_DAMAGE,
    fireRate: PLAYER_FIRE_RATE,
    items: [],
    tearEffects: [],
    shotCount: 1,
    piercing: false,
    homing: false,
    coins: 0,
    fireCooldown: 0,
    invuln: 0,
    hp: 6,
    maxHp: 6,
    attack: 3,
    defense: 0,
  };
  const state: GameState = {
    seed,
    rng: new Rng(seed),
    dungeon: generateDungeon(new Rng(floorSeed(seed, 1)), opts.dungeon ?? DEFAULT_DUNGEON),
    currentRoom: 0,
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
    graceTimer: 0,
    floor: 1,
    dungeonOpts: opts.dungeon ?? DEFAULT_DUNGEON,
    nextEntityId: 1,
  };
  // Floor 1 keeps the start-room enemy override (used by tests); later floors are safe.
  buildFloor(state, 1, opts.enemyCount ?? 0);
  return state;
}

/**
 * Generates floor `floor`: a fresh dungeon, empty room runtimes, then enters the
 * start room. The player (HP, items, stats) is preserved across floors.
 */
function buildFloor(state: GameState, floor: number, startEnemies: number): void {
  state.floor = floor;
  state.dungeon = generateDungeon(new Rng(floorSeed(state.seed, floor)), state.dungeonOpts);
  state.roomRuntimes = new Map();
  for (const id of state.dungeon.rooms.keys()) {
    state.roomRuntimes.set(id, { enemies: [], pickups: [], spawned: false });
  }
  state.bossDefeated = false;
  state.projectiles = [];
  populateRoom(state, state.dungeon.startRoom, startEnemies);
  enterRoom(state, state.dungeon.startRoom);
}

/** Descends to the next floor, carrying the player's progression along. */
export function descendToNextFloor(state: GameState): void {
  buildFloor(state, state.floor + 1, 0);
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
  const rng = new Rng(roomSeed(state.seed, state.floor, roomId));
  const tier = state.floor - 1; // 0 on floor 1

  if (forcedCount === undefined && room.type === 'boss') {
    rt.enemies.push(
      makeEnemy(state.nextEntityId++, BOSS_SPAWN, {
        kind: 'boss',
        hp: BOSS_HP_BASE + tier * BOSS_HP_PER_FLOOR,
      }),
    );
    return;
  }

  const center: Vec2 = { x: ROOM_W / 2, y: ROOM_H / 2 };

  // A treasure room offers one item to collect for free, chosen deterministically.
  if (forcedCount === undefined && room.type === 'treasure' && ITEM_POOL.length > 0) {
    const itemId = rng.pick(ITEM_POOL);
    rt.pickups.push(makePickup(state.nextEntityId++, center, itemId));
  }

  // A shop offers priced stock: two items and a heart, spread across the room.
  // Kept off the vertical center so the (no-door) center spawn never lands on stock.
  if (forcedCount === undefined && room.type === 'shop' && ITEM_POOL.length > 0) {
    const stock = rng.shuffle(ITEM_POOL).slice(0, 2);
    const slots = [4, ROOM_W / 2, ROOM_W - 4];
    const shopY = center.y - 1.5;
    stock.forEach((itemId, i) => {
      const cost = rng.range(10, 16);
      rt.pickups.push(makePickup(state.nextEntityId++, { x: slots[i]!, y: shopY }, itemId, cost));
    });
    rt.pickups.push(
      makeHeart(state.nextEntityId++, { x: slots[2]!, y: shopY }, HEART_HEAL, rng.range(4, 6)),
    );
  }

  let count: number;
  if (forcedCount !== undefined) count = forcedCount;
  else if (room.type === 'normal') count = rng.range(2, 4) + tier * ENEMIES_PER_FLOOR;
  else count = 0; // start, treasure, shop

  // Available archetypes grow with the floor, so deeper floors feel more varied.
  const kindPool: EnemyKind[] = ['chaser', 'swarmer'];
  if (state.floor >= 2) kindPool.push('shooter');
  if (state.floor >= 3) kindPool.push('tank');

  let placed = 0;
  let attempts = 0;
  const maxAttempts = count * 50;
  while (placed < count && attempts < maxAttempts) {
    attempts++;
    const tx = rng.range(1, ROOM_W - 2);
    const ty = rng.range(1, ROOM_H - 2);
    const pos: Vec2 = { x: tx + 0.5, y: ty + 0.5 };
    if (Math.hypot(pos.x - center.x, pos.y - center.y) < 3) continue;
    const kind = rng.pick(kindPool);
    const r = ENEMY_ARCHETYPES[kind].radius;
    // Keep the whole body inside the open interior (matters for the wide tank).
    const spawn: Vec2 = {
      x: Math.min(Math.max(pos.x, 1 + r), ROOM_W - 1 - r),
      y: Math.min(Math.max(pos.y, 1 + r), ROOM_H - 1 - r),
    };
    const hp = ENEMY_ARCHETYPES[kind].hp + tier * ENEMY_HP_PER_FLOOR;
    const enemy = makeEnemy(state.nextEntityId++, spawn, { kind, hp });
    // Stagger shooter cooldowns so they don't all fire on the same tick.
    if (kind === 'shooter') enemy.fireCooldown = rng.next() * ENEMY_FIRE_INTERVAL;
    rt.enemies.push(enemy);
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
  state.graceTimer = GRACE_PERIOD; // brief reprieve so the player isn't hit on arrival
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
  state.graceTimer = Math.max(0, state.graceTimer - dt);
  // During the entry grace window enemies hold still and deal no damage, so the
  // player isn't hit the instant they walk in. The player can still move/shoot.
  const enemiesActive = state.graceTimer <= 0;
  stepPlayerMovement(state, input, dt);
  stepPickups(state);
  stepFiring(state, input, dt);
  // Enemies always recoil from hits (knockback), but only chase/attack once grace ends.
  stepEnemies(state, dt, enemiesActive);
  stepProjectiles(state, dt);
  stepStatuses(state, dt);
  if (enemiesActive) stepContactDamage(state, dt);
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

/** Collects pickups the player is touching: items apply immediately, hearts heal. */
function stepPickups(state: GameState): void {
  const { player } = state;
  for (let i = state.pickups.length - 1; i >= 0; i--) {
    const pickup = state.pickups[i]!;
    if (!circlesOverlap(player.pos, player.radius, pickup.pos, pickup.radius)) continue;

    if (pickup.kind === 'coin') {
      player.coins += pickup.value;
      state.pickups.splice(i, 1);
    } else if (pickup.kind === 'heart') {
      if (player.hp >= player.maxHp) continue; // leave it on the ground when full
      if (player.coins < pickup.cost) continue; // can't afford (shop)
      player.coins -= pickup.cost;
      heal(player, pickup.heal);
      state.pickups.splice(i, 1);
    } else {
      if (player.coins < pickup.cost) continue; // can't afford (shop)
      const item = getItem(pickup.itemId);
      if (item) applyItem(player, item);
      player.coins -= pickup.cost;
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
    const base = Math.atan2(ay, ax);
    const n = Math.max(1, player.shotCount);
    for (let i = 0; i < n; i++) {
      const angle = base + (i - (n - 1) / 2) * MULTISHOT_SPREAD;
      const vel: Vec2 = { x: Math.cos(angle) * PROJECTILE_SPEED, y: Math.sin(angle) * PROJECTILE_SPEED };
      state.projectiles.push(
        makeProjectile(
          state.nextEntityId++,
          player.pos,
          vel,
          player.tearDamage,
          PROJECTILE_LIFE,
          'player',
          [...player.tearEffects],
          { piercing: player.piercing, homing: player.homing },
        ),
      );
    }
    player.fireCooldown = 1 / player.fireRate;
  }
}

function stepEnemies(state: GameState, dt: number, active: boolean): void {
  const { player, grid } = state;
  for (const enemy of state.enemies) {
    const dx = player.pos.x - enemy.pos.x;
    const dy = player.pos.y - enemy.pos.y;
    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist;
    const uy = dy / dist;
    const speed = enemy.speed * slowFactor(enemy); // status effects (slow) scale movement

    let vx = 0;
    let vy = 0;
    if (!active) {
      // During the entry grace the enemy holds still (AI/attacks suspended),
      // but it still recoils from any hits below.
    } else if (enemy.kind === 'shooter') {
      // Hold a standoff distance: retreat if too close, approach if too far.
      if (dist < SHOOTER_RANGE - 0.5) {
        vx = -ux * speed;
        vy = -uy * speed;
      } else if (dist > SHOOTER_RANGE + 0.5) {
        vx = ux * speed;
        vy = uy * speed;
      }
      enemy.fireCooldown = Math.max(0, enemy.fireCooldown - dt);
      if (enemy.fireCooldown <= 0 && dist < SHOOTER_FIRE_RANGE) {
        state.projectiles.push(
          makeProjectile(
            state.nextEntityId++,
            enemy.pos,
            { x: ux * ENEMY_SHOT_SPEED, y: uy * ENEMY_SHOT_SPEED },
            ENEMY_SHOT_DAMAGE,
            ENEMY_SHOT_LIFE,
            'enemy',
          ),
        );
        enemy.fireCooldown = ENEMY_FIRE_INTERVAL;
      }
    } else if (enemy.kind === 'boss') {
      // Slow advance toward the player; the threat is the bullet patterns.
      vx = ux * speed * 0.6;
      vy = uy * speed * 0.6;
      stepBossAttacks(state, enemy, ux, uy, dt);
    } else {
      // chaser / swarmer / tank: walk straight at the player.
      vx = ux * speed;
      vy = uy * speed;
    }

    enemy.vel = { x: vx, y: vy };
    // Apply movement plus any recoil, then let the recoil decay. Recoil works
    // even during grace, so shooting a freshly-entered enemy still shoves it.
    // NOTE: (aiVel + knockback) must stay under 1 tile/tick for moveBody's
    // single-tile collision assumption. Today ≈ (4.2 + 12)/60 ≈ 0.27 tile/tick;
    // re-check if KNOCKBACK_SPEED or enemy speeds are bumped substantially.
    const kb = enemy.knockback;
    enemy.pos = moveBody(grid, enemy.pos, enemy.radius, (vx + kb.x) * dt, (vy + kb.y) * dt);
    const decay = Math.max(0, 1 - KNOCKBACK_FRICTION * dt);
    enemy.knockback = { x: kb.x * decay, y: kb.y * decay };
  }
}

/**
 * Boss attack patterns, escalating in three phases as its HP drops:
 *  - >66% HP: slow 8-way radial bursts.
 *  - 33–66%: faster aimed 5-tear spread at the player.
 *  - <33%: rapid 12-way radial, offset to fill the gaps.
 * Deterministic: pattern is chosen from HP, timing from a per-boss cooldown.
 */
function stepBossAttacks(state: GameState, boss: Enemy, ux: number, uy: number, dt: number): void {
  boss.fireCooldown = Math.max(0, boss.fireCooldown - dt);
  if (boss.fireCooldown > 0) return;
  const ratio = boss.hp / boss.maxHp;
  if (ratio > 0.66) {
    spawnRadial(state, boss.pos, 8, 0);
    boss.fireCooldown = 1.8;
  } else if (ratio > 0.33) {
    spawnAimed(state, boss.pos, Math.atan2(uy, ux), 5, 0.28);
    boss.fireCooldown = 1.3;
  } else {
    spawnRadial(state, boss.pos, 12, Math.PI / 12);
    boss.fireCooldown = 0.9;
  }
}

/** Spawns `n` enemy projectiles evenly around a circle, rotated by `offset`. */
function spawnRadial(state: GameState, origin: Vec2, n: number, offset: number): void {
  for (let i = 0; i < n; i++) {
    const a = offset + (i / n) * Math.PI * 2;
    state.projectiles.push(
      makeProjectile(
        state.nextEntityId++,
        origin,
        { x: Math.cos(a) * BOSS_SHOT_SPEED, y: Math.sin(a) * BOSS_SHOT_SPEED },
        BOSS_SHOT_DAMAGE,
        BOSS_SHOT_LIFE,
        'enemy',
      ),
    );
  }
}

/** Spawns an `n`-tear spread centered on `aim` (radians), `spread` apart. */
function spawnAimed(
  state: GameState,
  origin: Vec2,
  aim: number,
  n: number,
  spread: number,
): void {
  for (let i = 0; i < n; i++) {
    const a = aim + (i - (n - 1) / 2) * spread;
    state.projectiles.push(
      makeProjectile(
        state.nextEntityId++,
        origin,
        { x: Math.cos(a) * BOSS_SHOT_SPEED, y: Math.sin(a) * BOSS_SHOT_SPEED },
        BOSS_SHOT_DAMAGE,
        BOSS_SHOT_LIFE,
        'enemy',
      ),
    );
  }
}

function stepProjectiles(state: GameState, dt: number): void {
  const { grid } = state;
  const survivors: Projectile[] = [];
  for (const p of state.projectiles) {
    p.life -= dt;
    if (p.homing && p.source === 'player') steerHoming(state, p, dt);
    p.pos = { x: p.pos.x + p.vel.x * dt, y: p.pos.y + p.vel.y * dt };
    if (p.life <= 0) continue;
    if (aabbHitsWall(grid, p.pos.x, p.pos.y, p.radius)) continue; // absorbed by wall

    if (p.source === 'player') {
      // Point-in-time hit test. Relies on per-tick travel (speed * dt) staying
      // below enemyRadius + projectileRadius so a tear can't tunnel past an
      // enemy between ticks. Revisit with a swept test if speeds increase a lot.
      let consumed = false;
      for (const enemy of state.enemies) {
        if (isDead(enemy)) continue;
        if (p.hits.includes(enemy.id)) continue; // already hit this one
        if (circlesOverlap(p.pos, p.radius, enemy.pos, enemy.radius)) {
          applyDamage(enemy, p.damage);
          applyStatuses(enemy, p.applies);
          applyKnockback(enemy, p.vel);
          p.hits.push(enemy.id);
          if (!p.piercing) {
            consumed = true;
            break;
          }
        }
      }
      if (consumed) continue; // non-piercing tear is spent on its first hit
    } else {
      // Enemy projectile: hit the player (negated but still consumed during i-frames).
      const player = state.player;
      if (circlesOverlap(p.pos, p.radius, player.pos, player.radius)) {
        if (player.invuln <= 0) {
          applyDamage(player, p.damage);
          player.invuln = PLAYER_IFRAMES;
        }
        continue; // projectile consumed
      }
    }
    survivors.push(p);
  }
  state.projectiles = survivors;
  reapDeadEnemies(state);
}

/** Shoves an enemy in the tear's travel direction. Heavy enemies (boss) resist. */
function applyKnockback(enemy: Enemy, tearVel: Vec2): void {
  const m = Math.hypot(tearVel.x, tearVel.y) || 1;
  const factor = enemy.kind === 'boss' ? 0.2 : 1;
  const k = KNOCKBACK_SPEED * factor;
  enemy.knockback = { x: (tearVel.x / m) * k, y: (tearVel.y / m) * k };
}

/** Steers a homing tear's velocity toward the nearest living enemy, preserving speed. */
function steerHoming(state: GameState, p: Projectile, dt: number): void {
  let target: Enemy | undefined;
  let best = Infinity;
  for (const e of state.enemies) {
    if (isDead(e)) continue;
    const d = Math.hypot(e.pos.x - p.pos.x, e.pos.y - p.pos.y);
    if (d < best) {
      best = d;
      target = e;
    }
  }
  if (!target) return;
  const speed = Math.hypot(p.vel.x, p.vel.y) || PROJECTILE_SPEED;
  const current = Math.atan2(p.vel.y, p.vel.x);
  const desired = Math.atan2(target.pos.y - p.pos.y, target.pos.x - p.pos.x);
  let diff = desired - current;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  const maxStep = HOMING_TURN_RATE * dt;
  const next = current + Math.max(-maxStep, Math.min(maxStep, diff));
  p.vel = { x: Math.cos(next) * speed, y: Math.sin(next) * speed };
}

/** Removes dead enemies in place so `state.enemies` keeps aliasing the runtime array. */
function reapDeadEnemies(state: GameState): void {
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    if (isDead(state.enemies[i]!)) state.enemies.splice(i, 1);
  }
}

/** Ticks status effects on enemies: burn deals damage over time, effects expire. */
function stepStatuses(state: GameState, dt: number): void {
  for (const enemy of state.enemies) {
    if (enemy.effects.length === 0) continue;
    const slowed = enemy.effects.some((e) => e.kind === 'slow');
    for (const e of enemy.effects) {
      if (e.kind === 'burn') {
        const dps = e.magnitude * (slowed ? BURN_SLOW_SYNERGY : 1);
        applyDamage(enemy, dps * dt);
      }
      e.remaining -= dt;
    }
    enemy.effects = enemy.effects.filter((e) => e.remaining > 0);
  }
  reapDeadEnemies(state); // burn can kill
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

  // Combat rooms (not the boss) may drop a healing heart. The roll is a pure
  // function of (seed, floor, roomId), so it fires at most once per room and is
  // reproducible — no shared RNG consumed in tick().
  if (room && room.type === 'normal') {
    const rng = new Rng(rewardSeed(state.seed, state.floor, state.currentRoom));
    if (rng.chance(HEART_DROP_CHANCE)) {
      state.pickups.push(
        makeHeart(state.nextEntityId++, { x: ROOM_W / 2, y: ROOM_H / 2 }, HEART_HEAL),
      );
    }
    // Always drop a little money so the shop is reachable. Heart roll is drawn
    // first above, so adding coins here doesn't change existing heart outcomes.
    const value = rng.range(1, COIN_DROP_MAX);
    state.pickups.push(makeCoin(state.nextEntityId++, { x: ROOM_W / 2 + 1.5, y: ROOM_H / 2 }, value));
  }
}

/**
 * Once the boss is defeated, stepping on the teleporter descends to the next
 * floor — or wins the run if this was the final floor.
 */
function stepTeleporter(state: GameState): void {
  if (!state.bossDefeated || state.currentRoom !== state.dungeon.bossRoom) return;
  if (circlesOverlap(state.player.pos, state.player.radius, TELEPORTER_POS, TELEPORTER_RADIUS)) {
    if (state.floor >= MAX_FLOORS) state.status = 'won';
    else descendToNextFloor(state);
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
