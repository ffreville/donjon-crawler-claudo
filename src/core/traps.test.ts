import { describe, expect, it } from 'vitest';
import {
  createGame,
  enterRoom,
  FIXED_DT,
  NO_INPUT,
  TRAP_DAMAGE,
  TRAP_RADIUS,
  tick,
  type GameState,
} from './gameState.js';

const ROOM_CENTER = { x: 7.5, y: 4.5 };

/** Enters the first normal room of a fresh game on the given seed. */
const enterFirstNormal = (seed: number): GameState => {
  const s = createGame(seed);
  const room = [...s.dungeon.rooms.values()].find((r) => r.type === 'normal');
  if (!room) throw new Error('no normal room');
  enterRoom(s, room.id);
  return s;
};

describe('traps', () => {
  it('appear in some normal rooms but not all (probabilistic, deterministic)', () => {
    let trapped = 0;
    for (let seed = 1; seed <= 60; seed++) {
      if (enterFirstNormal(seed).traps.length > 0) trapped++;
    }
    expect(trapped).toBeGreaterThan(0);
    expect(trapped).toBeLessThan(60);
  });

  it('are placed away from the room center (safe arrival)', () => {
    for (let seed = 1; seed <= 60; seed++) {
      for (const t of enterFirstNormal(seed).traps) {
        expect(Math.hypot(t.x - ROOM_CENTER.x, t.y - ROOM_CENTER.y)).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('a room layout (incl. traps) is deterministic for a given seed', () => {
    const sig = (s: GameState): string => s.traps.map((t) => `${t.x},${t.y}`).join('|');
    expect(sig(enterFirstNormal(7))).toBe(sig(enterFirstNormal(7)));
  });

  it('damage the player on contact, then grant i-frames', () => {
    // Find a seed whose first normal room actually has a trap.
    let s: GameState | undefined;
    for (let seed = 1; seed <= 60; seed++) {
      const g = enterFirstNormal(seed);
      if (g.traps.length > 0) {
        s = g;
        break;
      }
    }
    expect(s).toBeDefined();
    const game = s!;
    game.graceTimer = 0; // past the entry grace
    const hp0 = game.player.hp;
    game.player.pos = { x: game.traps[0]!.x, y: game.traps[0]!.y };
    tick(game, NO_INPUT, FIXED_DT);
    expect(game.player.hp).toBe(hp0 - TRAP_DAMAGE);
    expect(game.player.invuln).toBeGreaterThan(0);
    tick(game, NO_INPUT, FIXED_DT); // still standing on it, but invulnerable
    expect(game.player.hp).toBe(hp0 - TRAP_DAMAGE);
  });

  it('do not hurt during the entry grace window', () => {
    let game: GameState | undefined;
    for (let seed = 1; seed <= 60; seed++) {
      const g = enterFirstNormal(seed);
      if (g.traps.length > 0) {
        game = g;
        break;
      }
    }
    const s = game!;
    expect(s.graceTimer).toBeGreaterThan(0);
    s.player.pos = { x: s.traps[0]!.x, y: s.traps[0]!.y };
    const hp0 = s.player.hp;
    tick(s, NO_INPUT, FIXED_DT); // within grace
    expect(s.player.hp).toBe(hp0);
    // sanity: TRAP_RADIUS is a real positive collision size
    expect(TRAP_RADIUS).toBeGreaterThan(0);
  });
});
