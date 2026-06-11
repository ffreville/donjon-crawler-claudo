import type { Direction, Vec2 } from './types.js';

/** Fixed interior dimensions of a single room, in tiles. */
export const ROOM_W = 22;
export const ROOM_H = 13;

/**
 * The walkable grid of one room. `walls[y * width + x] === true` means blocked.
 * The outer ring is always wall; interior is open in this skeleton.
 */
export interface RoomGrid {
  width: number;
  height: number;
  walls: boolean[];
}

export function makeRoomGrid(width = ROOM_W, height = ROOM_H): RoomGrid {
  const walls: boolean[] = new Array(width * height).fill(false);
  for (let x = 0; x < width; x++) {
    walls[x] = true; // top
    walls[(height - 1) * width + x] = true; // bottom
  }
  for (let y = 0; y < height; y++) {
    walls[y * width] = true; // left
    walls[y * width + (width - 1)] = true; // right
  }
  return { width, height, walls };
}

/** Out-of-bounds tiles are treated as walls. */
export function isWall(grid: RoomGrid, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) return true;
  return grid.walls[y * grid.width + x] ?? true;
}

export function opposite(dir: Direction): Direction {
  switch (dir) {
    case 'up':
      return 'down';
    case 'down':
      return 'up';
    case 'left':
      return 'right';
    case 'right':
      return 'left';
  }
}

/** The single tile where a door on the given side opens (in the border ring). */
export function doorOpeningTile(grid: RoomGrid, dir: Direction): Vec2 {
  const cx = Math.floor(grid.width / 2);
  const cy = Math.floor(grid.height / 2);
  switch (dir) {
    case 'up':
      return { x: cx, y: 0 };
    case 'down':
      return { x: cx, y: grid.height - 1 };
    case 'left':
      return { x: 0, y: cy };
    case 'right':
      return { x: grid.width - 1, y: cy };
  }
}

/** World-space center of a door opening. */
export function doorWorldPos(grid: RoomGrid, dir: Direction): Vec2 {
  const t = doorOpeningTile(grid, dir);
  return { x: t.x + 0.5, y: t.y + 0.5 };
}

/** Door opening width, in tiles. One tile; the player's small hitbox fits through. */
export const DOOR_GAP_WIDTH = 1;

/**
 * Opens a door by clearing a `DOOR_GAP_WIDTH`-tile gap in the wall around the
 * opening, so the player can pass without threading a single tile. The gap runs
 * along the wall and never reaches the corners.
 */
export function carveDoor(grid: RoomGrid, dir: Direction): void {
  const t = doorOpeningTile(grid, dir);
  const horizontal = dir === 'up' || dir === 'down'; // gap runs along x
  const lo = -Math.floor((DOOR_GAP_WIDTH - 1) / 2);
  const hi = Math.floor(DOOR_GAP_WIDTH / 2);
  for (let k = lo; k <= hi; k++) {
    const x = horizontal ? t.x + k : t.x;
    const y = horizontal ? t.y : t.y + k;
    // Stay within the wall's interior span (1..size-2) so corners stay solid.
    if (horizontal && (x < 1 || x > grid.width - 2)) continue;
    if (!horizontal && (y < 1 || y > grid.height - 2)) continue;
    grid.walls[y * grid.width + x] = false;
  }
}

/**
 * Where the player should appear when arriving through the door on `arrivalDir`:
 * the opening, pushed inward so they don't immediately re-trigger a transition.
 */
export function entryPosition(grid: RoomGrid, arrivalDir: Direction): Vec2 {
  const inset = 1.5;
  const o = doorWorldPos(grid, arrivalDir);
  switch (arrivalDir) {
    case 'up':
      return { x: o.x, y: o.y + inset };
    case 'down':
      return { x: o.x, y: o.y - inset };
    case 'left':
      return { x: o.x + inset, y: o.y };
    case 'right':
      return { x: o.x - inset, y: o.y };
  }
}
