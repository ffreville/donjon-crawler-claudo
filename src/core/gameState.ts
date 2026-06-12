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
  makeKey,
  makePickup,
  makeProjectile,
  makeTrap,
  type Enemy,
  type EnemyKind,
  type Pickup,
  type Projectile,
  type StatusSpec,
  type Trap,
  type TrapKind,
} from './entities.js';
import { applyItem, getItem, ITEM_POOL, type Familiar } from './items.js';
import { getCharacter, type Character } from './characters.js';
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
/** Player collision box half-extent, in tiles. Kept small so a 1-tile door is easy to pass. */
export const PLAYER_RADIUS = 0.28;

/** Projectile speed, in tiles per second. */
export const PROJECTILE_SPEED = 12;
/** Enemy/boss projectile lifetime, in seconds. (Player tears use range, see below.) */
export const PROJECTILE_LIFE = 1.2;
/** Base projectile damage; item modifiers add on top (see Player.tearDamage). */
export const PLAYER_TEAR_DAMAGE = 3;
/** How far a player tear travels before falling, in tiles (base; item-modifiable). */
export const PLAYER_TEAR_RANGE = 5;

/** Mom's Knife tuning. The blade is held in front of the player and extends with charge. */
export const KNIFE_BASE_REACH = 0.7; // tiles, the held blade's fixed reach (no extend)
export const KNIFE_MAX_REACH = 6; // tiles, farthest a fully-charged throw flies
export const KNIFE_CHARGE_TIME = 0.8; // seconds of held fire to reach max
export const KNIFE_HALF_WIDTH = 0.45; // blade thickness either side of its line
export const KNIFE_HIT_INTERVAL = 0.2; // seconds between damage pulses (held blade)
export const KNIFE_THROW_SPEED = 16; // tiles/second a thrown knife flies out and back

/** Orbitals (e.g. the Orbital Fly): small shields circling the player that block shots. */
export const ORBITAL_RADIUS = 1.0; // distance from the player, in tiles
export const ORBITAL_SPEED = 3.2; // rotation speed, radians/second
export const ORBITAL_BLOCK_RADIUS = 0.28; // small hitbox so they aren't too strong
/** Player shots per second. */
export const PLAYER_FIRE_RATE = 3;
/** Player invulnerability window after taking contact damage, in seconds. */
export const PLAYER_IFRAMES = 0.8;

/** Distance from a door's opening (along the wall normal) at which the player transitions. */
export const DOOR_TRIGGER = 0.9;
/** Half-width of the doorway transition zone along the wall (matches the 1-tile opening). */
export const DOOR_HALF_SPAN = 0.6;

/**
 * Distance from a locked door at which walking into it spends a key to open it.
 * Must exceed the gap the solid wall leaves (~0.85) so the player can reach it.
 */
export const LOCK_UNLOCK_DIST = 1.0;

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
export const MAX_FLOORS = 10;

/** Combat-room enemy density: roughly one base enemy per this many interior tiles. */
export const TILES_PER_ENEMY = 70;

/** Difficulty scaling per floor (floor 1 = base values). */
export const ENEMY_HP_PER_FLOOR = 2;
/** Extra rooms / map size added per floor (more combat rooms deeper in). */
const ROOMS_PER_FLOOR = 3;
const MAPSIZE_PER_FLOOR = 2;
const ENEMIES_PER_FLOOR = 1;
const BOSS_HP_BASE = 30;
const BOSS_HP_PER_FLOOR = 15;
const MINIBOSS_HP_BASE = 16;
const MINIBOSS_HP_PER_FLOOR = 8;

/** Chance that clearing a combat room drops a healing heart, and how much it heals. */
export const HEART_DROP_CHANCE = 0.3;
export const HEART_HEAL = 1;

/** Coins: combat rooms drop 1..COIN_DROP_MAX coins; the shop sells with these. */
export const COIN_DROP_MAX = 3;

/** Keys: a cleared combat room drops one with this chance (use TBD; tunable). */
export const KEY_DROP_CHANCE = 0.35;

/** Spikes: a fraction of normal rooms get them; each spike deals TRAP_DAMAGE on contact. */
export const TRAP_ROOM_CHANCE = 0.4;
export const TRAP_MIN = 2;
export const TRAP_MAX = 5;
export const TRAP_DAMAGE = 1;
export const TRAP_RADIUS = 0.3;

/** Pits: a fraction of normal rooms get holes that send the player back to the entrance. */
export const PIT_ROOM_CHANCE = 0.3;
export const PIT_MIN = 1;
export const PIT_MAX = 3;
/** Damage taken when falling into a pit (before being returned to the entrance). */
export const PIT_DAMAGE = 1;
/** Keep traps this far from any door so none sit right in front of an entrance. */
export const DOOR_TRAP_CLEARANCE = 2.5;

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
/** Number of distinct boss variants (0..2 shoot patterns, 3 = the ram). */
export const BOSS_VARIANTS = 4;

/** Ram boss (variant 3): charges, then dashes in a straight line, bouncing off walls. */
export const RAM_CHARGE_TIME = 1.2; // seconds of telegraph before the dash
export const RAM_AIM_LEAD = 0.35; // direction is locked this long before the dash
const RAM_DASH_SPEED = 16; // initial dash speed, tiles/s
const RAM_DASH_DECEL = 12; // speed lost per second while dashing
const RAM_DASH_MIN = 2; // below this the dash ends and a new charge begins

