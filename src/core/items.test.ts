import { describe, expect, it } from 'vitest';
import { createGame, enterRoom, FIXED_DT, NO_INPUT, tick, type GameState } from './gameState.js';
import { applyItem, ITEMS, type MutableStats } from './items.js';

const baseStats = (over: Partial<MutableStats> = {}): MutableStats => ({
  hp: 6,
  maxHp: 6,
  speed: 6,
  tearDamage: 3,
  fireRate: 3,
  items: [],
  ...over,
});

/** Reads the itemId of the (item) pickup currently in the room. */
const currentItemId = (s: GameState): string => {
  const p = s.pickups[0];
  if (!p || p.kind !== 'item') throw new Error('expected an item pickup');
  return p.itemId;
};

/** Finds a seed whose dungeon contains a treasure room. */
const gameWithTreasure = (): { seed: number; treasureId: number } => {
  for (let seed = 1; seed < 300; seed++) {
    const s = createGame(seed);
    const t = [...s.dungeon.rooms.values()].find((r) => r.type === 'treasure');
    if (t) return { seed, treasureId: t.id };
  }
  throw new Error('no treasure room found in seeds 1..299');
};

describe('applyItem', () => {
  it('adds flat stat modifiers', () => {
    const p = baseStats();
    applyItem(p, ITEMS['sharp-tears']!);
    expect(p.tearDamage).toBe(5);
    expect(p.items).toEqual(['sharp-tears']);
  });

  it('raises max HP and heals by the same amount', () => {
    const p = baseStats({ hp: 4, maxHp: 6 });
    applyItem(p, ITEMS['vitality']!);
    expect(p.maxHp).toBe(8);
    expect(p.hp).toBe(6);
  });

  it('never overheals past the new max', () => {
    const p = baseStats({ hp: 6, maxHp: 6 });
    applyItem(p, ITEMS['vitality']!);
    expect(p.hp).toBe(8); // 6 + 2, capped at new max 8
    expect(p.hp).toBeLessThanOrEqual(p.maxHp);
  });
});

describe('treasure pickups', () => {
  it('spawns exactly one pickup in a treasure room', () => {
    const { seed, treasureId } = gameWithTreasure();
    const s = createGame(seed);
    enterRoom(s, treasureId);
    expect(s.pickups).toHaveLength(1);
  });

  it('is collected on contact and grants its item', () => {
    const { seed, treasureId } = gameWithTreasure();
    const s: GameState = createGame(seed);
    enterRoom(s, treasureId); // player arrives at room center, on the pickup
    const itemId = currentItemId(s);
    tick(s, NO_INPUT, FIXED_DT);
    expect(s.pickups).toHaveLength(0);
    expect(s.player.items).toContain(itemId);
  });

  it('offers a deterministic item for a given seed', () => {
    const { seed, treasureId } = gameWithTreasure();
    const a = createGame(seed);
    const b = createGame(seed);
    enterRoom(a, treasureId);
    enterRoom(b, treasureId);
    expect(currentItemId(a)).toBe(currentItemId(b));
  });
});
