import { describe, expect, it } from 'vitest';
import {
  createGame,
  enterRoom,
  FIXED_DT,
  NO_INPUT,
  tick,
  type GameState,
} from './gameState.js';
import { applyItem, ITEMS } from './items.js';
import { makeEnemy } from './entities.js';
import { ROOM_H, ROOM_W } from './room.js';

/** The familiar key-drop spot (gameState drops it right of center). */
const DROP_X = ROOM_W / 2 + 2;
const isFamiliarKey = (p: { kind: string; pos: { x: number } }): boolean =>
  p.kind === 'key' && Math.abs(p.pos.x - DROP_X) < 0.01;

/** Distinct normal-room ids, in order, for clearing several rooms in a row. */
const normalRoomIds = (s: GameState): number[] =>
  [...s.dungeon.rooms.values()].filter((r) => r.type === 'normal').map((r) => r.id);

/** Enters `roomId`, removes its enemies, and ticks once to clear it. */
const clearRoom = (s: GameState, roomId: number): void => {
  enterRoom(s, roomId);
  s.enemies.length = 0;
  tick(s, NO_INPUT, FIXED_DT);
};

describe('familiars', () => {
  it('the Flying Key item grants a key-dropper familiar', () => {
    const s = createGame(1, { enemyCount: 0 });
    applyItem(s.player, ITEMS['flying-key']!);
    expect(s.player.familiars).toHaveLength(1);
    expect(s.player.familiars[0]!.kind).toBe('key-dropper');
    expect(s.player.items).toContain('flying-key'); // also logged
  });

  it('drops a key every `interval` cleared rooms, and not before', () => {
    const s = createGame(1);
    applyItem(s.player, ITEMS['flying-key']!);
    const interval = s.player.familiars[0]!.interval;
    const rooms = normalRoomIds(s);
    expect(rooms.length).toBeGreaterThanOrEqual(interval);

    // Clear rooms one short of the interval: the familiar has not dropped yet.
    for (let i = 0; i < interval - 1; i++) {
      clearRoom(s, rooms[i]!);
      expect(s.pickups.some(isFamiliarKey)).toBe(false);
      expect(s.player.familiars[0]!.roomTimer).toBe(i + 1);
    }
    // The interval-th clear drops a familiar key and resets the timer.
    clearRoom(s, rooms[interval - 1]!);
    expect(s.pickups.some(isFamiliarKey)).toBe(true);
    expect(s.player.familiars[0]!.roomTimer).toBe(0);
  });

  it('the Beating Heart drops a heart every 4 rooms', () => {
    const s = createGame(1);
    applyItem(s.player, ITEMS['beating-heart']!);
    const interval = s.player.familiars[0]!.interval;
    const rooms = normalRoomIds(s);
    expect(rooms.length).toBeGreaterThanOrEqual(interval);
    const isFamHeart = (p: { kind: string; pos: { y: number } }): boolean =>
      p.kind === 'heart' && Math.abs(p.pos.y - (ROOM_H / 2 - 2)) < 0.01;

    for (let i = 0; i < interval - 1; i++) {
      clearRoom(s, rooms[i]!);
      expect(s.pickups.some(isFamHeart)).toBe(false);
    }
    clearRoom(s, rooms[interval - 1]!);
    expect(s.pickups.some(isFamHeart)).toBe(true);
  });

  it('the Gold Bug drops a coin every 2 rooms', () => {
    const s = createGame(1);
    applyItem(s.player, ITEMS['gold-bug']!);
    const interval = s.player.familiars[0]!.interval;
    const rooms = normalRoomIds(s);
    const isFamCoin = (p: { kind: string; pos: { y: number } }): boolean =>
      p.kind === 'coin' && Math.abs(p.pos.y - (ROOM_H / 2 + 2)) < 0.01;

    for (let i = 0; i < interval - 1; i++) {
      clearRoom(s, rooms[i]!);
      expect(s.pickups.some(isFamCoin)).toBe(false);
    }
    clearRoom(s, rooms[interval - 1]!);
    expect(s.pickups.some(isFamCoin)).toBe(true);
  });

  it('is deterministic across two identical runs', () => {
    const run = (): number => {
      const s = createGame(7);
      applyItem(s.player, ITEMS['flying-key']!);
      const rooms = normalRoomIds(s).slice(0, s.player.familiars[0]!.interval);
      for (const id of rooms) clearRoom(s, id);
      return s.pickups.filter(isFamiliarKey).length;
    };
    expect(run()).toBe(run());
  });
});

describe('shooting familiars', () => {
  /** A safe room with the given familiar and one stationary enemy at dx tiles. */
  const arena = (itemId: string, dx: number, hp = 100) => {
    const s = createGame(1, { enemyCount: 0 });
    s.graceTimer = 0;
    applyItem(s.player, ITEMS[itemId]!);
    const e = makeEnemy(99, { x: s.player.pos.x + dx, y: s.player.pos.y }, { hp });
    e.speed = 0;
    s.enemies.push(e);
    return { s, e };
  };

  it('the Spectral Wisp grants a shooting familiar', () => {
    const s = createGame(1, { enemyCount: 0 });
    applyItem(s.player, ITEMS['spectral-wisp']!);
    expect(s.player.familiars[0]!.kind).toBe('wisp');
    expect(s.player.familiars[0]!.damage).toBeGreaterThan(0);
  });

  it('fires at a nearby enemy and damages it over time', () => {
    const { s, e } = arena('spectral-wisp', 2);
    for (let i = 0; i < 150; i++) tick(s, NO_INPUT, FIXED_DT);
    expect(e.hp).toBeLessThan(100);
  });

  it('holds fire when the only enemy is out of range', () => {
    const { s, e } = arena('spectral-wisp', 12); // wisp range is 5
    for (let i = 0; i < 150; i++) tick(s, NO_INPUT, FIXED_DT);
    expect(e.hp).toBe(100);
  });

  it("the Stone Owl's heavy shot kills a low-HP enemy", () => {
    const { s } = arena('stone-owl', 3, 5); // owl deals 5, enemy has 5 HP
    for (let i = 0; i < 150 && s.enemies.length > 0; i++) tick(s, NO_INPUT, FIXED_DT);
    expect(s.enemies).toHaveLength(0);
  });

  it('the Hornet Nest sprays and chips a nearby enemy', () => {
    const { s, e } = arena('hornet-nest', 2);
    for (let i = 0; i < 120; i++) tick(s, NO_INPUT, FIXED_DT);
    expect(e.hp).toBeLessThan(100);
  });
});