/** Fly: lateral wobble while chasing (Attack Fly). */
const FLY_WOBBLE_FREQ = 9;
const FLY_WOBBLE_AMP = 0.8;
/** Charger: cycle of windup (telegraph) → dash → recover, then re-lock. */
const CHARGER_CYCLE = 1.8;
const CHARGER_WINDUP = 0.45;
const CHARGER_DASH = 0.4;
const CHARGER_DASH_SPEED = 9;
/** Exploder (Boom Fly): bursts on death for AoE within this radius. */
export const EXPLODER_RADIUS = 1.6;
export const EXPLODER_DAMAGE = 1;
/** Splitter: spawns this many flies on death. */
export const SPLITTER_CHILDREN = 2;

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
  /** How far tears travel before falling, in tiles (base + item modifiers). */
  tearRange: number;
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
  /** Immune to floor traps (spikes and pits). */
  flying: boolean;
  /** Currency for the shop. */
  coins: number;
  /** Keys collected (use TBD). */
  keys: number;
  /** Seconds until the player can fire again. */
  fireCooldown: number;
  /** Seconds of remaining invulnerability. */
  invuln: number;
  /** Count of shots fired this run (one per trigger pull, not per pellet). Render uses it to cue audio. */
  shotsFired: number;
  /** Id of the held usable item (single active slot), or null if none. */
  activeItem: string | null;
  /** Rooms cleared toward recharging the active item (capped at its `charge`). */
  activeCharge: number;
  /** Owned familiars (follow the player, act each room). Persist across floors. */
  familiars: Familiar[];
  /** Mom's Knife: replaces tears with a held melee blade. */
  knife: boolean;
  /** Number of orbitals circling the player (each blocks shots a little). */
  orbitals: number;
  /** Shared orbital rotation angle (radians), advanced each tick. */
  orbitalAngle: number;
  /** Knife facing (normalized): the direction the blade points. */
  knifeDir: Vec2;
  /** Knife charge in [0,1]; grows while a fire direction is held, extending reach. */
  knifeCharge: number;
  /** Whether a fire direction was held last tick (to detect release → throw). */
  knifeFiring: boolean;
  /** Active thrown knife (it has left the hand), or null when the blade is held. */
  knifeThrow: KnifeThrow | null;
}

/** A knife in flight: out to `maxDist` then back to the player. */
export interface KnifeThrow {
  pos: Vec2;
  dir: Vec2;
  dist: number;
  maxDist: number;
  /** true = flying outward, false = returning to the player. */
  out: boolean;
  /** Enemy ids already hit this leg (cleared when it turns back, so it can hit again). */
  hits: number[];
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
  /** Edge-triggered: true on the tick the "use active item" key is pressed. */
  useItem?: boolean;
}

export const NO_INPUT: InputState = { moveX: 0, moveY: 0, aimX: 0, aimY: 0 };

/** Cached, lazily-populated runtime state for a single room. */
export interface RoomRuntime {
  enemies: Enemy[];
  pickups: Pickup[];
  /** Static floor traps (spikes / pits) at tile centers. */
  traps: Trap[];
  spawned: boolean;
  /**
   * Items this room will offer (treasure: 1; shop: up to 2), reserved from the
   * run-wide bag at floor-build time so each item appears at most once per run.
   * Assigned before any room is entered, so it's independent of the path taken.
   */
  offerItems: string[];
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
  /** Floor traps in the current room (aliases the current room's runtime array). */
  traps: Trap[];
  /** Where the player spawned in the current room (pits send them back here). */
  entryPos: Vec2;
  roomRuntimes: Map<RoomId, RoomRuntime>;
  doors: Door[];
  /** Whether the current room's doors are open (true when no enemies remain). */
  doorsOpen: boolean;
  /** Rooms whose locked door (shop/treasure) has been opened with a key this floor. */
  unlocked: Set<RoomId>;
  /** Whether the whole floor is revealed on the minimap (Dungeon Map active item). */
  mapRevealed: boolean;
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
  /**
   * Remaining items the run can still offer, drawn without replacement so each
   * item appears at most once per run. Consumed in floor order as floors build.
   */
  itemBag: string[];
}

export interface NewGameOptions {
  dungeon?: DungeonOptions;
  /** Force this many enemies into the START room (default 0 — start is safe). */
  enemyCount?: number;
  /** Which playable character to start as (default: the Wanderer / baseline). */
  characterId?: string;
}

/**
 * Applies a character's absolute stat overrides and starting gear to a fresh
 * player. Items are applied via the normal item path (so they stack correctly);
 * an active item is placed in the slot fully charged. A missing/unknown character
 * is a no-op (the baseline Wanderer).
 */
function applyCharacter(player: Player, character: Character | undefined): void {
  if (!character) return;
  const s = character.stats;
  if (s) {
    if (s.maxHp !== undefined) {
      player.maxHp = s.maxHp;
      player.hp = s.maxHp;
    }
    if (s.speed !== undefined) player.speed = s.speed;
    if (s.tearDamage !== undefined) player.tearDamage = s.tearDamage;
    if (s.tearRange !== undefined) player.tearRange = s.tearRange;
    if (s.fireRate !== undefined) player.fireRate = s.fireRate;
    if (s.shotCount !== undefined) player.shotCount = s.shotCount;
  }
  for (const id of character.items ?? []) {
    const item = getItem(id);
    if (item) applyItem(player, item);
  }
  if (character.activeItem) {
    const item = getItem(character.activeItem);
    if (item?.active) {
      player.activeItem = item.id;
      player.activeCharge = item.active.charge; // start ready to use
      player.items.push(item.id);
    }
  }
  player.coins += character.coins ?? 0;
  player.keys += character.keys ?? 0;
}

/** Deterministic seed for a floor's dungeon layout. */
function floorSeed(seed: number, floor: number): number {
  let h = Math.imul(seed ^ 0x85ebca6b, 2654435761);
  h = Math.imul(h ^ floor, 2246822519);
  h ^= h >>> 13;
  return h >>> 0;
}

