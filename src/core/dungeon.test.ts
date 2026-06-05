import { describe, expect, it } from 'vitest';
import { generateDungeon, isConnected } from './dungeon.js';
import { Rng } from './rng.js';

describe('generateDungeon', () => {
  it('produces the requested number of rooms', () => {
    const d = generateDungeon(new Rng(1), { roomCount: 8, mapSize: 9 });
    expect(d.rooms.size).toBe(8);
  });

  it('is fully connected from the start room', () => {
    for (let seed = 0; seed < 50; seed++) {
      const d = generateDungeon(new Rng(seed), { roomCount: 10, mapSize: 11 });
      expect(isConnected(d)).toBe(true);
    }
  });

  it('always has a start and a distinct boss room', () => {
    const d = generateDungeon(new Rng(123), { roomCount: 8, mapSize: 9 });
    expect(d.rooms.get(d.startRoom)?.type).toBe('start');
    expect(d.bossRoom).not.toBe(d.startRoom);
    expect(d.rooms.get(d.bossRoom)?.type).toBe('boss');
  });

  it('is deterministic for a given seed', () => {
    const a = generateDungeon(new Rng(777), { roomCount: 9, mapSize: 9 });
    const b = generateDungeon(new Rng(777), { roomCount: 9, mapSize: 9 });
    expect([...a.rooms.keys()]).toEqual([...b.rooms.keys()]);
    expect(a.bossRoom).toBe(b.bossRoom);
  });

  it('places a shop on an eligible leaf, distinct from start/boss/treasure', () => {
    // Scan seeds for a floor where a shop is placed, then assert its invariants.
    // With a roomy map most seeds leave at least two free leaves.
    let foundShop = false;
    for (let seed = 0; seed < 50; seed++) {
      const d = generateDungeon(new Rng(seed), { roomCount: 12, mapSize: 11 });
      const shops = [...d.rooms.values()].filter((r) => r.type === 'shop');
      if (shops.length === 0) continue;
      foundShop = true;

      // At most one shop per floor.
      expect(shops.length).toBe(1);
      const shop = shops[0]!;

      // Distinct from start and boss.
      expect(shop.id).not.toBe(d.startRoom);
      expect(shop.id).not.toBe(d.bossRoom);

      // Distinct from the treasure room (no overlap in type).
      expect(shop.type).toBe('shop');
      expect(d.rooms.get(d.startRoom)?.type).toBe('start');
      expect(d.rooms.get(d.bossRoom)?.type).toBe('boss');

      // A shop is a leaf room (exactly one neighbor).
      expect(shop.neighbors.length).toBe(1);
    }
    expect(foundShop).toBe(true);
  });

  it('places at least one shop on a roomy floor', () => {
    const d = generateDungeon(new Rng(2), { roomCount: 12, mapSize: 11 });
    const shops = [...d.rooms.values()].filter((r) => r.type === 'shop');
    expect(shops.length).toBe(1);
  });

  it('shop placement is deterministic for a given seed', () => {
    const a = generateDungeon(new Rng(2), { roomCount: 12, mapSize: 11 });
    const b = generateDungeon(new Rng(2), { roomCount: 12, mapSize: 11 });
    const shopA = [...a.rooms.values()].find((r) => r.type === 'shop')?.id;
    const shopB = [...b.rooms.values()].find((r) => r.type === 'shop')?.id;
    expect(shopA).toBe(shopB);
    expect(shopA).not.toBeUndefined();
  });

  it('never produces more than one shop, treasure, or boss', () => {
    for (let seed = 0; seed < 50; seed++) {
      const d = generateDungeon(new Rng(seed), { roomCount: 10, mapSize: 11 });
      const count = (t: string): number =>
        [...d.rooms.values()].filter((r) => r.type === t).length;
      expect(count('boss')).toBeLessThanOrEqual(1);
      expect(count('treasure')).toBeLessThanOrEqual(1);
      expect(count('shop')).toBeLessThanOrEqual(1);
    }
  });

  it('neighbor links are symmetric', () => {
    const d = generateDungeon(new Rng(55), { roomCount: 12, mapSize: 11 });
    for (const room of d.rooms.values()) {
      for (const n of room.neighbors) {
        expect(d.rooms.get(n)?.neighbors).toContain(room.id);
      }
    }
  });
});
