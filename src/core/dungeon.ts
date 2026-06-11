import type { Rng } from './rng.js';
import type { Direction, Door, Dungeon, Room, RoomId, RoomType } from './types.js';

export interface DungeonOptions {
  /** Total number of rooms to place (including start and boss). */
  roomCount: number;
  /** Size of the square map grid the rooms are placed on. */
  mapSize: number;
  /** How many treasure (item) rooms to place (default 1). */
  treasureRooms?: number;
  /** How many mini-boss rooms to place (default 1). */
  minibossRooms?: number;
}

export const DEFAULT_DUNGEON: DungeonOptions = { roomCount: 10, mapSize: 11 };

const NEIGHBOR_OFFSETS = [
  { x: 0, y: -1 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
] as const;

/**
 * Generates a connected dungeon, fully deterministic given `rng`.
 *
 * Layout is built in two parts so that every *special* room (boss, mini-boss,
 * shop, treasure) is a single-door dead-end:
 *  1. A "trunk" of normal rooms is grown by a random walk and cross-linked where
 *     cells are incidentally adjacent (loops, so the trunk isn't a pure line).
 *  2. Each special is then hung off a trunk room as a brand-new leaf — one edge,
 *     never extended from, never cross-linked — so it keeps exactly one door.
 * The boss is the special leaf farthest from the start; the rest take the other
 * leaves. On a tiny floor the special count degrades gracefully (the trunk must
 * keep at least the start room).
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

  // The special rooms that must each end up a single-door dead-end.
  const minibossRooms = opts.minibossRooms ?? 1;
  const treasureRooms = opts.treasureRooms ?? 1;
  const specialTypes: RoomType[] = ['boss'];
  for (let m = 0; m < minibossRooms; m++) specialTypes.push('miniboss');
  specialTypes.push('shop');
  for (let t = 0; t < treasureRooms; t++) specialTypes.push('treasure');
  // Reserve one leaf per special, but always leave at least the start in the
  // trunk; on a tiny floor we simply place fewer specials.
  const reserved = Math.min(specialTypes.length, Math.max(0, roomCount - 1));
  const trunkCount = roomCount - reserved;

  const maxAttempts = roomCount * 50;

  // Part 1a: grow the trunk (a spanning tree of normal rooms) up to trunkCount.
  let attempts = 0;
  while (rooms.size < trunkCount && attempts < maxAttempts) {
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

  // Part 1b: cross-link incidentally-adjacent trunk rooms (every room so far is
  // trunk/normal, so these loops never touch a special).
  for (const room of [...rooms.values()]) {
    for (const off of NEIGHBOR_OFFSETS) {
      const id = byCell.get(key(room.gx + off.x, room.gy + off.y));
      if (id === undefined) continue;
      const other = rooms.get(id);
      if (other) connect(room, other);
    }
  }

  // Part 2: attach `reserved` fresh leaves, each to a trunk room with a free
  // adjacent cell. They are left as 'normal' for now and typed below.
  const trunkRooms = [...rooms.values()];
  const slots: Room[] = [];
  for (let i = 0; i < reserved; i++) {
    let tries = 0;
    while (tries < maxAttempts) {
      tries++;
      const anchor = rng.pick(trunkRooms);
      const dir = rng.pick(NEIGHBOR_OFFSETS);
      const gx = anchor.gx + dir.x;
      const gy = anchor.gy + dir.y;
      if (gx < 0 || gy < 0 || gx >= mapSize || gy >= mapSize) continue;
      if (byCell.has(key(gx, gy))) continue;
      const leaf = place(gx, gy, 'normal');
      connect(anchor, leaf);
      slots.push(leaf);
      break;
    }
  }

  // Boss = the reserved leaf farthest from the start (ties: first placed).
  const dist = bfsDistances(rooms, start.id);
  let bossId = start.id;
  let maxDist = -1;
  for (const leaf of slots) {
    const d = dist.get(leaf.id) ?? 0;
    if (d > maxDist) {
      maxDist = d;
      bossId = leaf.id;
    }
  }
  const boss = rooms.get(bossId);
  if (boss && boss.id !== start.id) boss.type = 'boss';

  // The remaining specials (mini-boss(es), shop, treasure(s)) take the other
  // leaves, shuffled for variety. Extra types beyond available leaves are dropped.
  const rest = rng.shuffle(slots.filter((r) => r.id !== bossId));
  const nonBossTypes = specialTypes.filter((t) => t !== 'boss');
  for (let i = 0; i < rest.length && i < nonBossTypes.length; i++) {
    rest[i]!.type = nonBossTypes[i]!;
  }

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
