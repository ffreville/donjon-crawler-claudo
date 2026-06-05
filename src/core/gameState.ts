import { generateDungeon, DEFAULT_DUNGEON, type DungeonOptions } from './dungeon.js';
import { Rng } from './rng.js';
import { isWall, makeRoomGrid, step, type RoomGrid } from './room.js';
import type { Combatant, Direction, RoomId, Vec2 } from './types.js';
import type { Dungeon } from './types.js';

export interface Player extends Combatant {
  pos: Vec2;
}

/**
 * The complete, serializable simulation state. Everything the game IS lives
 * here — rendering reads from it and never owns gameplay state of its own.
 */
export interface GameState {
  seed: number;
  rng: Rng;
  dungeon: Dungeon;
  currentRoom: RoomId;
  grid: RoomGrid;
  player: Player;
}

export interface NewGameOptions {
  dungeon?: DungeonOptions;
}

export function createGame(seed: number, opts: NewGameOptions = {}): GameState {
  const rng = new Rng(seed);
  const dungeon = generateDungeon(rng, opts.dungeon ?? DEFAULT_DUNGEON);
  const grid = makeRoomGrid();
  const player: Player = {
    pos: { x: Math.floor(grid.width / 2), y: Math.floor(grid.height / 2) },
    hp: 6,
    maxHp: 6,
    attack: 3,
    defense: 0,
  };
  return { seed, rng, dungeon, currentRoom: dungeon.startRoom, grid, player };
}

/**
 * Attempt to move the player one tile. Returns true if the move happened
 * (i.e. the destination was not a wall). Pure with respect to RNG.
 */
export function movePlayer(state: GameState, dir: Direction): boolean {
  const next = step(state.player.pos, dir);
  if (isWall(state.grid, next.x, next.y)) return false;
  state.player.pos = next;
  return true;
}
