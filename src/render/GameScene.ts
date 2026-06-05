import Phaser from 'phaser';
import {
  createGame,
  isWall,
  movePlayer,
  type Direction,
  type GameState,
} from '../core/index.js';

export const TILE = 40;

/**
 * Thin rendering layer. It owns NO gameplay state — it reads from the pure
 * GameState and translates input into core mutations. All the actual rules
 * live in src/core and are unit-tested headlessly.
 */
export class GameScene extends Phaser.Scene {
  private state!: GameState;
  private player!: Phaser.GameObjects.Rectangle;

  constructor() {
    super('GameScene');
  }

  create(): void {
    // A fixed seed keeps the skeleton reproducible; wire this to a UI later.
    this.state = createGame(2026);

    this.drawRoom();

    const p = this.state.player.pos;
    this.player = this.add
      .rectangle(p.x * TILE + TILE / 2, p.y * TILE + TILE / 2, TILE * 0.6, TILE * 0.6, 0xffd166)
      .setDepth(10);

    this.bindInput();
  }

  private drawRoom(): void {
    const { grid } = this.state;
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const color = isWall(grid, x, y) ? 0x2a2a3a : 0x1b1b26;
        this.add
          .rectangle(x * TILE + TILE / 2, y * TILE + TILE / 2, TILE - 1, TILE - 1, color)
          .setStrokeStyle(1, 0x0f0f16);
      }
    }
  }

  private bindInput(): void {
    const keys: Record<string, Direction> = {
      ArrowUp: 'up',
      KeyW: 'up',
      ArrowDown: 'down',
      KeyS: 'down',
      ArrowLeft: 'left',
      KeyA: 'left',
      ArrowRight: 'right',
      KeyD: 'right',
    };
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      const dir = keys[event.code];
      if (!dir) return;
      if (movePlayer(this.state, dir)) {
        const p = this.state.player.pos;
        this.player.setPosition(p.x * TILE + TILE / 2, p.y * TILE + TILE / 2);
      }
    });
  }
}
