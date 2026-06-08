/**
 * Items are declarative data: a set of stat modifiers applied to the player when
 * picked up. Keeping them as plain data (rather than code paths) makes them easy
 * to add, diff, and balance via headless simulation.
 */

export interface StatModifiers {
  /** Added to max HP; the player is also healed by this amount. */
  maxHp?: number;
  /** Added to movement speed, in tiles/second. */
  speed?: number;
  /** Added to projectile damage. */
  tearDamage?: number;
  /** Added to fire rate, in shots/second. */
  fireRate?: number;
}

export interface Item {
  id: string;
  name: string;
  description: string;
  modifiers: StatModifiers;
}

/** The player fields an item can mutate. `Player` is structurally compatible. */
export interface MutableStats {
  hp: number;
  maxHp: number;
  speed: number;
  tearDamage: number;
  fireRate: number;
  items: string[];
}

export const ITEMS: Record<string, Item> = {
  'sharp-tears': {
    id: 'sharp-tears',
    name: 'Sharp Tears',
    description: 'Your tears hit harder. +2 damage.',
    modifiers: { tearDamage: 2 },
  },
  'swift-boots': {
    id: 'swift-boots',
    name: 'Swift Boots',
    description: 'Move faster. +1.5 speed.',
    modifiers: { speed: 1.5 },
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
  if (m.fireRate) player.fireRate += m.fireRate;
  player.items.push(item.id);
}
