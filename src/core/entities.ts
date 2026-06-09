import type { Combatant, Vec2 } from './types.js';

/**
 * Behaviour archetype:
 * - chaser: walks straight at the player (the default melee threat)
 * - swarmer: fast and fragile
 * - shooter: keeps its distance and fires projectiles
 * - tank: slow, high HP, hits hard
 */
export type EnemyKind = 'chaser' | 'swarmer' | 'shooter' | 'tank' | 'boss';

/** A hostile entity. Behaviour is driven by `kind`. */
export interface Enemy extends Combatant {
  id: number;
  kind: EnemyKind;
  pos: Vec2;
  vel: Vec2;
  radius: number;
  /** Movement speed, in tiles per second. */
  speed: number;
  /** Damage dealt to the player on contact. */
  touchDamage: number;
  /** Seconds until this enemy can fire again (shooters only). */
  fireCooldown: number;
  /** Active status effects (burn, slow, ...). */
  effects: StatusEffect[];
  /** Decaying recoil velocity from being hit (tiles/second). */
  knockback: Vec2;
}

export type ProjectileSource = 'player' | 'enemy';

export type StatusKind = 'burn' | 'slow';

/** A status an item/projectile can apply on hit. */
export interface StatusSpec {
  kind: StatusKind;
  /** Seconds the effect lasts. */
  duration: number;
  /** burn: damage per second; slow: speed multiplier in (0, 1). */
  magnitude: number;
}

/** A status currently active on a combatant. */
export interface StatusEffect {
  kind: StatusKind;
  remaining: number;
  magnitude: number;
}

/** A moving damage carrier (a "tear"). Lives for `life` seconds or until it hits something. */
export interface Projectile {
  id: number;
  pos: Vec2;
  vel: Vec2;
  radius: number;
  damage: number;
  life: number;
  source: ProjectileSource;
  /** Statuses applied to the target on hit (player tears only). */
  applies: StatusSpec[];
  /** Passes through enemies instead of being consumed on first hit. */
  piercing: boolean;
  /** Curves toward the nearest enemy each tick. */
  homing: boolean;
  /** Enemy ids already damaged by this projectile (so a piercing tear hits each once). */
  hits: number[];
}

export type PickupKind = 'item' | 'heart' | 'coin';

interface PickupBase {
  id: number;
  pos: Vec2;
  radius: number;
}

/** A pickup that grants an item by id. `cost` > 0 means it must be bought (shop). */
export interface ItemPickup extends PickupBase {
  kind: 'item';
  itemId: string;
  cost: number;
}

/** A pickup that heals the player by `heal` HP. `cost` > 0 means it must be bought. */
export interface HeartPickup extends PickupBase {
  kind: 'heart';
  heal: number;
  cost: number;
}

/** A pickup that grants `value` coins. Always free to grab. */
export interface CoinPickup extends PickupBase {
  kind: 'coin';
  value: number;
}

/**
 * A collectible lying in a room, picked up on contact. Discriminated on `kind`
 * so the compiler guarantees the right payload fields are present.
 */
export type Pickup = ItemPickup | HeartPickup | CoinPickup;

export function makePickup(
  id: number,
  pos: Vec2,
  itemId: string,
  cost = 0,
  radius = 0.35,
): ItemPickup {
  return { id, pos: { x: pos.x, y: pos.y }, radius, kind: 'item', itemId, cost };
}

export function makeHeart(id: number, pos: Vec2, heal = 1, cost = 0, radius = 0.3): HeartPickup {
  return { id, pos: { x: pos.x, y: pos.y }, radius, kind: 'heart', heal, cost };
}

export function makeCoin(id: number, pos: Vec2, value = 1, radius = 0.25): CoinPickup {
  return { id, pos: { x: pos.x, y: pos.y }, radius, kind: 'coin', value };
}

export interface EnemyStats {
  kind?: EnemyKind;
  hp?: number;
  speed?: number;
  radius?: number;
  touchDamage?: number;
  attack?: number;
  defense?: number;
}

/** Base stats per archetype (before per-floor scaling). */
export const ENEMY_ARCHETYPES: Record<EnemyKind, Required<Omit<EnemyStats, 'kind'>>> = {
  chaser: { hp: 6, speed: 2.5, radius: 0.4, touchDamage: 1, attack: 0, defense: 0 },
  swarmer: { hp: 3, speed: 4.2, radius: 0.28, touchDamage: 1, attack: 0, defense: 0 },
  shooter: { hp: 5, speed: 1.8, radius: 0.4, touchDamage: 1, attack: 0, defense: 0 },
  tank: { hp: 14, speed: 1.2, radius: 0.6, touchDamage: 2, attack: 0, defense: 0 },
  boss: { hp: 30, speed: 1.5, radius: 0.7, touchDamage: 2, attack: 0, defense: 0 },
};

export function makeEnemy(id: number, pos: Vec2, stats: EnemyStats = {}): Enemy {
  const kind = stats.kind ?? 'chaser';
  const base = ENEMY_ARCHETYPES[kind];
  const hp = stats.hp ?? base.hp;
  return {
    id,
    kind,
    pos: { x: pos.x, y: pos.y },
    vel: { x: 0, y: 0 },
    radius: stats.radius ?? base.radius,
    speed: stats.speed ?? base.speed,
    touchDamage: stats.touchDamage ?? base.touchDamage,
    fireCooldown: 0,
    effects: [],
    knockback: { x: 0, y: 0 },
    hp,
    maxHp: hp,
    attack: stats.attack ?? base.attack,
    defense: stats.defense ?? base.defense,
  };
}

export function makeProjectile(
  id: number,
  pos: Vec2,
  vel: Vec2,
  damage: number,
  life: number,
  source: ProjectileSource,
  applies: StatusSpec[] = [],
  opts: { piercing?: boolean; homing?: boolean; radius?: number } = {},
): Projectile {
  return {
    id,
    pos: { x: pos.x, y: pos.y },
    vel: { x: vel.x, y: vel.y },
    radius: opts.radius ?? 0.15,
    damage,
    life,
    source,
    applies,
    piercing: opts.piercing ?? false,
    homing: opts.homing ?? false,
    hits: [],
  };
}
