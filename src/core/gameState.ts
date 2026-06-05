import { generateDungeon, DEFAULT_DUNGEON, type DungeonOptions } from './dungeon.js';
import { moveBody } from './physics.js';
import { Rng } from './rng.js';
import { makeRoomGrid, type RoomGrid } from './room.js';
import type { Combatant, Dungeon, RoomId, Vec2 } from './types.js';

/** Fixed simulation timestep, in seconds. The render layer steps in multiples of this. */
export const FIXED_DT = 1 / 60;
/** Player movement speed, in tiles per second. */
export const PLAYER_SPEED = 6;
/** Player collision box half-extent, in tiles. */
export const PLAYER_RADIUS = 0.4;

export interface Player extends Combatant {
  pos: Vec2;
  vel: Vec2;
  radius: number;
}

/** Per-tick player intent. `moveX`/`moveY` are each in [-1, 1]; the vector is normalized. */
export interface InputState {
  moveX: number;
  moveY: number;
}

export const NO_INPUT: InputState = { moveX: 0, moveY: 0 };

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
    pos: { x: grid.width / 2, y: grid.height / 2 },
    vel: { x: 0, y: 0 },
    radius: PLAYER_RADIUS,
    hp: 6,
    maxHp: 6,
    attack: 3,
    defense: 0,
  };
  return { seed, rng, dungeon, currentRoom: dungeon.startRoom, grid, player };
}

/**
 * Advances the simulation by one fixed step. Deterministic: given the same
 * starting state, input, and dt, it always produces the same next state.
 *
 * Diagonal input is normalized so moving on two axes is not faster than one.
 */
export function tick(state: GameState, input: InputState, dt: number): void {
  const { player } = state;
  const len = Math.hypot(input.moveX, input.moveY);
  if (len > 0) {
    player.vel = {
      x: (input.moveX / len) * PLAYER_SPEED,
      y: (input.moveY / len) * PLAYER_SPEED,
    };
  } else {
    player.vel = { x: 0, y: 0 };
  }
  player.pos = moveBody(state.grid, player.pos, player.radius, player.vel.x * dt, player.vel.y * dt);
}
