/**
 * Items are declarative data: a set of stat modifiers applied to the player when
 * picked up. Keeping them as plain data (rather than code paths) makes them easy
 * to add, diff, and balance via headless simulation.
 */

import type { StatusSpec } from './entities.js';
import type { Vec2 } from './types.js';

export interface StatModifiers {
  /** Added to max HP; the player is also healed by this amount. */
  maxHp?: number;
  /** Added to movement speed, in tiles/second. */
  speed?: number;
  /** Added to projectile damage. */
  tearDamage?: number;
  /** Added to fire rate, in shots/second. */
  fireRate?: number;
  /** Added to tear range, in tiles. */
  range?: number;
}

/** Shaping modifiers an item can grant to the player's tears. */
export interface TearMods {
  /** Added to the number of tears per shot. */
  shotCount?: number;
  piercing?: boolean;
  homing?: boolean;
}

/**
 * An on-demand effect for a usable ("active") item. The player holds at most one
 * active item; it charges by clearing rooms and is spent when used.
 */
export interface ActiveEffect {
  /** Rooms that must be cleared to fully recharge after a use. */
  charge: number;
  /** On use: heal this many HP (capped at max HP). */
  heal?: number;
  /** On use: grant this many coins. */
  coins?: number;
  /** On use: reroll the item pickups in the current room (treasure / shop). */
  reroll?: boolean;
  /** On use: reveal the whole floor on the minimap (until the next floor). */
  revealMap?: boolean;
}

/**
 * What a familiar does. Droppers leave a pickup every few cleared rooms; shooters
 * fire at the nearest enemy each tick. Each shooter kind is its own behaviour +
 * sprite (wisp / owl / hornet).
 */
export type FamiliarKind =
  | 'key-dropper'
  | 'heart-dropper'
  | 'coin-dropper'
  | 'wisp' // steady single shots
  | 'owl' // slow, heavy, piercing shots
  | 'hornet'; // rapid weak spread

/** Declarative spec for a familiar an item grants (data; see `Familiar` for runtime state). */
export interface FamiliarSpec {
  kind: FamiliarKind;
  /** Droppers: leave a pickup every this many rooms cleared. */
  interval?: number;
  /** Shooters: damage per tear. */
  damage?: number;
  /** Shooters: seconds between volleys. */
  fireInterval?: number;
  /** Shooters: tears per volley (>1 = spread). */
  shots?: number;
  /** Shooters: tears pierce enemies. */
  piercing?: boolean;
  /** Shooters: tear travel range, in tiles. */
  range?: number;
}

/** A familiar the player owns at runtime. Follows the player and acts each tick/room. */
export interface Familiar {
  kind: FamiliarKind;
  /** Droppers: rooms between drops. */
  interval: number;
  /** Droppers: rooms cleared since its last drop. */
  roomTimer: number;
  /** Current world position (follows the player; tracked in the core for shooters). */
  pos: Vec2;
  /** Shooters: seconds until the next volley. */
  fireCooldown: number;
  /** Shooters: damage / cadence / spread / piercing / range (0 for droppers). */
  damage: number;
  fireInterval: number;
  shots: number;
  piercing: boolean;
  range: number;
}

export interface Item {
  id: string;
  name: string;
  description: string;
  modifiers: StatModifiers;
  /** If set, the player's tears apply this status on hit. */
  tearEffect?: StatusSpec;
  /** If set, reshapes how the player fires. */
  tearMods?: TearMods;
  /** If true, grants flight (immunity to floor traps: spikes and pits). */
  flying?: boolean;
  /** If set, this is a usable (active) item held in the single active slot. */
  active?: ActiveEffect;
  /** If set, collecting this item grants a following familiar. */
  familiar?: FamiliarSpec;
  /** If true, replaces tears with the Knife: a held melee blade you charge to extend. */
  knife?: boolean;
  /** If true, grants one orbital (circles the player and blocks shots a little). */
  orbital?: boolean;
}

/** The player fields an item can mutate. `Player` is structurally compatible. */
export interface MutableStats {
  hp: number;
  maxHp: number;
  speed: number;
  tearDamage: number;
  tearRange: number;
  fireRate: number;
  items: string[];
  tearEffects: StatusSpec[];
  shotCount: number;
  piercing: boolean;
  homing: boolean;
  flying: boolean;
  knife: boolean;
  orbitals: number;
  familiars: Familiar[];
}

