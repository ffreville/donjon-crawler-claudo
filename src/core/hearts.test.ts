import { describe, expect, it } from 'vitest';
import { makeHeart } from './entities.js';
import { createGame, enterRoom, FIXED_DT, NO_INPUT, tick, type GameState } from './gameState.js';

const firstNormalId = (s: GameState): number => {
  const r = [...s.dungeon.rooms.values()].find((room) => room.type === 'normal');
  if (!r) throw new Error('no normal room');
  return r.id;
};

/** Clears the first normal room and reports whether a heart dropped. */
const clearedDropsHeart = (seed: number): boolean => {
  const s = createGame(seed);
  enterRoom(s, firstNormalId(s));
  s.enemies.length = 0; // kill everything
  tick(s, NO_INPUT, FIXED_DT); // room clears this tick
  return s.pickups.some((p) => p.kind === 'heart');
};

describe('hearts', () => {
  it('heals 1 HP when collected below max', () => {
    const s = createGame(1);
    s.player.hp = 3;
    s.pickups.push(makeHeart(999, { x: s.player.pos.x, y: s.player.pos.y }));
    tick(s, NO_INPUT, FIXED_DT);
    expect(s.player.hp).toBe(4);
    expect(s.pickups).toHaveLength(0);
  });

  it('is left on the ground when the player is at full HP', () => {
    const s = createGame(1);
    s.player.hp = s.player.maxHp;
    s.pickups.push(makeHeart(999, { x: s.player.pos.x, y: s.player.pos.y }));
    tick(s, NO_INPUT, FIXED_DT);
    expect(s.player.hp).toBe(s.player.maxHp);
    expect(s.pickups).toHaveLength(1); // not consumed
  });

  it('never heals past max HP', () => {
    const s = createGame(1);
    s.player.hp = s.player.maxHp - 1;
    s.pickups.push(makeHeart(999, { x: s.player.pos.x, y: s.player.pos.y }, 5));
    tick(s, NO_INPUT, FIXED_DT);
    expect(s.player.hp).toBe(s.player.maxHp);
  });

  it('drops from cleared rooms by chance: sometimes, but not always', () => {
    let drops = 0;
    for (let seed = 1; seed <= 60; seed++) if (clearedDropsHeart(seed)) drops++;
    expect(drops).toBeGreaterThan(0);
    expect(drops).toBeLessThan(60);
  });

  it('the drop roll is deterministic for a given seed', () => {
    expect(clearedDropsHeart(5)).toBe(clearedDropsHeart(5));
    expect(clearedDropsHeart(42)).toBe(clearedDropsHeart(42));
  });
});
