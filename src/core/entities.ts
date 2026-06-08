import type { Combatant, Vec2 } from './types.js';

/** A hostile entity that chases the player and deals contact damage. */
export interface Enemy extends Combatant {
  id: number;
  pos: Vec2;
  vel: Vec2;
  radius: number;
  /** Chase speed, in tiles per second. */
  speed: number;
  /** Damage dealt to the player on contact. */
  touchDamage: number;
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
  hp?: number;
  speed?: number;
  radius?: number;
  touchDamage?: number;
  attack?: number;
  defense?: number;
}

export function makeEnemy(id: number, pos: Vec2, stats: EnemyStats = {}): Enemy {
  const hp = stats.hp ?? 6;
  return {
    id,
    pos: { x: pos.x, y: pos.y },
    vel: { x: 0, y: 0 },
    radius: stats.radius ?? 0.4,
    speed: stats.speed ?? 2.5,
    touchDamage: stats.touchDamage ?? 1,
    hp,
    maxHp: hp,
    attack: stats.attack ?? 0,
    defense: stats.defense ?? 0,
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
