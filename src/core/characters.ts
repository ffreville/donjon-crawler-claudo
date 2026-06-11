/**
 * Playable characters. Pure data: a character is a set of absolute base-stat
 * overrides plus optional starting gear (passive/familiar items, one active item,
 * and starting currency). `applyCharacter` in gameState turns this into a player.
 *
 * Balance note: these are deliberately rough first-pass numbers, meant to be
 * tuned. The default (wanderer) leaves the base stats untouched.
 */

/** Absolute base-stat overrides (replace the defaults when present). */
export interface CharacterStats {
  maxHp?: number;
  speed?: number;
  tearDamage?: number;
  tearRange?: number;
  fireRate?: number;
  shotCount?: number;
}

export interface Character {
  id: string;
  name: string;
  /** One-line pitch shown on the select screen. */
  blurb: string;
  stats?: CharacterStats;
  /** Starting passive / familiar item ids, applied in order. */
  items?: string[];
  /** Starting active item id (held, fully charged). */
  activeItem?: string;
  /** Starting coins / keys. */
  coins?: number;
  keys?: number;
}

export const CHARACTERS: readonly Character[] = [
  {
    id: 'wanderer',
    name: 'The Wanderer',
    blurb: 'A balanced, no-frills start. Good to learn the ropes.',
    // Every character starts with a Spyglass (+1 range).
    items: ['spyglass'],
  },
  {
    id: 'brute',
    name: 'The Brute',
    blurb: 'Tough and hard-hitting. Now wields the Knife (testing).',
    stats: { maxHp: 8, tearDamage: 5, speed: 5, tearRange: 3 },
    // TEMP: the Knife is here only to test it from character select. Remove before v1.
    items: ['spyglass', 'knife'],
  },
  {
    id: 'scout',
    name: 'The Scout',
    blurb: 'Fast and far-reaching, but fragile and light-hitting.',
    stats: { maxHp: 4, speed: 7.5, tearRange: 7, tearDamage: 2 },
    items: ['spyglass'],
  },
  {
    id: 'tinker',
    name: 'The Tinker',
    blurb: 'Quicker trigger, and starts holding a Reroll Die.',
    stats: { maxHp: 5, fireRate: 4 },
    items: ['spyglass'],
    activeItem: 'reroll-die',
    coins: 3,
  },
  {
    id: 'hoarder',
    name: 'The Hoarder',
    blurb: 'Starts with a Flying Key familiar, some coins and a key.',
    stats: { maxHp: 5 },
    items: ['flying-key', 'spyglass'],
    coins: 4,
    keys: 1,
  },
  {
    id: 'gemini',
    name: 'The Twins',
    blurb: 'Fires two tears at once, but each one hits lighter.',
    stats: { maxHp: 5, shotCount: 2, tearDamage: 2 },
    items: ['spyglass'],
  },
  {
    id: 'ember',
    name: 'The Pyromancer',
    blurb: 'Tears set foes ablaze — but their direct hit is weak.',
    stats: { maxHp: 5, tearDamage: 2 },
    items: ['fire-tears', 'spyglass'],
  },
  {
    id: 'wraith',
    name: 'The Wraith',
    blurb: 'Floats over every floor trap, but is frail.',
    stats: { maxHp: 4, speed: 6.5 },
    items: ['wings', 'spyglass'],
  },
] as const;

export const DEFAULT_CHARACTER_ID = 'wanderer';

export function getCharacter(id: string | undefined): Character | undefined {
  return CHARACTERS.find((c) => c.id === id);
}
