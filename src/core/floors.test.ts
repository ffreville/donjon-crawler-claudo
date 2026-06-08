import { describe, expect, it } from 'vitest';
import { ENEMY_ARCHETYPES } from './entities.js';
import { createGame, descendToNextFloor, enterRoom, MAX_FLOORS, type GameState } from './gameState.js';

const firstNormalId = (s: GameState): number => {
  const r = [...s.dungeon.rooms.values()].find((room) => room.type === 'normal');
  if (!r) throw new Error('no normal room');
  return r.id;
};

describe('floors', () => {
  it('starts on floor 1', () => {
    expect(createGame(1).floor).toBe(1);
  });

  // Signature of a dungeon's spatial layout (room positions + types).
  const layout = (s: GameState): string =>
    [...s.dungeon.rooms.values()]
      .map((r) => `${r.id}:${r.gx},${r.gy},${r.type}`)
      .join('|');

  it('descending generates a different floor and preserves the player', () => {
    const s = createGame(7);
    s.player.hp = 4;
    s.player.items.push('sharp-tears');
    const floor1Layout = layout(s);

    descendToNextFloor(s);

    expect(s.floor).toBe(2);
    expect(s.player.hp).toBe(4); // HP carried over
    expect(s.player.items).toContain('sharp-tears'); // items carried over
    expect(layout(s)).not.toBe(floor1Layout); // genuinely a different floor
    expect(s.currentRoom).toBe(s.dungeon.startRoom);
  });

  it('scales enemy HP with the floor (per archetype)', () => {
    const s = createGame(7);
    enterRoom(s, firstNormalId(s));
    for (const e of s.enemies) {
      expect(e.maxHp).toBe(ENEMY_ARCHETYPES[e.kind].hp); // floor 1: base, +0
    }

    descendToNextFloor(s);
    enterRoom(s, firstNormalId(s));
    for (const e of s.enemies) {
      expect(e.maxHp).toBe(ENEMY_ARCHETYPES[e.kind].hp + 2); // floor 2: +2
    }
  });

  it('scales the boss HP with the floor', () => {
    const s = createGame(7);
    enterRoom(s, s.dungeon.bossRoom);
    expect(s.enemies[0]!.hp).toBe(30); // floor 1

    descendToNextFloor(s);
    enterRoom(s, s.dungeon.bossRoom);
    expect(s.enemies[0]!.hp).toBe(45); // floor 2: +15
  });

  it('floor generation is deterministic for a given seed', () => {
    const a = createGame(99);
    const b = createGame(99);
    descendToNextFloor(a);
    descendToNextFloor(b);
    expect([...a.dungeon.rooms.keys()]).toEqual([...b.dungeon.rooms.keys()]);
    expect(a.dungeon.bossRoom).toBe(b.dungeon.bossRoom);
  });

  it('has at least 2 floors configured', () => {
    expect(MAX_FLOORS).toBeGreaterThanOrEqual(2);
  });
});
