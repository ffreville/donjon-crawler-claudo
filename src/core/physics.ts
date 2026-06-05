import { isWall, type RoomGrid } from './room.js';
import type { Vec2 } from './types.js';

/** Small inset so that merely touching a tile boundary does not count as overlap. */
const EPS = 1e-7;

/**
 * True if an axis-aligned box centered at (x, y) with the given half-extent
 * overlaps any wall tile of the grid. The box is treated in tile-space units
 * (1 tile = 1 unit).
 */
export function aabbHitsWall(grid: RoomGrid, x: number, y: number, half: number): boolean {
  const minTx = Math.floor(x - half + EPS);
  const maxTx = Math.floor(x + half - EPS);
  const minTy = Math.floor(y - half + EPS);
  const maxTy = Math.floor(y + half - EPS);
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      if (isWall(grid, tx, ty)) return true;
    }
  }
  return false;
}

/**
 * Moves an axis-aligned box (center `pos`, half-extent `half`) by (dx, dy),
 * resolving collisions against wall tiles one axis at a time. Returns the new
 * center position. Pure: no mutation of the input, no randomness.
 *
 * Assumes per-tick displacement does not exceed one tile width, which holds for
 * normal entity speeds at the fixed timestep.
 */
export function moveBody(
  grid: RoomGrid,
  pos: Vec2,
  half: number,
  dx: number,
  dy: number,
): Vec2 {
  let { x, y } = pos;

  if (dx !== 0) {
    const nx = x + dx;
    if (!aabbHitsWall(grid, nx, y, half)) {
      x = nx;
    } else if (dx > 0) {
      const wallTx = Math.floor(nx + half - EPS); // wall column the right edge entered
      const snapped = wallTx - half - EPS;
      x = aabbHitsWall(grid, snapped, y, half) ? x : snapped;
    } else {
      const wallTx = Math.floor(nx - half + EPS); // wall column the left edge entered
      const snapped = wallTx + 1 + half + EPS;
      x = aabbHitsWall(grid, snapped, y, half) ? x : snapped;
    }
  }

  if (dy !== 0) {
    const ny = y + dy;
    if (!aabbHitsWall(grid, x, ny, half)) {
      y = ny;
    } else if (dy > 0) {
      const wallTy = Math.floor(ny + half - EPS);
      const snapped = wallTy - half - EPS;
      y = aabbHitsWall(grid, x, snapped, half) ? y : snapped;
    } else {
      const wallTy = Math.floor(ny - half + EPS);
      const snapped = wallTy + 1 + half + EPS;
      y = aabbHitsWall(grid, x, snapped, half) ? y : snapped;
    }
  }

  return { x, y };
}

/** True if two circles overlap (boundary-touching does not count). */
export function circlesOverlap(a: Vec2, ar: number, b: Vec2, br: number): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const r = ar + br;
  return dx * dx + dy * dy < r * r;
}
