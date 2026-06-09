import type { Rng } from './rng.js';
import type { Direction, Door, Dungeon, Room, RoomId, RoomType } from './types.js';

export interface DungeonOptions {
  /** Total number of rooms to place (including start and boss). */
  roomCount: number;
  /** Size of the square map grid the rooms are placed on. */
  mapSize: number;
}

export const DEFAULT_DUNGEON: DungeonOptions = { roomCount: 10, mapSize: 11 };

const NEIGHBOR_OFFSETS = [
  { x: 0, y: -1 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
] as const;

/**
 * Generates a connected dungeon via a random walk that branches from already
 * placed rooms. Fully deterministic given `rng`. The room farthest (in graph
 * distance) from the start becomes the boss; the remaining special rooms — one
 * mini-boss, one shop, and 1–2 treasures — are placed on dead-ends where
 * possible. Everything else is a normal (combat) room.
 */
export function generateDungeon(rng: Rng, opts: DungeonOptions = DEFAULT_DUNGEON): Dungeon {
  const { roomCount, mapSize } = opts;
  const key = (gx: number, gy: number): number => gy * mapSize + gx;

  const rooms = new Map<RoomId, Room>();
  const byCell = new Map<number, RoomId>();
  let nextId = 0;

  const place = (gx: number, gy: number, type: RoomType): Room => {
    const room: Room = { id: nextId++, gx, gy, type, neighbors: [], cleared: false };
    rooms.set(room.id, room);
    byCell.set(key(gx, gy), room.id);
    return room;
  };

  const connect = (a: Room, b: Room): void => {
    if (!a.neighbors.includes(b.id)) a.neighbors.push(b.id);
    if (!b.neighbors.includes(a.id)) b.neighbors.push(a.id);
  };

  const center = Math.floor(mapSize / 2);
  const start = place(center, center, 'start');

  // Grow until we hit roomCount, always extending from an existing room into
  // a free adjacent cell. Guard against running out of room with an attempt cap.
  let attempts = 0;
  const maxAttempts = roomCount * 50;
  while (rooms.size < roomCount && attempts < maxAttempts) {
    attempts++;
    const from = rng.pick([...rooms.values()]);
    const dir = rng.pick(NEIGHBOR_OFFSETS);
    const gx = from.gx + dir.x;
    const gy = from.gy + dir.y;
    if (gx < 0 || gy < 0 || gx >= mapSize || gy >= mapSize) continue;
    if (byCell.has(key(gx, gy))) continue;
    const room = place(gx, gy, 'normal');
    connect(from, room);
  }

  // Connect any incidentally-adjacent rooms so the layout feels less linear.
  for (const room of rooms.values()) {
    for (const off of NEIGHBOR_OFFSETS) {
      const id = byCell.get(key(room.gx + off.x, room.gy + off.y));
      if (id !== undefined) {
        const other = rooms.get(id);
        if (other) connect(room, other);
      }
    }
  }

  const dist = bfsDistances(rooms, start.id);

  // Boss = farthest room from start.
  let bossId = start.id;
  let maxDist = -1;
  for (const [id, d] of dist) {
    if (d > maxDist) {
      maxDist = d;
      bossId = id;
    }
  }
  const boss = rooms.get(bossId);
  if (boss && boss.id !== start.id) boss.type = 'boss';

  // Assign the remaining special rooms. Dead-ends (leaves) are preferred so the
  // specials sit off the main path, with branch rooms as fallback. The full set
  // (one mini-boss, one shop, 1–2 treasures) is placed as long as there are
  // enough non-start/non-boss rooms — true for DEFAULT_DUNGEON and every scaled
  // floor; on a tiny floor `claim()` degrades gracefully (places what fits).
  const others = [...rooms.values()].filter((r) => r.id !== start.id && r.id !== bossId);
  const leaves = rng.shuffle(others.filter((r) => r.neighbors.length === 1));
  const branches = rng.shuffle(others.filter((r) => r.neighbors.length > 1));
  const pool = [...leaves, ...branches];
  let pi = 0;
  const claim = (type: RoomType): void => {
    const room = pool[pi];
    if (room) {
      room.type = type;
      pi++;
    }
  };
  claim('miniboss');
  claim('shop');
  const treasureCount = rng.range(1, 2);
  for (let t = 0; t < treasureCount; t++) claim('treasure');

  return { rooms, startRoom: start.id, bossRoom: bossId };
}

/** Breadth-first graph distances from `source` over the room adjacency. */
export function bfsDistances(rooms: Map<RoomId, Room>, source: RoomId): Map<RoomId, number> {
  const dist = new Map<RoomId, number>([[source, 0]]);
  const queue: RoomId[] = [source];
  while (queue.length > 0) {
    const id = queue.shift() as RoomId;
    const d = dist.get(id) ?? 0;
    const room = rooms.get(id);
    if (!room) continue;
    for (const n of room.neighbors) {
      if (!dist.has(n)) {
        dist.set(n, d + 1);
        queue.push(n);
      }
    }
  }
  return dist;
}

/** True if every room is reachable from the start room. */
export function isConnected(dungeon: Dungeon): boolean {
  const reached = bfsDistances(dungeon.rooms, dungeon.startRoom);
  return reached.size === dungeon.rooms.size;
}

/** The cardinal direction from room `a` to its orthogonally-adjacent neighbor `b`. */
export function directionTo(a: Room, b: Room): Direction {
  if (b.gx > a.gx) return 'right';
  if (b.gx < a.gx) return 'left';
  if (b.gy > a.gy) return 'down';
  return 'up';
}

/** The doors of a room: one per neighbor, on the side facing that neighbor. */
export function computeDoors(dungeon: Dungeon, roomId: RoomId): Door[] {
  const room = dungeon.rooms.get(roomId);
  if (!room) return [];
  const doors: Door[] = [];
  for (const nId of room.neighbors) {
    const neighbor = dungeon.rooms.get(nId);
    if (neighbor) doors.push({ dir: directionTo(room, neighbor), to: nId });
  }
  return doors;
}
