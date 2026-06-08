import Phaser from 'phaser';
import {
  createGame,
  FIXED_DT,
  getItem,
  isWall,
  TELEPORTER_POS,
  TELEPORTER_RADIUS,
  tick,
  type GameState,
  type InputState,
} from '../core/index.js';

export const TILE = 40;

/** Max simulation steps per frame, so a stalled tab can't trigger a death spiral. */
const MAX_STEPS_PER_FRAME = 5;

/** Codes whose default browser action (page scroll) we suppress. */
const CAPTURE = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Numpad8',
  'Numpad2',
  'Numpad4',
  'Numpad6',
]);

/**
 * Thin rendering layer. It owns NO gameplay state — it reads from the pure
 * GameState, feeds input into the deterministic `tick`, and draws the result.
 *
 * Input uses physical key positions (`event.code`), which is layout-independent:
 * - Move: Z Q S D on AZERTY (= W A S D positions = codes KeyW/KeyA/KeyS/KeyD).
 * - Shoot: numpad 8 4 6 2 (codes Numpad8/4/6/2), with arrow keys as a fallback.
 */
export class GameScene extends Phaser.Scene {
  private state!: GameState;
  private player!: Phaser.GameObjects.Rectangle;
  private hud!: Phaser.GameObjects.Text;
  private overlay!: Phaser.GameObjects.Text;
  private tooltip!: Phaser.GameObjects.Text;
  private statsPanel!: Phaser.GameObjects.Text;
  private tiles!: Phaser.GameObjects.Group;
  /** Signature of the currently-drawn room, to know when to redraw tiles. */
  private roomKey = '';
  private accumulator = 0;
  /** Seed of the current run; bumped on restart so each run differs. */
  private seed = 2026;

  /** Currently held physical key codes. */
  private readonly held = new Set<string>();

  private enemySprites = new Map<number, Phaser.GameObjects.Rectangle>();
  private projectileSprites = new Map<number, Phaser.GameObjects.Arc>();
  private pickupSprites = new Map<number, Phaser.GameObjects.Arc>();
  private teleporter?: Phaser.GameObjects.Arc;

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.tiles = this.add.group();
    this.startRun();

    const size = this.state.player.radius * 2 * TILE;
    const p = this.state.player.pos;
    this.player = this.add.rectangle(p.x * TILE, p.y * TILE, size, size, 0xffd166).setDepth(10);

    this.hud = this.add
      .text(8, 6, '', { fontFamily: 'monospace', fontSize: '16px', color: '#ffffff' })
      .setDepth(100);

    this.overlay = this.add
      .text(this.scale.width / 2, this.scale.height / 2, '', {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#ffffff',
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(200)
      .setVisible(false);

    this.tooltip = this.add
      .text(0, 0, '', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#e7fbff',
        backgroundColor: '#10202bdd',
        align: 'center',
        padding: { x: 6, y: 4 },
      })
      .setOrigin(0.5, 1)
      .setDepth(150)
      .setVisible(false);

    // Semi-transparent character stats panel pinned to the right edge.
    this.statsPanel = this.add
      .text(this.scale.width - 8, 8, '', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#dff1ff',
        align: 'right',
        backgroundColor: '#0a131baa',
        padding: { x: 8, y: 6 },
      })
      .setOrigin(1, 0)
      .setDepth(90)
      .setAlpha(0.6);

