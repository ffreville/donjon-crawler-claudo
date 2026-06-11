import { describe, expect, it } from 'vitest';
import type { Door } from './types.js';
import { doorWorldPos } from './room.js';
import {
  createGame,
  descendToNextFloor,
  enterRoom,
  FIXED_DT,
  isDoorLocked,
  NO_INPUT,
  tick,
  type GameState,
} from './gameState.js';

/**
 * Finds a cleared room that has a locked door (one leading into a shop or
 * treasure) and leaves the game parked in it with doors open.
 */
const roomWithLockedDoor = (): { s: GameState; door: Door } => {
  for (let seed = 1; seed < 300; seed++) {
    const s = createGame(seed);
    for (const room of [...s.dungeon.rooms.values()]) {
      if (room.type !== 'normal' && room.type !== 'start') continue;
      enterRoom(s, room.id);
      s.enemies.length = 0; // simulate clearing it
      tick(s, NO_INPUT, FIXED_DT); // opens the unlocked doors
      const door = s.doors.find((d) => isDoorLocked(s, d));
      if (door) return { s, door };
    }
  }
  throw new Error('no locked door found in seeds 1..299');
};

describe('locked doors', () => {
  it('shop and treasure rooms are locked by default', () => {
    const s = createGame(1);
    for (const room of s.dungeon.rooms.values()) {
      if (room.type === 'shop' || room.type === 'treasure') {
        // The room's single door, seen from its neighbour, is locked.
        const neighbourId = room.neighbors[0]!;
        enterRoom(s, neighbourId);
        const door = s.doors.find((d) => d.to === room.id);
        expect(door && isDoorLocked(s, door)).toBe(true);
      }
    }
  });

  it('cannot be passed without a key', () => {
    const { s, door } = roomWithLockedDoor();
    s.player.keys = 0;
    const here = s.currentRoom;
    s.player.pos = doorWorldPos(s.grid, door.dir); // right on the opening
    tick(s, NO_INPUT, FIXED_DT);
    expect(s.currentRoom).toBe(here); // still locked out
  });

  it('a key opens the door and lets the player through', () => {
    const { s, door } = roomWithLockedDoor();
    const dest = door.to;
    s.player.keys = 1;
    s.player.pos = doorWorldPos(s.grid, door.dir);
    tick(s, NO_INPUT, FIXED_DT);
    expect(s.player.keys).toBe(0); // key spent
    expect(s.unlocked.has(dest)).toBe(true);
    expect(s.currentRoom).toBe(dest); // walked through the same tick
  });

  it('the door stays open afterwards (key is not re-charged)', () => {
    const { s, door } = roomWithLockedDoor();
    const opener = s.currentRoom;
    const dest = door.to;
    s.player.keys = 1;
    s.player.pos = doorWorldPos(s.grid, door.dir);
    tick(s, NO_INPUT, FIXED_DT); // through to the special room

    // Leave back to the opener room — that door is never locked, no key needed.
    const back = s.doors.find((d) => d.to === opener)!;
    expect(isDoorLocked(s, back)).toBe(false);
    s.player.pos = doorWorldPos(s.grid, back.dir);
    tick(s, NO_INPUT, FIXED_DT);
    expect(s.currentRoom).toBe(opener);

    // Re-enter the special room: it's unlocked now, still free.
    const again = s.doors.find((d) => d.to === dest)!;
    expect(isDoorLocked(s, again)).toBe(false);
    expect(s.player.keys).toBe(0);
  });

  it('locks reset on a new floor', () => {
    const { s, door } = roomWithLockedDoor();
    s.player.keys = 1;
    s.player.pos = doorWorldPos(s.grid, door.dir);
    tick(s, NO_INPUT, FIXED_DT);
    expect(s.unlocked.size).toBeGreaterThan(0);
    descendToNextFloor(s); // rebuilds the dungeon; unlocked must be cleared
    expect(s.unlocked.size).toBe(0);
  });
});
