import { describe, expect, it } from 'vitest';
import {
  createGame,
  descendToNextFloor,
  enterRoom,
  FIXED_DT,
  MAX_FLOORS,
  NO_INPUT,
  tick,
  type GameState,
} from './gameState.js';
import { applyItem, ITEM_POOL, ITEMS, type MutableStats } from './items.js';

const baseStats = (over: Partial<MutableStats> = {}): MutableStats => ({
  hp: 6,
  maxHp: 6,
  speed: 6,
  tearDamage: 3,
  tearRange: 4,
  fireRate: 3,
  items: [],
  tearEffects: [],
  shotCount: 1,
  piercing: false,
  homing: false,
  flying: false,
  knife: false,
  orbitals: 0,
  familiars: [],
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
    expect(p.tearDamage).toBe(6); // base 3 + sharp-tears 3 (one-shots a 6-HP basic)
    expect(p.items).toEqual(['sharp-tears']);
  });

  it('range items extend tear range additively', () => {
    const p = baseStats({ tearRange: 4 });
    applyItem(p, ITEMS['spyglass']!); // +1
    expect(p.tearRange).toBe(5);
    applyItem(p, ITEMS['telescope']!); // +1.5
    expect(p.tearRange).toBe(6.5);
  });

  it('wings grant flight', () => {
    const p = baseStats();
    applyItem(p, ITEMS['wings']!);
    expect(p.flying).toBe(true);
    expect(p.items).toContain('wings');
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

describe('item bag (no duplicates per run)', () => {
  /** Every item id reserved for treasure/shop rooms across all floors of a run. */
  const offeredOverRun = (seed: number): string[] => {
    const s = createGame(seed);
    const seen: string[] = [];
    const collect = (): void => {
      for (const rt of s.roomRuntimes.values()) seen.push(...rt.offerItems);
    };
    collect();
    for (let f = 2; f <= MAX_FLOORS; f++) {
      descendToNextFloor(s);
      collect();
    }
    return seen;
  };

  it('never offers the same item twice in a run', () => {
    for (const seed of [1, 7, 42, 123, 999]) {
      const offered = offeredOverRun(seed);
      expect(new Set(offered).size).toBe(offered.length); // all distinct
      expect(offered.length).toBeLessThanOrEqual(ITEM_POOL.length); // bounded by the pool
    }
  });

  it('a collected item is not offered again later in the run', () => {
    const { seed, treasureId } = gameWithTreasure();
    const s = createGame(seed);
    enterRoom(s, treasureId);
    const itemId = currentItemId(s);
    tick(s, NO_INPUT, FIXED_DT); // pick it up
    expect(s.player.items).toContain(itemId);

    // It must not resurface in any later floor's offers.
    const laterOffers: string[] = [];
    for (let f = s.floor + 1; f <= MAX_FLOORS; f++) {
      descendToNextFloor(s);
      for (const rt of s.roomRuntimes.values()) laterOffers.push(...rt.offerItems);
    }
    expect(laterOffers).not.toContain(itemId);
  });
});