export const ITEMS: Record<string, Item> = {
  'sharp-tears': {
    id: 'sharp-tears',
    name: 'Sharp Tears',
    // +3 (not +2) so a single pickup crosses the 6-HP breakpoint: base tear
    // damage 3 + 3 = 6 one-shots a basic chaser/shooter (was 2 hits at +2, a
    // dead item), and cuts 8-HP floor-2 enemies from 3 hits to 2. Backed by the
    // balance sim in balance.test.ts.
    description: 'Your tears hit harder. +3 damage.',
    modifiers: { tearDamage: 3 },
  },
  'sharp-tears-xs': {
    id: 'sharp-tears-xs',
    name: 'Honed Tears',
    description: 'Your tears hit a little harder. +1 damage.',
    modifiers: { tearDamage: 1 },
  },
  'sharp-tears-s': {
    id: 'sharp-tears-s',
    name: 'Keen Tears',
    description: 'Your tears hit harder. +2 damage.',
    modifiers: { tearDamage: 2 },
  },
  'swift-boots': {
    id: 'swift-boots',
    name: 'Swift Boots',
    description: 'Move faster. +1.5 speed.',
    modifiers: { speed: 1.5 },
  },
  spyglass: {
    id: 'spyglass',
    name: 'Spyglass',
    description: 'Your tears fly farther. +1 range.',
    modifiers: { range: 1 },
  },
  telescope: {
    id: 'telescope',
    name: 'Telescope',
    description: 'Your tears fly much farther. +1.5 range.',
    modifiers: { range: 1.5 },
  },
  'rapid-fire': {
    id: 'rapid-fire',
    name: 'Rapid Fire',
    description: 'Shoot more often. +1.5 fire rate.',
    modifiers: { fireRate: 1.5 },
  },
  vitality: {
    id: 'vitality',
    name: 'Vitality',
    description: 'A larger heart. +2 max HP (and heal).',
    modifiers: { maxHp: 2 },
  },
  'small-vitality-1': {
    id: 'small-vitality-1',
    name: 'Snack',
    description: 'A quick bite. +1 max HP (and heal).',
    modifiers: { maxHp: 1 },
  },
  'small-vitality-2': {
    id: 'small-vitality-2',
    name: 'Sandwich',
    description: 'A filling sandwich. +1 max HP (and heal).',
    modifiers: { maxHp: 1 },
  },
  'small-vitality-3': {
    id: 'small-vitality-3',
    name: 'Hot Soup',
    description: 'A warm bowl. +1 max HP (and heal).',
    modifiers: { maxHp: 1 },
  },
  'fire-tears': {
    id: 'fire-tears',
    name: 'Fire Tears',
    description: 'Your tears set enemies on fire (burn over time).',
    modifiers: {},
    tearEffect: { kind: 'burn', duration: 2, magnitude: 2 },
  },
  'frost-tears': {
    id: 'frost-tears',
    name: 'Frost Tears',
    description: 'Your tears chill enemies, slowing them.',
    modifiers: {},
    tearEffect: { kind: 'slow', duration: 2, magnitude: 0.5 },
  },
  'split-shot': {
    id: 'split-shot',
    name: 'Split Shot',
    description: 'Fire an extra tear in a spread. +1 shot.',
    modifiers: {},
    tearMods: { shotCount: 1 },
  },
  'triple-shot': {
    id: 'triple-shot',
    name: 'Triple Shot',
    description: 'Fire three tears in a spread. +2 shots.',
    modifiers: {},
    tearMods: { shotCount: 2 },
  },
  'piercing-tears': {
    id: 'piercing-tears',
    name: 'Piercing Tears',
    description: 'Your tears pass through enemies.',
    modifiers: {},
    tearMods: { piercing: true },
  },
  'homing-tears': {
    id: 'homing-tears',
    name: 'Homing Tears',
    description: 'Your tears curve toward enemies.',
    modifiers: {},
    tearMods: { homing: true },
  },
  wings: {
    id: 'wings',
    name: 'Wings',
    description: 'You fly over spikes and pits.',
    modifiers: {},
    flying: true,
  },
  'med-kit': {
    id: 'med-kit',
    name: 'Med Kit',
    description: 'Active: heal 1 HP. Recharges over 3 rooms cleared.',
    modifiers: {},
    active: { charge: 3, heal: 1 },
  },
  'reroll-die': {
    id: 'reroll-die',
    name: 'Reroll Die',
    description: 'Active: reroll the items in this treasure room or shop. Recharges over 5 rooms.',
    modifiers: {},
    active: { charge: 5, reroll: true },
  },
  'lucky-coin': {
    id: 'lucky-coin',
    name: 'Lucky Coin',
    description: 'Active: gain 1 coin. Recharges over 1 room cleared.',
    modifiers: {},
    active: { charge: 1, coins: 1 },
  },
  'dungeon-map': {
    id: 'dungeon-map',
    name: 'Dungeon Map',
    description: 'Active: reveal the whole floor on the minimap. Recharges over 6 rooms.',
    modifiers: {},
    active: { charge: 6, revealMap: true },
  },
  'flying-key': {
    id: 'flying-key',
    name: 'Flying Key',
    description: 'Familiar: a grey flying key that follows you and drops a key every 3 rooms.',
    modifiers: {},
    familiar: { kind: 'key-dropper', interval: 3 },
  },
  'beating-heart': {
    id: 'beating-heart',
    name: 'Beating Heart',
    description: 'Familiar: a little heart that follows you and drops a heart every 4 rooms.',
    modifiers: {},
    familiar: { kind: 'heart-dropper', interval: 4 },
  },
  'gold-bug': {
    id: 'gold-bug',
    name: 'Gold Bug',
    description: 'Familiar: a bug that follows you and drops a coin every 2 rooms.',
    modifiers: {},
    familiar: { kind: 'coin-dropper', interval: 2 },
  },
  'spectral-wisp': {
    id: 'spectral-wisp',
    name: 'Spectral Wisp',
    description: 'Familiar: a wisp that follows you and fires steady tears at enemies.',
    modifiers: {},
    familiar: { kind: 'wisp', damage: 2, fireInterval: 0.6, range: 5 },
  },
  'stone-owl': {
    id: 'stone-owl',
    name: 'Stone Owl',
    description: 'Familiar: a slow owl that fires heavy piercing shots at enemies.',
    modifiers: {},
    familiar: { kind: 'owl', damage: 5, fireInterval: 1.6, piercing: true, range: 7 },
  },
  'hornet-nest': {
    id: 'hornet-nest',
    name: 'Hornet Nest',
    description: 'Familiar: a hornet that sprays a rapid weak 3-tear spread at enemies.',
    modifiers: {},
    familiar: { kind: 'hornet', damage: 1, fireInterval: 0.5, shots: 3, range: 4 },
  },
  knife: {
    id: 'knife',
    name: "Mom's Knife",
    description: 'Replaces tears with a melee blade that points where you walk. Hold a fire direction to charge and extend it.',
    modifiers: {},
    knife: true,
  },
  // Orbital Fly — found in three copies, so a run can stack up to three flies.
  // They auto-space around the player (2 opposite, 3 at 120°).
  'orbital-fly-1': {
    id: 'orbital-fly-1',
    name: 'Orbital Fly',
    description: 'A fly that orbits you and blocks the occasional enemy shot.',
    modifiers: {},
    orbital: true,
  },
  'orbital-fly-2': {
    id: 'orbital-fly-2',
    name: 'Orbital Fly',
    description: 'A fly that orbits you and blocks the occasional enemy shot.',
    modifiers: {},
    orbital: true,
  },
  'orbital-fly-3': {
    id: 'orbital-fly-3',
    name: 'Orbital Fly',
    description: 'A fly that orbits you and blocks the occasional enemy shot.',
    modifiers: {},
    orbital: true,
  },
};