/** The run's item bag: ITEM_POOL shuffled once, deterministically, per seed. */
function makeItemBag(seed: number): string[] {
  const h = Math.imul(seed ^ 0x27d4eb2f, 2654435761) >>> 0;
  return new Rng(h).shuffle([...ITEM_POOL]);
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
    tearRange: PLAYER_TEAR_RANGE,
    fireRate: PLAYER_FIRE_RATE,
    items: [],
    tearEffects: [],
    shotCount: 1,
    piercing: false,
    homing: false,
    flying: false,
    coins: 0,
    keys: 0,
    fireCooldown: 0,
    invuln: 0,
    shotsFired: 0,
    activeItem: null,
    activeCharge: 0,
    familiars: [],
    orbitals: 0,
    orbitalAngle: 0,
    knife: false,
    knifeDir: { x: 1, y: 0 },
    knifeCharge: 0,
    knifeFiring: false,
    knifeThrow: null,
    hp: 6,
    maxHp: 6,
    attack: 3,
    defense: 0,
  };
  // No characterId = the neutral baseline (used by tests and balance sims).
  if (opts.characterId !== undefined) applyCharacter(player, getCharacter(opts.characterId));
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
    traps: [],
    entryPos: { x: ROOM_W / 2, y: ROOM_H / 2 },
    roomRuntimes: new Map(),
    doors: [],
    doorsOpen: true,
    unlocked: new Set(),
    mapRevealed: false,
    status: 'playing',
    bossDefeated: false,
    graceTimer: 0,
    floor: 1,
    dungeonOpts: opts.dungeon ?? DEFAULT_DUNGEON,
    nextEntityId: 1,
    itemBag: makeItemBag(seed),
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
  // Bigger floors deeper in: more rooms means more combat rooms (specials stay
  // a fixed handful), on a proportionally larger map so the walk has room.
  const tier = floor - 1;
  const opts = {
    roomCount: state.dungeonOpts.roomCount + tier * ROOMS_PER_FLOOR,
    mapSize: state.dungeonOpts.mapSize + tier * MAPSIZE_PER_FLOOR,
    // More loot and more mini-bosses the deeper you go.
    treasureRooms: floor <= 3 ? 1 : floor <= 6 ? 2 : 3,
    minibossRooms: floor <= 4 ? 1 : 2,
  };
  state.dungeon = generateDungeon(new Rng(floorSeed(state.seed, floor)), opts);
  state.unlocked = new Set(); // locked doors re-lock on every new floor
  state.mapRevealed = false; // the map fogs over again on a new floor
  state.roomRuntimes = new Map();
  for (const id of state.dungeon.rooms.keys()) {
    state.roomRuntimes.set(id, { enemies: [], pickups: [], traps: [], spawned: false, offerItems: [] });
  }
  reserveFloorItems(state);
  state.bossDefeated = false;
  state.projectiles = [];
  populateRoom(state, state.dungeon.startRoom, startEnemies);
  enterRoom(state, state.dungeon.startRoom);
}

/**
 * Reserves items from the run-wide bag for this floor's item-bearing rooms, so
 * each item appears at most once per run. Rooms are visited in ascending id order
 * (canonical, path-independent): treasure takes 1, a shop up to 2, and the floor
 * boss 1 (dropped on death). When the bag is empty, those rooms simply offer none.
 */
