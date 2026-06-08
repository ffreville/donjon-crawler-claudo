import type { Combatant, Vec2 } from './types.js';

/**
 * Behaviour archetype:
 * - chaser: walks straight at the player (the default melee threat)
 * - swarmer: fast and fragile
 * - shooter: keeps its distance and fires projectiles
 * - tank: slow, high HP, hits hard
 */
export type EnemyKind = 'chaser' | 'swarmer' | 'shooter' | 'tank';

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
}

export type ProjectileSource = 'player' | 'enemy';

/** A moving damage carrier (a "tear"). Lives for `life` seconds or until it hits something. */
export interface Projectile {
  id: number;
  pos: Vec2;
  vel: Vec2;
  radius: number;
  damage: number;
  life: number;
  source: ProjectileSource;
}

export type PickupKind = 'item' | 'heart';

interface PickupBase {
  id: number;
  pos: Vec2;
  radius: number;
}

/** A pickup that grants an item by id. */
export interface ItemPickup extends PickupBase {
  kind: 'item';
  itemId: string;
}

/** A pickup that heals the player by `heal` HP. */
export interface HeartPickup extends PickupBase {
  kind: 'heart';
  heal: number;
}

/**
 * A collectible lying in a room, picked up on contact. Discriminated on `kind`
 * so the compiler guarantees `itemId` / `heal` are present for the right kind.
 */
export type Pickup = ItemPickup | HeartPickup;

export function makePickup(id: number, pos: Vec2, itemId: string, radius = 0.35): ItemPickup {
  return { id, pos: { x: pos.x, y: pos.y }, radius, kind: 'item', itemId };
}

export function makeHeart(id: number, pos: Vec2, heal = 1, radius = 0.3): HeartPickup {
  return { id, pos: { x: pos.x, y: pos.y }, radius, kind: 'heart', heal };
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
  radius = 0.15,
): Projectile {
  return {
    id,
    pos: { x: pos.x, y: pos.y },
    vel: { x: vel.x, y: vel.y },
    radius,
    damage,
    life,
    source,
  };
}