/** Pool of item ids that can drop, in a stable order (for deterministic picking). */
export const ITEM_POOL: readonly string[] = Object.keys(ITEMS).sort();

export function getItem(id: string): Item | undefined {
  return ITEMS[id];
}

/** Applies an item's modifiers to the player and records that it was collected. */
export function applyItem(player: MutableStats, item: Item): void {
  const m = item.modifiers;
  if (m.maxHp) {
    player.maxHp += m.maxHp;
    player.hp = Math.min(player.maxHp, player.hp + Math.max(0, m.maxHp));
  }
  if (m.speed) player.speed += m.speed;
  if (m.tearDamage) player.tearDamage += m.tearDamage;
  if (m.range) player.tearRange += m.range;
  if (m.fireRate) player.fireRate += m.fireRate;
  if (item.tearEffect) player.tearEffects.push(item.tearEffect);
  if (item.tearMods) {
    const t = item.tearMods;
    if (t.shotCount) player.shotCount += t.shotCount;
    if (t.piercing) player.piercing = true;
    if (t.homing) player.homing = true;
  }
  if (item.flying) player.flying = true;
  if (item.knife) player.knife = true;
  if (item.orbital) player.orbitals += 1;
  if (item.familiar) {
    const f = item.familiar;
    player.familiars.push({
      kind: f.kind,
      interval: f.interval ?? 0,
      roomTimer: 0,
      pos: { x: 0, y: 0 }, // snapped to the player on room entry
      fireCooldown: 0,
      damage: f.damage ?? 0,
      fireInterval: f.fireInterval ?? 0,
      shots: f.shots ?? 1,
      piercing: f.piercing ?? false,
      range: f.range ?? 4,
    });
  }
  player.items.push(item.id);
}