function reserveFloorItems(state: GameState): void {
  const ids = [...state.dungeon.rooms.keys()].sort((a, b) => a - b);
  for (const id of ids) {
    const room = state.dungeon.rooms.get(id);
    const rt = state.roomRuntimes.get(id);
    if (!room || !rt) continue;
    const want = room.type === 'shop' ? 2 : room.type === 'treasure' || room.type === 'boss' ? 1 : 0;
    for (let i = 0; i < want && state.itemBag.length > 0; i++) {
      rt.offerItems.push(state.itemBag.shift()!);
    }
  }
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
    const boss = makeEnemy(state.nextEntityId++, BOSS_SPAWN, {
      kind: 'boss',
      hp: BOSS_HP_BASE + tier * BOSS_HP_PER_FLOOR,
    });
    boss.bossVariant = (state.floor - 1) % BOSS_VARIANTS; // cycle the 3 types across floors
    rt.enemies.push(boss);
    return;
  }

  const center: Vec2 = { x: ROOM_W / 2, y: ROOM_H / 2 };

  // A mini-boss: a smaller boss-pattern enemy at the room center (away from any
  // door the player enters by). No teleporter — only the floor boss drops that.
  if (forcedCount === undefined && room.type === 'miniboss') {
    const mini = makeEnemy(state.nextEntityId++, center, {
      kind: 'boss',
      hp: MINIBOSS_HP_BASE + tier * MINIBOSS_HP_PER_FLOOR,
      radius: 0.55,
      speed: 1.6,
      touchDamage: 2,
    });
    // Mini-bosses pick a variant from the room rng (the floor boss cycles by
    // floor instead) — so a floor can show a different pattern in each.
    mini.bossVariant = rng.int(BOSS_VARIANTS);
    rt.enemies.push(mini);
    return;
  }

  // A treasure room offers one item (reserved from the run bag, so never a dupe).
  // An empty bag means no item — expected once the small pool is exhausted.
  if (forcedCount === undefined && room.type === 'treasure' && rt.offerItems.length > 0) {
    rt.pickups.push(makePickup(state.nextEntityId++, center, rt.offerItems[0]!));
  }

  // A shop offers priced stock: its reserved items (up to two) and a heart,
  // spread across the room. Kept off the vertical center so the (no-door) center
  // spawn never lands on stock.
  if (forcedCount === undefined && room.type === 'shop') {
    const stock = rt.offerItems;
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
  else if (room.type === 'normal') {
    // Scale the base count with the room's interior area so larger rooms don't
    // feel empty (roughly one enemy per TILES_PER_ENEMY tiles), then add the
    // per-floor difficulty bump.
    const interior = (ROOM_W - 2) * (ROOM_H - 2);
    const baseCount = Math.max(2, Math.round(interior / TILES_PER_ENEMY));
    count = rng.range(baseCount, baseCount + 3) + tier * ENEMIES_PER_FLOOR;
  }
  else count = 0; // start, treasure, shop

  // Available archetypes grow with the floor, so deeper floors feel more varied.
  const kindPool: EnemyKind[] = ['chaser', 'swarmer', 'fly'];
  if (state.floor >= 2) kindPool.push('shooter', 'charger');
  if (state.floor >= 3) kindPool.push('tank', 'exploder');
  if (state.floor >= 4) kindPool.push('splitter');

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

  // Some combat rooms are trapped. Drawn from the same room rng after enemy
  // placement (so enemy layouts are unchanged). Traps avoid the room center AND
  // a clearance around every door, so none sit right in front of an entrance.
  if (forcedCount === undefined && room.type === 'normal') {
    const grid = makeRoomGrid();
    const doorPts = computeDoors(state.dungeon, roomId).map((d) => doorWorldPos(grid, d.dir));
    const blocked = (p: Vec2): boolean =>
      Math.hypot(p.x - center.x, p.y - center.y) < 2 ||
      doorPts.some((dp) => Math.hypot(p.x - dp.x, p.y - dp.y) < DOOR_TRAP_CLEARANCE);

    const placeTraps = (chance: number, min: number, max: number, kind: TrapKind): void => {
      if (!rng.chance(chance)) return;
      const n = rng.range(min, max);
      let placed = 0;
      let tries = 0;
      while (placed < n && tries < n * 20) {
        tries++;
        const pos: Vec2 = { x: rng.range(1, ROOM_W - 2) + 0.5, y: rng.range(1, ROOM_H - 2) + 0.5 };
        if (blocked(pos)) continue;
        rt.traps.push(makeTrap(pos, kind));
        placed++;
      }
    };
    placeTraps(TRAP_ROOM_CHANCE, TRAP_MIN, TRAP_MAX, 'spike');
    placeTraps(PIT_ROOM_CHANCE, PIT_MIN, PIT_MAX, 'pit');
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
  state.traps = rt.traps;
  state.projectiles = [];
  state.doors = computeDoors(state.dungeon, roomId);
  state.grid = makeRoomGrid();
  state.doorsOpen = state.enemies.length === 0;
  if (state.doorsOpen) {
    for (const d of state.doors) if (!isDoorLocked(state, d)) carveDoor(state.grid, d.dir);
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
  state.entryPos = { x: state.player.pos.x, y: state.player.pos.y }; // pits return here
  // Snap familiars to the player so they don't streak across the new room.
  for (const fam of state.player.familiars) fam.pos = { x: state.player.pos.x, y: state.player.pos.y };
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
  stepUseItem(state, input); // spend the active item if used and charged
  stepFiring(state, input, dt);
  stepKnife(state, input, dt); // melee blade (replaces tears) when the knife is held
  stepFamiliarsTick(state, dt); // familiars follow the player and shooters fire
  stepOrbitals(state, dt); // rotate the orbitals before projectiles move
  // Enemies always recoil from hits (knockback), but only chase/attack once grace ends.
  stepEnemies(state, dt, enemiesActive);
  stepProjectiles(state, dt);
  stepStatuses(state, dt);
  if (enemiesActive) stepContactDamage(state, dt); // decrements invuln, may grant i-frames
  if (enemiesActive) stepTraps(state); // shares the i-frame window; must run after contact
  // Death is resolved BEFORE the boss-clear win, so a same-tick death takes
  // precedence: you can't win from the grave. Keep this order.
  if (isDead(state.player)) {
    state.status = 'dead';
    return;
  }
  stepRoomClear(state); // opens doors; flags bossDefeated in the boss room
  stepTeleporter(state); // win by reaching the teleporter after the boss falls
  if (state.status !== 'playing') return;
  stepUnlockDoors(state); // spend a key to open a shop/treasure door walked into
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
    const overlapping = circlesOverlap(player.pos, player.radius, pickup.pos, pickup.radius);
    // A just-dropped item (armed === false) arms once the player steps off it,
    // so swapping an active item doesn't instantly re-collect the dropped one.
    if (pickup.armed === false) {
      if (!overlapping) pickup.armed = true;
      continue;
    }
    if (!overlapping) continue;

    if (pickup.kind === 'coin') {
      player.coins += pickup.value;
      state.pickups.splice(i, 1);
    } else if (pickup.kind === 'key') {
      player.keys += 1;
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
      if (!item) {
        state.pickups.splice(i, 1);
        continue;
      }
      player.coins -= pickup.cost;
      if (item.active) {
        // Usable item: goes into the single active slot. If one was already held,
        // it's dropped here as a free, disarmed pickup (swap). Starts fully charged.
        if (player.activeItem) {
          const drop = makePickup(state.nextEntityId++, pickup.pos, player.activeItem, 0);
          drop.armed = false; // don't re-collect it while the player stands on it
          state.pickups.push(drop);
        }
        player.activeItem = item.id;
        player.activeCharge = item.active.charge; // picked up ready to use
        player.items.push(item.id); // log the acquisition
      } else {
        applyItem(player, item);
      }
      state.pickups.splice(i, 1);
    }
  }
}

/**
 * Advances each familiar by one cleared room and lets it act. The key-dropper
 * drops a key into the current room every `interval` rooms. Deterministic.
 */
function stepFamiliarsOnClear(state: GameState): void {
  const { player } = state;
  const cx = ROOM_W / 2 + 2; // drop column, offset right of the room's reward drops
  const cy = ROOM_H / 2;
  for (const fam of player.familiars) {
    fam.roomTimer += 1;
    if (fam.roomTimer < fam.interval) continue;
    fam.roomTimer = 0;
    const id = state.nextEntityId++;
    if (fam.kind === 'key-dropper') {
      state.pickups.push(makeKey(id, { x: cx, y: cy }));
    } else if (fam.kind === 'heart-dropper') {
      state.pickups.push(makeHeart(id, { x: cx, y: cy - 2 }, HEART_HEAL, 0));
    } else {
      state.pickups.push(makeCoin(id, { x: cx, y: cy + 2 }, 1));
    }
  }
}

/** Smoothing factor for how quickly a familiar eases toward its follow spot. */
const FAMILIAR_FOLLOW = 0.18;
/** Distance a familiar hovers from the player, in tiles. */
const FAMILIAR_ORBIT = 1.1;

/** Nearest living enemy to a point, or undefined if none remain. */
function nearestEnemyTo(state: GameState, from: Vec2): Enemy | undefined {
  let best: Enemy | undefined;
  let bestDist = Infinity;
  for (const e of state.enemies) {
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
 * Per-tick familiar update: each familiar eases toward a spot beside the player,
 * and shooter familiars fire at the nearest enemy within range on their cadence.
 * Their tears are player-sourced (so the existing projectile collision applies).
 * Deterministic: positions/targets derive from state, never from randomness.
 */
function stepFamiliarsTick(state: GameState, dt: number): void {
  const { player } = state;
  player.familiars.forEach((fam, i) => {
    // Follow: ease toward a fanned-out spot around the player.
    const angle = Math.PI * 0.75 + i * 0.8;
    const tx = player.pos.x + Math.cos(angle) * FAMILIAR_ORBIT;
    const ty = player.pos.y + Math.sin(angle) * FAMILIAR_ORBIT;
    fam.pos = {
      x: fam.pos.x + (tx - fam.pos.x) * FAMILIAR_FOLLOW,
      y: fam.pos.y + (ty - fam.pos.y) * FAMILIAR_FOLLOW,
    };

    if (fam.damage <= 0) return; // droppers don't shoot
    fam.fireCooldown = Math.max(0, fam.fireCooldown - dt);
    if (fam.fireCooldown > 0) return;
    const target = nearestEnemyTo(state, fam.pos);
    if (!target) return;
    const dx = target.pos.x - fam.pos.x;
    const dy = target.pos.y - fam.pos.y;
    const dist = Math.hypot(dx, dy) || 1;
    if (dist > fam.range) return; // hold fire if it would just fall short
    const base = Math.atan2(dy, dx);
    const n = Math.max(1, fam.shots);
    const life = fam.range / PROJECTILE_SPEED;
    for (let j = 0; j < n; j++) {
      const a = base + (j - (n - 1) / 2) * MULTISHOT_SPREAD;
      state.projectiles.push(
        makeProjectile(
          state.nextEntityId++,
          fam.pos,
          { x: Math.cos(a) * PROJECTILE_SPEED, y: Math.sin(a) * PROJECTILE_SPEED },
          fam.damage,
          life,
          'player',
          [],
          { piercing: fam.piercing },
        ),
      );
    }
    fam.fireCooldown = fam.fireInterval;
  });
}

/**
 * World positions of the player's orbitals, evenly spaced around a circle (so 2
 * sit opposite, 3 at 120°, etc.) and rotating with `orbitalAngle`. Used by both
 * the projectile-block check and the renderer, so they always agree.
 */
export function getOrbitalPositions(player: Player): Vec2[] {
  const out: Vec2[] = [];
  const n = player.orbitals;
  for (let i = 0; i < n; i++) {
    const a = player.orbitalAngle + (i / n) * Math.PI * 2;
    out.push({
      x: player.pos.x + Math.cos(a) * ORBITAL_RADIUS,
      y: player.pos.y + Math.sin(a) * ORBITAL_RADIUS,
    });
  }
  return out;
}

/** Advances the orbital rotation; called each tick before projectiles move. */
function stepOrbitals(state: GameState, dt: number): void {
  if (state.player.orbitals > 0) state.player.orbitalAngle += ORBITAL_SPEED * dt;
}

/** True if any orbital intercepts the (enemy) projectile, consuming it. */
function orbitalBlocks(state: GameState, p: Projectile): boolean {
  if (state.player.orbitals <= 0) return false;
  for (const o of getOrbitalPositions(state.player)) {
    if (circlesOverlap(p.pos, p.radius, o, ORBITAL_BLOCK_RADIUS)) return true;
  }
  return false;
}

/** Shortest distance from point `p` to the segment `a`–`b`. */
function pointSegmentDist(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  const t = len2 > 0 ? ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2 : 0;
  const tc = Math.max(0, Math.min(1, t));
  const cx = a.x + abx * tc;
  const cy = a.y + aby * tc;
  return Math.hypot(p.x - cx, p.y - cy);
}

/**
 * Mom's Knife: a melee blade held in front of the player. It points along the
 * direction the player is heading (aim if firing, else movement, else its last
 * facing), and damages any enemy it overlaps — no input needed. Holding a fire
 * direction charges it, extending the reach from KNIFE_BASE_REACH up to
 * KNIFE_MAX_REACH; letting go retracts it. Damage pulses on a fixed cadence so
 * the blade is strong but not an instant delete. Deterministic.
 */
function stepKnife(state: GameState, input: InputState, dt: number): void {
  const { player } = state;
  if (!player.knife) return;
  if (player.knifeThrow) {
    stepKnifeFlight(state, dt); // the blade has left the hand
    return;
  }

  const ax = input.aimX ?? 0;
  const ay = input.aimY ?? 0;
  const firing = Math.hypot(ax, ay) > 0;
  // Range items scale the knife too: reaches grow with the player's tear range.
  const rangeFactor = player.tearRange / PLAYER_TEAR_RANGE;

  // Releasing the fire keys throws the knife — in the direction it was CHARGED
  // (the last aim), regardless of where the player is now heading. Checked before
  // we re-orient to movement, so a same-tick turn can't redirect the throw.
  if (player.knifeFiring && !firing) {
    const maxDist =
      (KNIFE_BASE_REACH + player.knifeCharge * (KNIFE_MAX_REACH - KNIFE_BASE_REACH)) * rangeFactor;
    player.knifeThrow = {
      pos: { x: player.pos.x, y: player.pos.y },
      dir: { x: player.knifeDir.x, y: player.knifeDir.y },
      dist: 0,
      maxDist,
      out: true,
      hits: [],
    };
    player.knifeCharge = 0;
    player.knifeFiring = false;
    return;
  }

  // Facing: aim while charging, else movement, else keep the last facing.
  if (firing) {
    const l = Math.hypot(ax, ay);
    player.knifeDir = { x: ax / l, y: ay / l };
  } else if (Math.hypot(input.moveX, input.moveY) > 0) {
    const l = Math.hypot(input.moveX, input.moveY);
    player.knifeDir = { x: input.moveX / l, y: input.moveY / l };
  }
  player.knifeFiring = firing;

  // Charging only stores energy for the throw — the held blade does NOT extend.
  player.knifeCharge = firing
    ? Math.min(1, player.knifeCharge + dt / KNIFE_CHARGE_TIME)
    : Math.max(0, player.knifeCharge - dt / KNIFE_CHARGE_TIME);

  const heldReach = KNIFE_BASE_REACH * rangeFactor;
  const tip: Vec2 = {
    x: player.pos.x + player.knifeDir.x * heldReach,
    y: player.pos.y + player.knifeDir.y * heldReach,
  };

  // Held-blade damage pulses on a cadence (reuse fireCooldown, unused by tears here).
  player.fireCooldown = Math.max(0, player.fireCooldown - dt);
  if (player.fireCooldown > 0) return;
  let hit = false;
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) continue;
    if (pointSegmentDist(enemy.pos, player.pos, tip) <= KNIFE_HALF_WIDTH + enemy.radius) {
      applyDamage(enemy, player.tearDamage);
      applyStatuses(enemy, player.tearEffects); // burn / slow carry over to the blade
      applyKnockback(enemy, { x: player.knifeDir.x, y: player.knifeDir.y });
      hit = true;
    }
  }
  if (hit) {
    player.fireCooldown = KNIFE_HIT_INTERVAL;
    reapDeadEnemies(state);
  }
}

/**
 * Advances a thrown knife: it flies out along its direction to `maxDist`, then
 * homes back to the (possibly moved) player and is caught. It damages each enemy
 * once per leg (out, then back). Deterministic.
 */
function stepKnifeFlight(state: GameState, dt: number): void {
  const { player } = state;
  const t = player.knifeThrow!;
  const step = KNIFE_THROW_SPEED * dt;
  if (t.out) {
    t.pos = { x: t.pos.x + t.dir.x * step, y: t.pos.y + t.dir.y * step };
    t.dist += step;
    if (t.dist >= t.maxDist) {
      t.out = false;
      t.hits = []; // the return leg can hit each enemy again
    }
  } else {
    const dx = player.pos.x - t.pos.x;
    const dy = player.pos.y - t.pos.y;
    const d = Math.hypot(dx, dy);
    if (d <= step + 0.3) {
      player.knifeThrow = null; // caught
      return;
    }
    t.pos = { x: t.pos.x + (dx / d) * step, y: t.pos.y + (dy / d) * step };
  }

  let hit = false;
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0 || t.hits.includes(enemy.id)) continue;
    if (Math.hypot(enemy.pos.x - t.pos.x, enemy.pos.y - t.pos.y) <= KNIFE_HALF_WIDTH + enemy.radius) {
      applyDamage(enemy, player.tearDamage);
      applyStatuses(enemy, player.tearEffects); // burn / slow carry over to the throw
      applyKnockback(enemy, t.dir);
      t.hits.push(enemy.id);
      hit = true;
    }
  }
  if (hit) reapDeadEnemies(state);
}

