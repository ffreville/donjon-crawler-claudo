import { describe, expect, it } from 'vitest';
import type { TrapKind } from './entities.js';
import { doorWorldPos, ROOM_H, ROOM_W } from './room.js';
import {
  createGame,
  DOOR_TRAP_CLEARANCE,
  enterRoom,
  FIXED_DT,
  NO_INPUT,
  PIT_DAMAGE,
  TRAP_DAMAGE,
  tick,
  type GameState,
} from './gameState.js';

const ROOM_CENTER = { x: ROOM_W / 2, y: ROOM_H / 2 };

const enterFirstNormal = (seed: number): GameState => {
  const s = createGame(seed);
  const room = [...s.dungeon.rooms.values()].find((r) => r.type === 'normal');
  if (!room) throw new Error('no normal room');
  enterRoom(s, room.id);
  return s;
};

/** Enters a normal room that contains a trap of the requested kind. */
const enterRoomWithTrap = (kind: TrapKind): { s: GameState; trap: { pos: { x: number; y: number } } } => {
  for (let seed = 1; seed < 200; seed++) {
    const s = enterFirstNormal(seed);
    const trap = s.traps.find((t) => t.kind === kind);
    if (trap) return { s, trap };
  }
  throw new Error(`no ${kind} trap found in seeds 1..199`);
};

describe('traps', () => {
  it('both spikes and pits appear across rooms, but not in every room', () => {
    let trapped = 0;
    let sawSpike = false;
    let sawPit = false;
    for (let seed = 1; seed <= 60; seed++) {
      const traps = enterFirstNormal(seed).traps;
      if (traps.length > 0) trapped++;
      if (traps.some((t) => t.kind === 'spike')) sawSpike = true;
      if (traps.some((t) => t.kind === 'pit')) sawPit = true;
    }
    expect(trapped).toBeGreaterThan(0);
    expect(trapped).toBeLessThan(60);
    expect(sawSpike).toBe(true);
    expect(sawPit).toBe(true);
  });

  it('are never placed at the center or right in front of a door', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const s = enterFirstNormal(seed);
      const doorPts = s.doors.map((d) => doorWorldPos(s.grid, d.dir));
      for (const t of s.traps) {
        expect(Math.hypot(t.pos.x - ROOM_CENTER.x, t.pos.y - ROOM_CENTER.y)).toBeGreaterThanOrEqual(2);
        for (const dp of doorPts) {
          expect(Math.hypot(t.pos.x - dp.x, t.pos.y - dp.y)).toBeGreaterThanOrEqual(DOOR_TRAP_CLEARANCE);
        }
      }
    }
  });

  it('trap layout is deterministic for a given seed', () => {
    const sig = (s: GameState): string =>
      s.traps.map((t) => `${t.kind}:${t.pos.x},${t.pos.y}`).join('|');
    expect(sig(enterFirstNormal(7))).toBe(sig(enterFirstNormal(7)));
  });

  it('spikes damage the player on contact, then grant i-frames', () => {
    const { s, trap } = enterRoomWithTrap('spike');
    s.graceTimer = 0;
    const hp0 = s.player.hp;
    s.player.pos = { x: trap.pos.x, y: trap.pos.y };
    tick(s, NO_INPUT, FIXED_DT);
    expect(s.player.hp).toBe(hp0 - TRAP_DAMAGE);
    expect(s.player.invuln).toBeGreaterThan(0);
    tick(s, NO_INPUT, FIXED_DT); // invulnerable → no further damage
    expect(s.player.hp).toBe(hp0 - TRAP_DAMAGE);
  });

  it('pits send the player back to the room entrance and deal damage', () => {
    const { s, trap } = enterRoomWithTrap('pit');
    s.graceTimer = 0;
    const entry = { x: s.entryPos.x, y: s.entryPos.y };
    const hp0 = s.player.hp;
    s.player.pos = { x: trap.pos.x, y: trap.pos.y };
    tick(s, NO_INPUT, FIXED_DT);
    expect(s.player.pos).toEqual(entry);
    expect(s.player.hp).toBe(hp0 - PIT_DAMAGE);
  });

  it('flight makes the player immune to spikes and pits', () => {
    const spike = enterRoomWithTrap('spike');
    spike.s.graceTimer = 0;
    spike.s.player.flying = true;
    const hp0 = spike.s.player.hp;
    spike.s.player.pos = { x: spike.trap.pos.x, y: spike.trap.pos.y };
    tick(spike.s, NO_INPUT, FIXED_DT);
    expect(spike.s.player.hp).toBe(hp0); // no spike damage

    const pit = enterRoomWithTrap('pit');
    pit.s.graceTimer = 0;
    pit.s.player.flying = true;
    pit.s.player.pos = { x: pit.trap.pos.x, y: pit.trap.pos.y };
    tick(pit.s, NO_INPUT, FIXED_DT);
    expect(pit.s.player.pos).toEqual({ x: pit.trap.pos.x, y: pit.trap.pos.y }); // not dropped
  });

  it('do not trigger during the entry grace window', () => {
    const { s, trap } = enterRoomWithTrap('spike');
    expect(s.graceTimer).toBeGreaterThan(0);
    const hp0 = s.player.hp;
    s.player.pos = { x: trap.pos.x, y: trap.pos.y };
    tick(s, NO_INPUT, FIXED_DT);
    expect(s.player.hp).toBe(hp0);
  });
});
