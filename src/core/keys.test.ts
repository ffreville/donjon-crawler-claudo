import { describe, expect, it } from 'vitest';
import { makeKey } from './entities.js';
import { createGame, enterRoom, FIXED_DT, NO_INPUT, tick, type GameState } from './gameState.js';

const firstNormalId = (s: GameState): number => {
  const r = [...s.dungeon.rooms.values()].find((room) => room.type === 'normal');
  if (!r) throw new Error('no normal room');
  return r.id;
};

/** Clears the first normal room and reports whether a key dropped. */
const clearDropsKey = (seed: number): boolean => {
  const s = createGame(seed);
  enterRoom(s, firstNormalId(s));
  s.enemies.length = 0;
  tick(s, NO_INPUT, FIXED_DT);
  return s.pickups.some((p) => p.kind === 'key');
};

describe('keys', () => {
  it('start at zero and persist across floors via the player', () => {
    expect(createGame(1).player.keys).toBe(0);
  });

  it('are collected on contact, one at a time', () => {
    const s = createGame(1, { enemyCount: 0 });
    s.pickups.push(makeKey(999, { x: s.player.pos.x, y: s.player.pos.y }));
    tick(s, NO_INPUT, FIXED_DT);
    expect(s.player.keys).toBe(1);
    expect(s.pickups.some((p) => p.kind === 'key')).toBe(false);
  });

  it('drop from cleared combat rooms by chance (sometimes, not always)', () => {
    let dropped = 0;
    for (let seed = 1; seed <= 60; seed++) if (clearDropsKey(seed)) dropped++;
    expect(dropped).toBeGreaterThan(0);
    expect(dropped).toBeLessThan(60);
  });

  it('the drop roll is deterministic for a given seed', () => {
    expect(clearDropsKey(5)).toBe(clearDropsKey(5));
    expect(clearDropsKey(42)).toBe(clearDropsKey(42));
  });
});
