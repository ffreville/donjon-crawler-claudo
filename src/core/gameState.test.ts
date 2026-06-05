import { describe, expect, it } from 'vitest';
import { createGame, movePlayer } from './gameState.js';

describe('gameState', () => {
  it('starts the player in the start room, away from walls', () => {
    const s = createGame(1);
    expect(s.currentRoom).toBe(s.dungeon.startRoom);
    expect(s.player.pos).toEqual({ x: 7, y: 4 });
  });

  it('moves the player into open tiles', () => {
    const s = createGame(1);
    const moved = movePlayer(s, 'left');
    expect(moved).toBe(true);
    expect(s.player.pos).toEqual({ x: 6, y: 4 });
  });

  it('refuses to move into a wall', () => {
    const s = createGame(1);
    // Walk all the way to the left wall, then one more step must fail.
    while (movePlayer(s, 'left')) {
      /* keep going */
    }
    expect(s.player.pos.x).toBe(1); // last open column before the border wall
    expect(movePlayer(s, 'left')).toBe(false);
  });

  it('is reproducible from a seed', () => {
    const a = createGame(2025);
    const b = createGame(2025);
    expect(a.player.pos).toEqual(b.player.pos);
    expect([...a.dungeon.rooms.keys()]).toEqual([...b.dungeon.rooms.keys()]);
  });
});
