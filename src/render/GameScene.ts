import Phaser from 'phaser';
import {
  createGame,
  FIXED_DT,
  isWall,
  tick,
  type GameState,
  type InputState,
} from '../core/index.js';

export const TILE = 40;

/** Max simulation steps per frame, so a stalled tab can't trigger a death spiral. */
const MAX_STEPS_PER_FRAME = 5;

interface MoveKeys {
  up: Phaser.Input.Keyboard.Key;
  down: Phaser.Input.Keyboard.Key;
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
}

/**
 * Thin rendering layer. It owns NO gameplay state — it reads from the pure
 * GameState, feeds input into the deterministic `tick`, and draws the result.
 * All rules live in src/core and are unit-tested headlessly.
 */
export class GameScene extends Phaser.Scene {
  private state!: GameState;
  private player!: Phaser.GameObjects.Rectangle;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: MoveKeys;
  private accumulator = 0;

  constructor() {
    super('GameScene');
  }

  create(): void {
    // Fixed seed keeps the skeleton reproducible; wire this to a UI later.
    this.state = createGame(2026);

    this.drawRoom();

    const p = this.state.player.pos;
    const size = this.state.player.radius * 2 * TILE;
    this.player = this.add.rectangle(p.x * TILE, p.y * TILE, size, size, 0xffd166).setDepth(10);

    const kb = this.input.keyboard;
    if (kb) {
      this.cursors = kb.createCursorKeys();
      this.wasd = kb.addKeys({
        up: Phaser.Input.Keyboard.KeyCodes.W,
        down: Phaser.Input.Keyboard.KeyCodes.S,
        left: Phaser.Input.Keyboard.KeyCodes.A,
        right: Phaser.Input.Keyboard.KeyCodes.D,
      }) as MoveKeys;
    }
  }

  update(_time: number, deltaMs: number): void {
    this.accumulator += deltaMs / 1000;
    const input = this.readInput();

    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
      tick(this.state, input, FIXED_DT);
      this.accumulator -= FIXED_DT;
      steps++;
    }

    const p = this.state.player.pos;
    this.player.setPosition(p.x * TILE, p.y * TILE);
  }

  private readInput(): InputState {
    const left = this.isDown('left');
    const right = this.isDown('right');
    const up = this.isDown('up');
    const down = this.isDown('down');
    return { moveX: (right ? 1 : 0) - (left ? 1 : 0), moveY: (down ? 1 : 0) - (up ? 1 : 0) };
  }

  private isDown(dir: keyof MoveKeys): boolean {
    return Boolean(this.cursors?.[dir]?.isDown) || Boolean(this.wasd?.[dir]?.isDown);
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
}
