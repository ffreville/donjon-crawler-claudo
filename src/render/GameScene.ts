import Phaser from 'phaser';
import {
  createGame,
  FIXED_DT,
  getItem,
  isWall,
  ROOM_W,
  TELEPORTER_POS,
  TELEPORTER_RADIUS,
  tick,
  type EnemyKind,
  type GameState,
  type InputState,
  type PickupKind,
} from '../core/index.js';
import { createButton, getShowStats, PALETTE } from './ui.js';

export const TILE = 40;

/** Width of the right-hand HUD strip (minimap + stats), outside the play area. */
export const PANEL_W = 180;

/** Enemy fill color per archetype. */
const ENEMY_COLORS: Record<EnemyKind, number> = {
  chaser: 0xe5484d,
  swarmer: 0xff9f43,
  shooter: 0x5b8cff,
  tank: 0x9b6b3a,
};

/** Pickup fill color per kind. */
const PICKUP_COLORS: Record<PickupKind, number> = {
  item: 0x4ad6c8,
  heart: 0xff6b81,
  coin: 0xffd23f,
};

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
  private tooltip!: Phaser.GameObjects.Text;
  private statsPanel!: Phaser.GameObjects.Text;
  private tiles!: Phaser.GameObjects.Group;
  /** End-of-run menu (buttons), shown on death/victory. */
  private endMenu!: Phaser.GameObjects.Group;
  private endShown = false;
  /** Pause menu (buttons), shown on Escape during play. */
  private pauseMenu!: Phaser.GameObjects.Group;
  private paused = false;
  /** Minimap (room graph) in the right-hand strip. */
  private minimap!: Phaser.GameObjects.Group;
  private minimapKey = '';
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
  private priceLabels = new Map<number, Phaser.GameObjects.Text>();
  private teleporter?: Phaser.GameObjects.Arc;

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.tiles = this.add.group();
    this.minimap = this.add.group();
    this.startRun();

    // Right-hand HUD strip background + separator, outside the play area.
    const playW = ROOM_W * TILE;
    this.add.rectangle(playW, 0, PANEL_W, this.scale.height, 0x0c0c12).setOrigin(0).setDepth(40);
    this.add.rectangle(playW, 0, 2, this.scale.height, 0x2a2a3a).setOrigin(0).setDepth(41);
    this.add
      .text(playW + 12, 8, 'MAP', { fontFamily: 'monospace', fontSize: '12px', color: '#8a93a3' })
      .setDepth(42);

    const size = this.state.player.radius * 2 * TILE;
    const p = this.state.player.pos;
    this.player = this.add.rectangle(p.x * TILE, p.y * TILE, size, size, 0xffd166).setDepth(10);

    this.hud = this.add
      .text(8, 6, '', { fontFamily: 'monospace', fontSize: '16px', color: '#ffffff' })
      .setDepth(100);

    this.endMenu = this.add.group();
    this.pauseMenu = this.add.group();

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

    // Character stats in the right strip, below the minimap.
    this.statsPanel = this.add
      .text(this.scale.width - 8, 200, '', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#dff1ff',
        align: 'right',
        backgroundColor: '#0a131baa',
        padding: { x: 8, y: 6 },
      })
      .setOrigin(1, 0)
      .setDepth(90)
      .setAlpha(0.6)
      .setVisible(getShowStats(this));

    this.bindInput();
  }

  /** Start a fresh run with the current seed and reset all view caches. */
  private startRun(): void {
    this.state = createGame(this.seed);
    this.roomKey = '';
    this.minimapKey = '';
    this.minimap?.clear(true, true);
    this.held.clear();
    this.accumulator = 0;
    this.endShown = false;
    this.paused = false;
    this.pauseMenu?.clear(true, true);
    for (const s of this.enemySprites.values()) s.destroy();
    this.enemySprites.clear();
    for (const s of this.projectileSprites.values()) s.destroy();
    this.projectileSprites.clear();
    for (const s of this.pickupSprites.values()) s.destroy();
    this.pickupSprites.clear();
    for (const s of this.priceLabels.values()) s.destroy();
    this.priceLabels.clear();
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
    // End-of-run shortcuts (only once the run is over).
    kb.on('keydown-R', () => {
      if (this.state.status !== 'playing') this.replay();
    });
    kb.on('keydown-M', () => {
      if (this.state.status !== 'playing') this.scene.start('MenuScene');
    });
    // Escape: open/close the pause menu during play; go to menu once the run is over.
    kb.on('keydown-ESC', () => {
      if (this.state.status !== 'playing') this.scene.start('MenuScene');
      else this.togglePause();
    });
    // Avoid stuck keys when the window loses focus or returns from a sub-scene.
    this.game.events.on(Phaser.Core.Events.BLUR, () => this.held.clear());
    this.events.on(Phaser.Scenes.Events.RESUME, () => this.held.clear());
  }

  private togglePause(): void {
    if (this.paused) {
      this.paused = false;
      this.pauseMenu.clear(true, true);
    } else {
      this.paused = true;
      this.showPauseMenu();
    }
  }

  private showPauseMenu(): void {
    const { width, height } = this.scale;
    const dim = this.add.rectangle(0, 0, width, height, PALETTE.bg, 0.82).setOrigin(0).setDepth(200);
    const title = this.add
      .text(width / 2, height * 0.26, 'PAUSE', {
        fontFamily: 'monospace',
        fontSize: '36px',
        color: PALETTE.accent,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(201);
    const resume = createButton(this, width / 2, height * 0.48, 'Reprendre  (Echap)', () =>
      this.togglePause(),
    ).setDepth(201);
    const options = createButton(this, width / 2, height * 0.48 + 64, 'Options', () => {
      this.scene.pause();
      this.scene.launch('OptionsScene', { returnTo: 'GameScene' });
      // GameScene is last in the scene list, so it renders over a launched
      // overlay — bring Options to the front so it's actually visible/clickable.
      this.scene.bringToTop('OptionsScene');
    }).setDepth(201);
    const menu = createButton(this, width / 2, height * 0.48 + 128, 'Menu principal', () =>
      this.scene.start('MenuScene'),
    ).setDepth(201);
    this.pauseMenu.addMultiple([dim, title, resume, options, menu]);
  }

  private replay(): void {
    this.seed++;
    this.startRun();
    this.hideEndMenu();
  }

  private showEndMenu(won: boolean): void {
    this.endShown = true;
    const { width, height } = this.scale;
    const dim = this.add.rectangle(0, 0, width, height, PALETTE.bg, 0.82).setOrigin(0).setDepth(200);
    const title = this.add
      .text(width / 2, height * 0.3, won ? 'VICTORY' : 'GAME OVER', {
        fontFamily: 'monospace',
        fontSize: '36px',
        color: won ? '#7cffb2' : '#ff8080',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(201);
    const replay = createButton(this, width / 2, height * 0.52, 'Rejouer  (R)', () =>
      this.replay(),
    ).setDepth(201);
    const menu = createButton(this, width / 2, height * 0.52 + 64, 'Menu principal  (M)', () =>
      this.scene.start('MenuScene'),
    ).setDepth(201);
    this.endMenu.addMultiple([dim, title, replay, menu]);
  }

  private hideEndMenu(): void {
    this.endMenu.clear(true, true);
    this.endShown = false;
  }

  update(_time: number, deltaMs: number): void {
    if (this.paused) return; // frozen; the pause menu renders on its own
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
    this.updateMinimap();

    const type = dungeon.rooms.get(currentRoom)?.type ?? '?';
    const lock = doorsOpen ? '' : '  [LOCKED]';
    this.hud.setText(
      `HP ${player.hp}/${player.maxHp}   coins ${player.coins}   floor ${this.state.floor}   room: ${type}${lock}   enemies ${this.state.enemies.length}`,
    );

    this.statsPanel.setVisible(getShowStats(this)); // reflect the Options toggle live
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

    if (this.state.status !== 'playing') {
      if (!this.endShown) this.showEndMenu(this.state.status === 'won');
    } else if (this.endShown) {
      this.hideEndMenu();
    }
  }

  private syncEnemies(): void {
    const live = new Set<number>();
    for (const e of this.state.enemies) {
      live.add(e.id);
      let sprite = this.enemySprites.get(e.id);
      if (!sprite) {
        const size = e.radius * 2 * TILE;
        sprite = this.add.rectangle(0, 0, size, size, ENEMY_COLORS[e.kind]).setDepth(5);
        this.enemySprites.set(e.id, sprite);
      }
      sprite.setPosition(e.pos.x * TILE, e.pos.y * TILE);
      // Outline shows active status: burning (orange) takes visual priority over slowed (cyan).
      const burning = e.effects.some((fx) => fx.kind === 'burn');
      const slowed = e.effects.some((fx) => fx.kind === 'slow');
      if (burning) sprite.setStrokeStyle(3, 0xff7a3a);
      else if (slowed) sprite.setStrokeStyle(3, 0x7ad6ff);
      else sprite.setStrokeStyle(0);
    }
    this.cull(this.enemySprites, live);
  }

  private syncProjectiles(): void {
    const live = new Set<number>();
    for (const p of this.state.projectiles) {
      live.add(p.id);
      let sprite = this.projectileSprites.get(p.id);
      if (!sprite) {
        const color = p.source === 'enemy' ? 0xff5d5d : 0xffe9a8;
        sprite = this.add.circle(0, 0, p.radius * TILE, color).setDepth(8);
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
        const color = PICKUP_COLORS[pk.kind];
        sprite = this.add.circle(0, 0, pk.radius * TILE, color).setDepth(6);
        this.pickupSprites.set(pk.id, sprite);
      }
      sprite.setPosition(pk.pos.x * TILE, pk.pos.y * TILE);

      // Price tag under priced (shop) pickups.
      const cost = pk.kind === 'coin' ? 0 : pk.cost;
      if (cost > 0) {
        let label = this.priceLabels.get(pk.id);
        if (!label) {
          label = this.add
            .text(0, 0, `${cost}c`, { fontFamily: 'monospace', fontSize: '12px', color: '#ffd23f' })
            .setOrigin(0.5, 0)
            .setDepth(60);
          this.priceLabels.set(pk.id, label);
        }
        label.setPosition(pk.pos.x * TILE, pk.pos.y * TILE + pk.radius * TILE + 2);
      }
    }
    this.cull(this.pickupSprites, live);
    this.cull(this.priceLabels, live);
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
      if (nearest.kind === 'coin') {
        label = `Coins +${nearest.value}`;
      } else if (nearest.kind === 'heart') {
        label = `Heart\nRestores ${nearest.heal} HP.`;
        if (nearest.cost > 0) label += `\nCost: ${nearest.cost} coins`;
      } else {
        const item = getItem(nearest.itemId);
        if (item) {
          label = `${item.name}\n${item.description}`;
          if (nearest.cost > 0) label += `\nCost: ${nearest.cost} coins`;
        }
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

  /** Redraws the minimap when the floor, current room, or explored set changes. */
  private updateMinimap(): void {
    const visited = [...this.state.roomRuntimes.values()].filter((r) => r.spawned).length;
    const key = `${this.state.floor}:${this.state.currentRoom}:${visited}`;
    if (key === this.minimapKey) return;
    this.minimapKey = key;
    this.drawMinimap();
  }

  private drawMinimap(): void {
    this.minimap.clear(true, true);
    const rooms = [...this.state.dungeon.rooms.values()];
    if (rooms.length === 0) return;

    const minGx = Math.min(...rooms.map((r) => r.gx));
    const minGy = Math.min(...rooms.map((r) => r.gy));
    const cell = 13;
    const gap = 3;
    const ox = ROOM_W * TILE + 12;
    const oy = 26;

    const typeColor: Record<string, number> = {
      start: 0x46d369,
      normal: 0x6b7280,
      treasure: 0xffd23f,
      shop: 0x4ad6c8,
      boss: 0xe5484d,
    };

    for (const room of rooms) {
      const rt = this.state.roomRuntimes.get(room.id);
      const visited = rt?.spawned ?? false;
      const x = ox + (room.gx - minGx) * (cell + gap) + cell / 2;
      const y = oy + (room.gy - minGy) * (cell + gap) + cell / 2;
      const color = typeColor[room.type] ?? 0x6b7280;
      const r = this.add
        .rectangle(x, y, cell, cell, color, visited ? 1 : 0.25)
        .setDepth(45);
      if (room.id === this.state.currentRoom) r.setStrokeStyle(2, 0xffffff);
      this.minimap.add(r);
    }
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