/** Adds one charge (capped) to the held active item; called when a room clears. */
function chargeActiveItem(state: GameState): void {
  const { player } = state;
  if (!player.activeItem) return;
  const item = getItem(player.activeItem);
  if (!item?.active) return;
  player.activeCharge = Math.min(item.active.charge, player.activeCharge + 1);
}

/** Uses the held active item when the use key is pressed and it's fully charged. */
function stepUseItem(state: GameState, input: InputState): void {
  if (!input.useItem) return;
  const { player } = state;
  if (!player.activeItem) return;
  const item = getItem(player.activeItem);
  if (!item?.active) return;
  if (player.activeCharge < item.active.charge) return; // not ready

  // Apply the effect(s). `used` gates the charge spend so a no-op (e.g. a reroll
  // in a room with no items) doesn't waste the charge.
  let used = false;
  const a = item.active;
  if (a.heal) {
    heal(player, a.heal);
    used = true;
  }
  if (a.coins) {
    player.coins += a.coins;
    used = true;
  }
  if (a.reroll && rerollRoomItems(state)) used = true;
  if (a.revealMap && !state.mapRevealed) {
    state.mapRevealed = true;
    used = true;
  }

  if (used) player.activeCharge = 0; // spent
}

/**
 * Rerolls the item pickups lying in the current room (treasure / shop) into fresh
 * items from the run bag, returning the old ones to the back of the bag (so the
 * pool is preserved and stays duplicate-free). Costs/positions are kept. Returns
 * true if at least one item was rerolled. Deterministic: draws from the bag order.
 */
