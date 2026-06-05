/** Fixed interior dimensions of a single room, in tiles. */
export const ROOM_W = 15;
export const ROOM_H = 9;

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