    this.bindInput();
  }

  /** Start a fresh run with the current seed and reset all view caches. */
  private startRun(): void {
    this.state = createGame(this.seed);
    this.roomKey = '';
    for (const s of this.enemySprites.values()) s.destroy();
    this.enemySprites.clear();
    for (const s of this.projectileSprites.values()) s.destroy();
    this.projectileSprites.clear();
    for (const s of this.pickupSprites.values()) s.destroy();
    this.pickupSprites.clear();
    this.teleporter?.destroy();
    this.teleporter = undefined;
    this.tiles.clear(true, true);
  }

  private bindInput(): void {
    const kb = this.input.keyboard;
    if (!kb) return;
    kb.on('keydown', (event: KeyboardEvent) => {
      this.held.add(event.code);
      if (CAPTURE.has(event.code)) event.preventDefault();
    });
    kb.on('keyup', (event: KeyboardEvent) => {
      this.held.delete(event.code);
    });
    // Restart with a new run when the current one is over.
    kb.on('keydown-R', () => {
      if (this.state.status !== 'playing') {
        this.seed++;
        this.startRun();
      }
    });
    // Avoid stuck keys when the window loses focus (e.g. alt-tab).
    this.game.events.on(Phaser.Core.Events.BLUR, () => this.held.clear());
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

    this.render();
  }

  private readInput(): InputState {
    const h = this.held;
    // Movement: AZERTY Z Q S D (physical W A S D positions).
    const moveUp = h.has('KeyW');
    const moveDown = h.has('KeyS');
    const moveLeft = h.has('KeyA');
    const moveRight = h.has('KeyD');
    // Shooting: numpad 8 4 6 2, with arrow keys as a fallback.
    const aimUp = h.has('Numpad8') || h.has('ArrowUp');
    const aimDown = h.has('Numpad2') || h.has('ArrowDown');
    const aimLeft = h.has('Numpad4') || h.has('ArrowLeft');
    const aimRight = h.has('Numpad6') || h.has('ArrowRight');
    return {
      moveX: (moveRight ? 1 : 0) - (moveLeft ? 1 : 0),
      moveY: (moveDown ? 1 : 0) - (moveUp ? 1 : 0),
      aimX: (aimRight ? 1 : 0) - (aimLeft ? 1 : 0),
      aimY: (aimDown ? 1 : 0) - (aimUp ? 1 : 0),
    };
  }

  private render(): void {
    const { player, dungeon, currentRoom, doorsOpen } = this.state;

    // The grid changes when the room changes or its doors open — redraw then.
    const key = `${currentRoom}:${doorsOpen}`;
    if (key !== this.roomKey) {
      this.drawRoom();
      this.roomKey = key;
    }

    this.player.setPosition(player.pos.x * TILE, player.pos.y * TILE);
    this.player.setAlpha(player.invuln > 0 ? 0.5 : 1);

    this.syncEnemies();
    this.syncProjectiles();
    this.syncPickups();
    this.syncTeleporter();
    this.updateItemTooltip();

    const type = dungeon.rooms.get(currentRoom)?.type ?? '?';
    const lock = doorsOpen ? '' : '  [LOCKED]';
    this.hud.setText(
      `HP ${player.hp}/${player.maxHp}   floor ${this.state.floor}   room: ${type}${lock}   enemies ${this.state.enemies.length}`,
    );

    const num = (n: number): string => (Number.isInteger(n) ? `${n}` : n.toFixed(1));
    const itemLines =
      player.items.length > 0 ? player.items.map((id) => `· ${id}`).join('\n') : '· none';
    this.statsPanel.setText(
      [
        'STATS',
        `HP    ${player.hp}/${player.maxHp}`,
        `DMG   ${num(player.tearDamage)}`,
        `RATE  ${num(player.fireRate)}/s`,
        `SPEED ${num(player.speed)}`,
        `FLOOR ${this.state.floor}`,
        '',
        'ITEMS',
        itemLines,
      ].join('\n'),
    );

    if (this.state.status === 'dead') {
      this.overlay.setText('GAME OVER\n\npress R to try again').setVisible(true);
    } else if (this.state.status === 'won') {
      this.overlay.setText('VICTORY\n\npress R for a new run').setVisible(true);
    } else {
      this.overlay.setVisible(false);
    }
  }

  private syncEnemies(): void {
    const live = new Set<number>();
    for (const e of this.state.enemies) {
      live.add(e.id);
      let sprite = this.enemySprites.get(e.id);
      if (!sprite) {
        const size = e.radius * 2 * TILE;
        sprite = this.add.rectangle(0, 0, size, size, 0xe5484d).setDepth(5);
        this.enemySprites.set(e.id, sprite);
      }
      sprite.setPosition(e.pos.x * TILE, e.pos.y * TILE);
    }
    this.cull(this.enemySprites, live);
  }

  private syncProjectiles(): void {
    const live = new Set<number>();
    for (const p of this.state.projectiles) {
      live.add(p.id);
      let sprite = this.projectileSprites.get(p.id);
      if (!sprite) {
        sprite = this.add.circle(0, 0, p.radius * TILE, 0xffe9a8).setDepth(8);
        this.projectileSprites.set(p.id, sprite);
      }
      sprite.setPosition(p.pos.x * TILE, p.pos.y * TILE);
    }
    this.cull(this.projectileSprites, live);
  }

  private syncPickups(): void {
    const live = new Set<number>();
    for (const pk of this.state.pickups) {
      live.add(pk.id);
      let sprite = this.pickupSprites.get(pk.id);
      if (!sprite) {
        const color = pk.kind === 'heart' ? 0xff6b81 : 0x4ad6c8;
        sprite = this.add.circle(0, 0, pk.radius * TILE, color).setDepth(6);
        this.pickupSprites.set(pk.id, sprite);
      }
      sprite.setPosition(pk.pos.x * TILE, pk.pos.y * TILE);
    }
    this.cull(this.pickupSprites, live);
  }

  /** Shows the nearby pickup's name + effect when the player is within ~1 tile. */
  private updateItemTooltip(): void {
    const SHOW_RANGE = 2.5; // ~2 tiles between the player and the item, center-to-center
    const p = this.state.player.pos;
    let nearest: (typeof this.state.pickups)[number] | undefined;
    let best = Infinity;
    for (const pk of this.state.pickups) {
      const d = Math.hypot(p.x - pk.pos.x, p.y - pk.pos.y);
      if (d < best) {
        best = d;
        nearest = pk;
      }
    }
    if (nearest && best <= SHOW_RANGE) {
      let label: string | undefined;
      if (nearest.kind === 'heart') {
        label = `Heart\nRestores ${nearest.heal} HP.`;
      } else {
        const item = getItem(nearest.itemId);
        if (item) label = `${item.name}\n${item.description}`;
      }
      if (label) {
        this.tooltip
          .setText(label)
          .setPosition(nearest.pos.x * TILE, nearest.pos.y * TILE - nearest.radius * TILE - 6)
          .setVisible(true);
        return;
      }
    }
    this.tooltip.setVisible(false);
  }

  private syncTeleporter(): void {
    const show =
      this.state.bossDefeated && this.state.currentRoom === this.state.dungeon.bossRoom;
    if (show) {
      if (!this.teleporter) {
        this.teleporter = this.add
          .circle(TELEPORTER_POS.x * TILE, TELEPORTER_POS.y * TILE, TELEPORTER_RADIUS * TILE, 0xb14aff)
          .setStrokeStyle(2, 0xe7c6ff)
          .setDepth(7);
      }
      this.teleporter.setVisible(true);
    } else {
      this.teleporter?.setVisible(false);
    }
  }

  private cull<T extends Phaser.GameObjects.GameObject>(
    sprites: Map<number, T>,
    live: Set<number>,
  ): void {
    for (const [id, sprite] of sprites) {
      if (!live.has(id)) {
        sprite.destroy();
        sprites.delete(id);
      }
    }
  }

  private drawRoom(): void {
    this.tiles.clear(true, true);
    const { grid } = this.state;
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const color = isWall(grid, x, y) ? 0x2a2a3a : 0x1b1b26;
        const tile = this.add
          .rectangle(x * TILE + TILE / 2, y * TILE + TILE / 2, TILE - 1, TILE - 1, color)
          .setStrokeStyle(1, 0x0f0f16);
        this.tiles.add(tile);
      }
    }
  }
}
