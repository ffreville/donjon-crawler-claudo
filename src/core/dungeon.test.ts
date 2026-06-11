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

  const countByType = (d: ReturnType<typeof generateDungeon>, t: string): number =>
    [...d.rooms.values()].filter((r) => r.type === t).length;

  it('guarantees one boss, one shop, one mini-boss, and 1–2 treasures per floor', () => {
    for (let seed = 0; seed < 40; seed++) {
      const d = generateDungeon(new Rng(seed), { roomCount: 12, mapSize: 11 });
      expect(countByType(d, 'start')).toBe(1);
      expect(countByType(d, 'boss')).toBe(1);
      expect(countByType(d, 'shop')).toBe(1);
      expect(countByType(d, 'miniboss')).toBe(1);
      const treasures = countByType(d, 'treasure');
      expect(treasures).toBeGreaterThanOrEqual(1);
      expect(treasures).toBeLessThanOrEqual(2);
    }
  });

  it('honors requested treasure and mini-boss counts', () => {
    const d = generateDungeon(new Rng(1), {
      roomCount: 18,
      mapSize: 13,
      treasureRooms: 3,
      minibossRooms: 2,
    });
    expect(countByType(d, 'treasure')).toBe(3);
    expect(countByType(d, 'miniboss')).toBe(2);
    expect(countByType(d, 'shop')).toBe(1);
    expect(countByType(d, 'boss')).toBe(1);
  });

  it('special rooms are distinct and never the start; bossRoom is the boss', () => {
    const d = generateDungeon(new Rng(7), { roomCount: 12, mapSize: 11 });
    const specials = [...d.rooms.values()].filter((r) => r.type !== 'normal' && r.type !== 'start');
    const ids = specials.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length); // no room has two roles
    expect(ids).not.toContain(d.startRoom);
    expect(d.rooms.get(d.bossRoom)?.type).toBe('boss');
  });

  it('degrades gracefully on a tiny floor (no crash, still one start and boss)', () => {
    const d = generateDungeon(new Rng(0), { roomCount: 4, mapSize: 7 });
    expect(countByType(d, 'start')).toBe(1);
    expect(countByType(d, 'boss')).toBe(1);
    expect(isConnected(d)).toBe(true);
  });

  it('special-room layout is deterministic for a given seed', () => {
    const sig = (d: ReturnType<typeof generateDungeon>): string =>
      [...d.rooms.values()].map((r) => `${r.id}:${r.type}`).join('|');
    expect(sig(generateDungeon(new Rng(3), { roomCount: 12, mapSize: 11 }))).toBe(
      sig(generateDungeon(new Rng(3), { roomCount: 12, mapSize: 11 })),
    );
  });

  it('special rooms (boss/miniboss/shop/treasure) each have exactly one door', () => {
    for (let seed = 0; seed < 40; seed++) {
      const d = generateDungeon(new Rng(seed), { roomCount: 12, mapSize: 11 });
      for (const room of d.rooms.values()) {
        if (room.type === 'normal' || room.type === 'start') continue;
        expect(room.neighbors).toHaveLength(1);
      }
    }
  });

  it('keeps specials single-door even with scaled-up counts', () => {
    const d = generateDungeon(new Rng(11), {
      roomCount: 20,
      mapSize: 13,
      treasureRooms: 3,
      minibossRooms: 2,
    });
    for (const room of d.rooms.values()) {
      if (room.type !== 'normal' && room.type !== 'start') {
        expect(room.neighbors).toHaveLength(1);
      }
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
