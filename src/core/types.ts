/** Shared, engine-agnostic types for the simulation core. */

export interface Vec2 {
  x: number;
  y: number;
}

export type RoomId = number;

export type RoomType = 'start' | 'normal' | 'treasure' | 'boss' | 'shop';

export interface Room {
  id: RoomId;
  /** Grid coordinates of the room on the dungeon map. */
  gx: number;
  gy: number;
  type: RoomType;
  neighbors: RoomId[];
  cleared: boolean;
}

export interface Dungeon {
  rooms: Map<RoomId, Room>;
  startRoom: RoomId;
  bossRoom: RoomId;
}

/** A single combatant's mutable stats. */
export interface Combatant {
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
}

export type Direction = 'up' | 'down' | 'left' | 'right';

/** A connection from the current room to a neighbor, on a given side. */
export interface Door {
  dir: Direction;
  to: RoomId;
}
