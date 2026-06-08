import { describe, expect, it } from 'vitest';
import {
  createGame,
  FIXED_DT,
  NO_INPUT,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  tick,
  type GameState,
  type InputState,
} from './gameState.js';
import { aabbHitsWall } from './physics.js';

const run = (state: GameState, input: InputState, steps: number): void => {
  for (let i = 0; i < steps; i++) tick(state, input, FIXED_DT);
};

describe('gameState', () => {
  it('starts the player at the room center, at rest', () => {
    const s = createGame(1);
    expect(s.currentRoom).toBe(s.dungeon.startRoom);
    expect(s.player.pos).toEqual({ x: 7.5, y: 4.5 });
    expect(s.player.vel).toEqual({ x: 0, y: 0 });
    expect(s.player.radius).toBe(PLAYER_RADIUS);
  });

  it('moves the player in open space at the expected speed', () => {
    const s = createGame(1);
    tick(s, { moveX: 1, moveY: 0 }, FIXED_DT);
    expect(s.player.pos.x).toBeCloseTo(7.5 + PLAYER_SPEED * FIXED_DT, 10);
    expect(s.player.pos.y).toBeCloseTo(4.5, 10);
  });

  it('normalizes diagonal movement (not faster than one axis)', () => {
    const s = createGame(1);
    tick(s, { moveX: 1, moveY: 1 }, FIXED_DT);
    const dx = s.player.pos.x - 7.5;
    const dy = s.player.pos.y - 4.5;
    expect(Math.hypot(dx, dy)).toBeCloseTo(PLAYER_SPEED * FIXED_DT, 10);
  });

  it('does not move without input', () => {
    const s = createGame(1);
    run(s, NO_INPUT, 30);
    expect(s.player.pos).toEqual({ x: 7.5, y: 4.5 });
  });

  it('cannot pass through walls', () => {
    // enemyCount:1 keeps the start room locked, so its border stays solid
    // (an open room would carve door openings the player could escape through).
    const s = createGame(1, { enemyCount: 1 });
    run(s, { moveX: -1, moveY: 0 }, 300); // push left into the wall for 5s
    expect(s.player.pos.x).toBeGreaterThanOrEqual(1 + PLAYER_RADIUS);
    expect(aabbHitsWall(s.grid, s.player.pos.x, s.player.pos.y, s.player.radius)).toBe(false);
  });

  it('is reproducible: same seed + same input sequence => identical state', () => {
    const inputs: InputState[] = [
      { moveX: 1, moveY: 0 },
      { moveX: 1, moveY: 1 },
      { moveX: 0, moveY: 1 },
      { moveX: -1, moveY: 0 },
    ];
    const a = createGame(2025);
    const b = createGame(2025);
    for (const input of inputs) {
      for (let i = 0; i < 20; i++) {
        tick(a, input, FIXED_DT);
        tick(b, input, FIXED_DT);
      }
    }
    expect(a.player.pos).toEqual(b.player.pos);
    expect([...a.dungeon.rooms.keys()]).toEqual([...b.dungeon.rooms.keys()]);
  });
});
