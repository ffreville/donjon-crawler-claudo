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

/** A collectible item lying in a room. Picked up on contact with the player. */
export interface Pickup {
  id: number;
  pos: Vec2;
  itemId: string;
  radius: number;
}

export function makePickup(id: number, pos: Vec2, itemId: string, radius = 0.35): Pickup {
  return { id, pos: { x: pos.x, y: pos.y }, itemId, radius };
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