function rerollRoomItems(state: GameState): boolean {
  const newOffers: string[] = [];
  let rerolled = false;
  for (const p of state.pickups) {
    if (p.kind !== 'item') continue;
    if (state.itemBag.length === 0) {
      newOffers.push(p.itemId); // bag dry: leave this one as-is
      continue;
    }
    const fresh = state.itemBag.shift()!;
    state.itemBag.push(p.itemId); // old item goes back into circulation
    p.itemId = fresh;
    newOffers.push(fresh);
    rerolled = true;
  }
  if (rerolled) {
    const rt = state.roomRuntimes.get(state.currentRoom);
    if (rt) rt.offerItems = newOffers;
  }
  return rerolled;
}

function stepFiring(state: GameState, input: InputState, dt: number): void {
  const { player } = state;
  if (player.knife) return; // the knife replaces tears (see stepKnife)
  player.fireCooldown = Math.max(0, player.fireCooldown - dt);
  const ax = input.aimX ?? 0;
  const ay = input.aimY ?? 0;
  const len = Math.hypot(ax, ay);
  if (len > 0 && player.fireCooldown <= 0) {
    const base = Math.atan2(ay, ax);
    const n = Math.max(1, player.shotCount);
    // A tear lives just long enough to travel its range, then falls — so it
    // can't cross the room. life = distance / speed.
    const life = player.tearRange / PROJECTILE_SPEED;
    for (let i = 0; i < n; i++) {
      const angle = base + (i - (n - 1) / 2) * MULTISHOT_SPREAD;
      const vel: Vec2 = { x: Math.cos(angle) * PROJECTILE_SPEED, y: Math.sin(angle) * PROJECTILE_SPEED };
      state.projectiles.push(
        makeProjectile(
          state.nextEntityId++,
          player.pos,
          vel,
          player.tearDamage,
          life,
          'player',
          [...player.tearEffects],
          { piercing: player.piercing, homing: player.homing },
        ),
      );
    }
    player.fireCooldown = 1 / player.fireRate;
    player.shotsFired++; // one per trigger pull (render cues the tear sound off this)
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
      if (enemy.bossVariant === 3) {
        // Ram boss: charge (telegraph, hold still) → dash in a straight line that
        // bounces off walls and slows down → recharge. It fires nothing; the body
        // is the threat.
        if (enemy.dashSpeed > 0) {
          // Probe the next step; if a wall blocks an axis, bounce (flip that axis).
          const sx = enemy.aiDir.x * enemy.dashSpeed * dt;
          const sy = enemy.aiDir.y * enemy.dashSpeed * dt;
          const probe = moveBody(grid, enemy.pos, enemy.radius, sx, sy);
          if (Math.abs(probe.x - enemy.pos.x) < Math.abs(sx) - 1e-4) enemy.aiDir.x = -enemy.aiDir.x;
          if (Math.abs(probe.y - enemy.pos.y) < Math.abs(sy) - 1e-4) enemy.aiDir.y = -enemy.aiDir.y;
          enemy.dashSpeed = Math.max(0, enemy.dashSpeed - RAM_DASH_DECEL * dt);
          if (enemy.dashSpeed <= RAM_DASH_MIN) {
            enemy.dashSpeed = 0; // spent → start charging again
            enemy.aiTimer = 0;
          }
          vx = enemy.aiDir.x * enemy.dashSpeed;
          vy = enemy.aiDir.y * enemy.dashSpeed;
        } else {
          // Charging: stand still and aim at the player until the lock point, then
          // freeze the direction so the player can still dodge at the last moment.
          enemy.aiTimer += dt;
          if (enemy.aiTimer < RAM_CHARGE_TIME - RAM_AIM_LEAD) enemy.aiDir = { x: ux, y: uy };
          if (enemy.aiTimer >= RAM_CHARGE_TIME) enemy.dashSpeed = RAM_DASH_SPEED;
        }
      } else {
        // Advance toward the player; the threat is the bullet patterns. The barrage
        // variant (2) is more aggressive on its feet.
        const advance = enemy.bossVariant === 2 ? 0.95 : 0.6;
        vx = ux * speed * advance;
        vy = uy * speed * advance;
        stepBossAttacks(state, enemy, ux, uy, dt);
      }
    } else if (enemy.kind === 'fly') {
      // Buzz toward the player with a perpendicular wobble (erratic flight).
      enemy.aiTimer += dt;
      const wob = Math.sin(enemy.aiTimer * FLY_WOBBLE_FREQ) * FLY_WOBBLE_AMP;
      vx = (ux - uy * wob) * speed;
      vy = (uy + ux * wob) * speed;
    } else if (enemy.kind === 'charger') {
      // Cycle: lock a direction, telegraph (hold), dash along it, recover.
      if (enemy.aiTimer <= 0) {
        enemy.aiDir = { x: ux, y: uy };
        enemy.aiTimer = CHARGER_CYCLE;
      }
      enemy.aiTimer -= dt;
      const elapsed = CHARGER_CYCLE - enemy.aiTimer;
      const sf = slowFactor(enemy);
      if (elapsed < CHARGER_WINDUP) {
        // windup: stand still (telegraph)
      } else if (elapsed < CHARGER_WINDUP + CHARGER_DASH) {
        vx = enemy.aiDir.x * CHARGER_DASH_SPEED * sf;
        vy = enemy.aiDir.y * CHARGER_DASH_SPEED * sf;
      } else {
        vx = ux * speed; // recover: drift toward the player
        vy = uy * speed;
      }
    } else {
      // chaser / swarmer / tank / exploder / splitter: walk straight at the player.
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
 * Boss attack patterns. Three variants, each escalating in three HP phases.
 * Deterministic: pattern from `bossVariant` + HP ratio, timing from fireCooldown.
 *  - 0 Bombardier: radial bursts / aimed spread / dense radial.
 *  - 1 Spiral: frequent small bursts whose base angle rotates each volley.
 *  - 2 Barrage: aimed "shotgun" at the player, widening, with a panic ring low.
 */
function stepBossAttacks(state: GameState, boss: Enemy, ux: number, uy: number, dt: number): void {
  boss.fireCooldown = Math.max(0, boss.fireCooldown - dt);
  if (boss.fireCooldown > 0) return;
  const ratio = boss.hp / boss.maxHp;
  const aim = Math.atan2(uy, ux);
  if (boss.bossVariant === 1) bossSpiral(state, boss, ratio);
  else if (boss.bossVariant === 2) bossBarrage(state, boss, aim, ratio);
  else bossBombardier(state, boss, aim, ratio);
}

function bossBombardier(state: GameState, boss: Enemy, aim: number, ratio: number): void {
  if (ratio > 0.66) {
    spawnRadial(state, boss.pos, 8, 0);
    boss.fireCooldown = 1.8;
  } else if (ratio > 0.33) {
    spawnAimed(state, boss.pos, aim, 5, 0.28);
    boss.fireCooldown = 1.3;
  } else {
    spawnRadial(state, boss.pos, 12, Math.PI / 12);
    boss.fireCooldown = 0.9;
  }
}

function bossSpiral(state: GameState, boss: Enemy, ratio: number): void {
  const arms = ratio > 0.66 ? 3 : ratio > 0.33 ? 4 : 5;
  spawnRadial(state, boss.pos, arms, boss.bossSpin);
  boss.bossSpin += 0.5; // rotate the base angle so successive volleys spiral
  boss.fireCooldown = ratio > 0.33 ? 0.4 : 0.28;
}

function bossBarrage(state: GameState, boss: Enemy, aim: number, ratio: number): void {
  const shots = ratio > 0.66 ? 3 : ratio > 0.33 ? 5 : 7;
  spawnAimed(state, boss.pos, aim, shots, 0.16);
  if (ratio <= 0.33) spawnRadial(state, boss.pos, 10, 0); // panic ring when wounded
  boss.fireCooldown = ratio > 0.33 ? 1.1 : 0.7;
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
      // Enemy projectile: orbitals block it first (small hitbox = only a little).
      if (orbitalBlocks(state, p)) continue;
      // ...then it can hit the player (negated but still consumed during i-frames).
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
    const enemy = state.enemies[i]!;
    if (!isDead(enemy)) continue;
    onEnemyDeath(state, enemy);
    state.enemies.splice(i, 1);
  }
}

/**
 * Death side-effects for special archetypes. Runs once, just before the corpse
 * is removed. Deterministic: positions derive from the dying enemy, not rng.
 *  - exploder: a one-shot AoE blast that hurts the player if in range (and not
 *    in i-frames), like Boom Fly.
 *  - splitter: replaced by SPLITTER_CHILDREN flies fanned out around it (Globin).
 * Children/blasts are appended after `i` in reapDeadEnemies, so they are not
 * re-scanned this pass (alive enemies wouldn't be reaped anyway).
 */
function onEnemyDeath(state: GameState, enemy: Enemy): void {
  if (enemy.kind === 'exploder') {
    // The blast hits the player regardless of flight (flight only dodges floor
    // traps), but respects i-frames so it can't stack with a same-tick hit.
    const { player } = state;
    if (player.invuln <= 0 && circlesOverlap(player.pos, player.radius, enemy.pos, EXPLODER_RADIUS)) {
      applyDamage(player, EXPLODER_DAMAGE);
      player.invuln = PLAYER_IFRAMES;
    }
    return;
  }

  if (enemy.kind === 'splitter') {
    const tier = state.floor - 1;
    const childHp = ENEMY_ARCHETYPES.fly.hp + tier * ENEMY_HP_PER_FLOOR;
    const r = ENEMY_ARCHETYPES.fly.radius;
    for (let c = 0; c < SPLITTER_CHILDREN; c++) {
      const angle = (Math.PI * 2 * c) / SPLITTER_CHILDREN;
      const off = enemy.radius + r;
      const pos: Vec2 = {
        x: Math.min(Math.max(enemy.pos.x + Math.cos(angle) * off, 1 + r), ROOM_W - 1 - r),
        y: Math.min(Math.max(enemy.pos.y + Math.sin(angle) * off, 1 + r), ROOM_H - 1 - r),
      };
      state.enemies.push(makeEnemy(state.nextEntityId++, pos, { kind: 'fly', hp: childHp }));
    }
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

/**
 * Floor traps. Spikes damage the player; pits send them back to the room's
 * entrance. Flight (wings) makes the player immune. `invuln` is already
 * decremented this tick by stepContactDamage (which runs first), so a same-tick
 * enemy hit takes precedence and the trap is absorbed.
 */
function stepTraps(state: GameState): void {
  const { player } = state;
  if (player.flying) return; // wings carry you over every floor hazard
  if (player.invuln > 0) return;
  for (const trap of state.traps) {
    if (circlesOverlap(player.pos, player.radius, trap.pos, TRAP_RADIUS)) {
      if (trap.kind === 'pit') {
        applyDamage(player, PIT_DAMAGE);
        player.pos = { x: state.entryPos.x, y: state.entryPos.y };
        player.vel = { x: 0, y: 0 };
      } else {
        applyDamage(player, TRAP_DAMAGE);
      }
      player.invuln = PLAYER_IFRAMES;
      break;
    }
  }
}

/** When a locked room runs out of enemies, mark it cleared and open the doors. */
function stepRoomClear(state: GameState): void {
  if (state.doorsOpen || state.enemies.length > 0) return;
  state.doorsOpen = true;
  for (const d of state.doors) if (!isDoorLocked(state, d)) carveDoor(state.grid, d.dir);
  const room = state.dungeon.rooms.get(state.currentRoom);
  if (room) room.cleared = true;
  chargeActiveItem(state); // clearing a room tops up the held active item
  stepFamiliarsOnClear(state); // familiars act each cleared room (e.g. drop a key)
  // Beating the boss no longer wins instantly: it drops a teleporter and leaves
  // the floor open so the player can backtrack before choosing to finish. It also
  // drops a reward item (the reserved bag item; a heart if the bag is empty),
  // placed at the room center, on the path to the teleporter. Mini-bosses don't.
  if (room && state.currentRoom === state.dungeon.bossRoom) {
    state.bossDefeated = true;
    const reward = room.type === 'boss' ? state.roomRuntimes.get(state.currentRoom)?.offerItems[0] : undefined;
    const at: Vec2 = { x: ROOM_W / 2, y: ROOM_H / 2 };
    if (reward) state.pickups.push(makePickup(state.nextEntityId++, at, reward, 0));
    else state.pickups.push(makeHeart(state.nextEntityId++, at, HEART_HEAL, 0));
  }

  // Combat rooms (not the boss) may drop a healing heart. The roll is a pure
  // function of (seed, floor, roomId), so it fires at most once per room and is
  // reproducible — no shared RNG consumed in tick().
  if (room && (room.type === 'normal' || room.type === 'miniboss')) {
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
    // A key may also drop (drawn last, so heart/coin outcomes are unchanged).
    if (rng.chance(KEY_DROP_CHANCE)) {
      state.pickups.push(makeKey(state.nextEntityId++, { x: ROOM_W / 2 - 1.5, y: ROOM_H / 2 }));
    }
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

/**
 * A door is locked while it leads into a not-yet-opened shop or treasure room.
 * Locked doors are never carved, so the player can't pass until they spend a key.
 */
export function isDoorLocked(state: GameState, door: Door): boolean {
  if (state.unlocked.has(door.to)) return false;
  const type = state.dungeon.rooms.get(door.to)?.type;
  return type === 'shop' || type === 'treasure';
}

/**
 * Open a locked door the player walks into, if they have a key: spends one key,
 * marks the room unlocked for the rest of the floor, and carves the opening so
 * the regular door transition can carry them through on the following ticks.
 */
function stepUnlockDoors(state: GameState): void {
  if (!state.doorsOpen || state.player.keys <= 0) return;
  for (const d of state.doors) {
    if (!isDoorLocked(state, d)) continue;
    const o = doorWorldPos(state.grid, d.dir);
    if (Math.hypot(state.player.pos.x - o.x, state.player.pos.y - o.y) < LOCK_UNLOCK_DIST) {
      state.player.keys -= 1;
      state.unlocked.add(d.to);
      carveDoor(state.grid, d.dir);
      return;
    }
  }
}

/**
 * Transition to a neighbor when the player reaches an open door. The trigger is
 * a rectangle, not a point: the player crosses when close to the wall along the
 * door's normal (`DOOR_TRIGGER`) and anywhere within the widened gap along it
 * (`DOOR_HALF_SPAN`), so you no longer have to thread the exact center tile.
 */
function stepDoors(state: GameState): void {
  if (!state.doorsOpen) return;
  for (const d of state.doors) {
    if (isDoorLocked(state, d)) continue; // a still-locked door is impassable
    const o = doorWorldPos(state.grid, d.dir);
    const dx = state.player.pos.x - o.x;
    const dy = state.player.pos.y - o.y;
    const horizontal = d.dir === 'up' || d.dir === 'down';
    const perp = horizontal ? dy : dx; // toward/through the wall
    const along = horizontal ? dx : dy; // across the opening span
    if (Math.abs(perp) < DOOR_TRIGGER && Math.abs(along) < DOOR_HALF_SPAN) {
      enterRoom(state, d.to, d.dir);
      return;
    }
  }
}
