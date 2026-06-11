import { describe, expect, it } from 'vitest';
import {
  createGame,
  enterRoom,
  FIXED_DT,
  isDoorLocked,
  NO_INPUT,
  tick,
  type GameState,
} from './gameState.js';
import { doorWorldPos } from './room.js';

const firstNormalRoom = (s: GameState): number => {
  const r = [...s.dungeon.rooms.values()].find((room) => room.type === 'normal');
  if (!r) throw new Error('no normal room in this dungeon');
  return r.id;
};

describe('room navigation', () => {
  it('starts in an open, empty start room with doors', () => {
    const s = createGame(1);
    expect(s.enemies).toHaveLength(0);
    expect(s.doorsOpen).toBe(true);
    expect(s.doors.length).toBeGreaterThan(0);
  });

  it('locks the doors and spawns enemies when entering a combat room', () => {
    const s = createGame(123);
    const id = firstNormalRoom(s);
    enterRoom(s, id);
    expect(s.currentRoom).toBe(id);
    expect(s.enemies.length).toBeGreaterThan(0);
    expect(s.doorsOpen).toBe(false);
  });

  it('opens the doors once the room is cleared', () => {
    const s = createGame(123);
    enterRoom(s, firstNormalRoom(s));
    expect(s.doorsOpen).toBe(false);
    s.enemies.length = 0; // simulate killing every enemy
    tick(s, NO_INPUT, FIXED_DT);
    expect(s.doorsOpen).toBe(true);
    expect(s.dungeon.rooms.get(s.currentRoom)?.cleared).toBe(true);
  });

  it('transitions to a neighbor when the player reaches an open door', () => {
    const s = createGame(1);
    expect(s.doorsOpen).toBe(true);
    // Pick an unlocked exit (shop/treasure doors stay shut without a key).
    const door = s.doors.find((d) => !isDoorLocked(s, d)) ?? s.doors[0]!;
    const opening = doorWorldPos(s.grid, door.dir);
    s.player.pos = { x: opening.x, y: opening.y };
    tick(s, NO_INPUT, FIXED_DT);
    expect(s.currentRoom).toBe(door.to);
    // Player is repositioned inside the new room, not left on the doorway.
    expect(s.player.pos).not.toEqual(opening);
  });

  it('transitions when slightly off-center in the doorway', () => {
    const s = createGame(1);
    const door = s.doors.find((d) => !isDoorLocked(s, d)) ?? s.doors[0]!;
    const o = doorWorldPos(s.grid, door.dir);
    const horizontal = door.dir === 'up' || door.dir === 'down';
    // Slightly off the exact center, still inside the 1-tile opening.
    s.player.pos = horizontal ? { x: o.x + 0.4, y: o.y } : { x: o.x, y: o.y + 0.4 };
    tick(s, NO_INPUT, FIXED_DT);
    expect(s.currentRoom).toBe(door.to);
  });

  it('spawns room contents deterministically and independent of the path taken', () => {
    const id = firstNormalRoom(createGame(55));

    const direct = createGame(55);
    enterRoom(direct, id);

    const detour = createGame(55);
    const other = [...detour.dungeon.rooms.values()].find(
      (r) => r.id !== id && r.type !== 'start',
    );
    if (other) enterRoom(detour, other.id);
    enterRoom(detour, id);

    expect(detour.enemies.map((e) => e.pos)).toEqual(direct.enemies.map((e) => e.pos));
    expect(detour.enemies).toHaveLength(direct.enemies.length);
  });
});
