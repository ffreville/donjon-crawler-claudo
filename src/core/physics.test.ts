import { describe, expect, it } from 'vitest';
import { aabbHitsWall, moveBody } from './physics.js';
import { makeRoomGrid, ROOM_H, ROOM_W } from './room.js';

const grid = makeRoomGrid(); // ROOM_W x ROOM_H, border ring of walls, open interior

describe('aabbHitsWall', () => {
  it('detects the border walls', () => {
    expect(aabbHitsWall(grid, 0.5, 4.5, 0.4)).toBe(true); // inside left wall column
    expect(aabbHitsWall(grid, 7.5, 0.5, 0.4)).toBe(true); // inside top wall row
  });

  it('reports open interior as clear', () => {
    expect(aabbHitsWall(grid, 7.5, 4.5, 0.4)).toBe(false);
  });

  it('does not count a box merely touching a wall boundary as overlapping', () => {
    // Right edge exactly at x=2 (boundary between open tile 1 and tile 2).
    expect(aabbHitsWall(grid, 1.6, 4.5, 0.4)).toBe(false);
  });
});

describe('moveBody', () => {
  const half = 0.4;

  it('moves freely through open space', () => {
    const p = moveBody(grid, { x: 7.5, y: 4.5 }, half, 0.1, 0);
    expect(p).toEqual({ x: 7.6, y: 4.5 });
  });

  it('stops against the right wall and never overlaps it', () => {
    let pos = { x: 7.5, y: 4.5 };
    // Enough steps (0.1/tile) to cross the whole room and pile into the far wall.
    for (let i = 0; i < ROOM_W * 12; i++) pos = moveBody(grid, pos, half, 0.1, 0);
    expect(aabbHitsWall(grid, pos.x, pos.y, half)).toBe(false);
    expect(pos.x).toBeLessThanOrEqual(ROOM_W - 1 - half); // wall column starts at x=ROOM_W-1
    expect(pos.x).toBeGreaterThan(ROOM_W - 2); // got close to the wall
  });

  it('stops against the left wall', () => {
    let pos = { x: 7.5, y: 4.5 };
    for (let i = 0; i < 200; i++) pos = moveBody(grid, pos, half, -0.1, 0);
    expect(aabbHitsWall(grid, pos.x, pos.y, half)).toBe(false);
    expect(pos.x).toBeGreaterThanOrEqual(1 + half); // open tiles start at x=1
  });

  it('stops against the top and bottom walls', () => {
    let up = { x: 7.5, y: 4.5 };
    let down = { x: 7.5, y: 4.5 };
    for (let i = 0; i < 200; i++) {
      up = moveBody(grid, up, half, 0, -0.1);
      down = moveBody(grid, down, half, 0, 0.1);
    }
    expect(up.y).toBeGreaterThanOrEqual(1 + half);
    expect(down.y).toBeLessThanOrEqual(ROOM_H - 1 - half);
    expect(aabbHitsWall(grid, up.x, up.y, half)).toBe(false);
    expect(aabbHitsWall(grid, down.x, down.y, half)).toBe(false);
  });

  it('is pure (does not mutate the input position)', () => {
    const pos = { x: 7.5, y: 4.5 };
    moveBody(grid, pos, half, 0.1, 0.1);
    expect(pos).toEqual({ x: 7.5, y: 4.5 });
  });

  it('is deterministic for identical inputs', () => {
    const a = moveBody(grid, { x: 5, y: 5 }, half, 0.07, -0.03);
    const b = moveBody(grid, { x: 5, y: 5 }, half, 0.07, -0.03);
    expect(a).toEqual(b);
  });
});
