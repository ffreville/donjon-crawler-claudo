import Phaser from 'phaser';
import {
  ACHIEVEMENTS,
  createGame,
  DEFAULT_CHARACTER_ID,
  FIXED_DT,
  floorClearedAchievements,
  gameWonAchievements,
  getItem,
  getOrbitalPositions,
  doorWorldPos,
  isDoorLocked,
  isWall,
  KNIFE_BASE_REACH,
  PLAYER_TEAR_RANGE,
  RAM_AIM_LEAD,
  RAM_CHARGE_TIME,
  ROOM_W,
  TELEPORTER_POS,
  TELEPORTER_RADIUS,
  tick,
  type Direction,
  type GameState,
  type InputState,
  type RoomType,
} from '../core/index.js';
import { unlockAchievement } from './achievementStore.js';
import {
  playAchievement,
  playBossDash,
  playCoin,
  playDoor,
  playEnemyDeath,
  playGameOver,
  playHeart,
  playHurt,
  playKey,
  playKnife,
  playPickup,
  playShoot,
  playUnlock,
  playUseItem,
  playWin,
  setSfxVolume,
  stopEnemyAmbience,
  updateEnemyAmbience,
} from './audio.js';
import { playMusicFromStart, setMusicVolume, stopMusic } from './music.js';
import {
  createButton,
  getMusicOn,
  getMusicVolume,
  getSfxVolume,
  getShowStats,
  getSoundOn,
  PALETTE,
} from './ui.js';
import {
  FLOOR_VARIANTS,
  floorTileKey,
  generateTextures,
  itemTint,
  themeForFloor,
  wallTileKey,
} from './textures.js';

export const TILE = 40;

/** Width of the right-hand HUD strip (minimap + stats), outside the play area. */
export const PANEL_W = 180;

/**
 * Visual size of the player sprite, in tile-radii. Decoupled from the (smaller)
 * collision radius so shrinking the hitbox for door clearance doesn't shrink the
 * drawn character.
 */
const PLAYER_SPRITE_RADIUS = 0.35;

/** Per-familiar-kind sprite (texture / size / optional tint). */
const FAMILIAR_LOOK: Record<string, { tex: string; w: number; h: number; tint?: number }> = {
  'key-dropper': { tex: 'key', w: TILE * 0.5, h: TILE * 0.85, tint: 0x9aa3ad },
  'heart-dropper': { tex: 'heart-full', w: TILE * 0.6, h: TILE * 0.6 },
  'coin-dropper': { tex: 'coin', w: TILE * 0.55, h: TILE * 0.55 },
  wisp: { tex: 'item-orb', w: TILE * 0.5, h: TILE * 0.5, tint: 0x9fe8ff },
  owl: { tex: 'enemy-shooter', w: TILE * 0.55, h: TILE * 0.55, tint: 0xb08a4f },
  hornet: { tex: 'enemy-fly', w: TILE * 0.55, h: TILE * 0.5, tint: 0xffc83a },
};

/** Boss tint per attack-pattern variant (boss texture is near-white). */
const BOSS_VARIANT_COLORS = [0xd6409f, 0x9b59ff, 0xff5d5d, 0xff8c1a];

/** Door sprite angle per wall side (texture is drawn pointing up). */
const DOOR_ANGLE: Record<Direction, number> = { up: 0, right: 90, down: 180, left: 270 };

/** Door frame tint per destination room type (undefined = untinted stone). */
const DOOR_TINT: Partial<Record<RoomType, number>> = {
  boss: 0xe5484d,
  miniboss: 0xff9f43,
  treasure: 0xffd23f,
  shop: 0x4ad6c8,
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
  'Space',
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
  private player!: Phaser.GameObjects.Image;
  private playerShadow!: Phaser.GameObjects.Image;
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
  /** Selected playable character (from the select screen); carried across replays. */
  private characterId = DEFAULT_CHARACTER_ID;
  /** Seeded run (player typed a seed): achievements are disabled for it. */
  private seeded = false;

  /** Currently held physical key codes. */
  private readonly held = new Set<string>();

  private enemySprites = new Map<number, Phaser.GameObjects.Image>();
  private enemyShadows = new Map<number, Phaser.GameObjects.Image>();
  private projectileSprites = new Map<number, Phaser.GameObjects.Image>();
  private pickupSprites = new Map<number, Phaser.GameObjects.Image>();
  private pedestals = new Map<number, Phaser.GameObjects.Image>();
  private priceLabels = new Map<number, Phaser.GameObjects.Text>();
  private teleporter?: Phaser.GameObjects.Image;
  private bossBarBg?: Phaser.GameObjects.Rectangle;
  private bossBarFill?: Phaser.GameObjects.Rectangle;
  /** Telegraph line showing where a charging ram boss will dash. */
  private bossChargeLine?: Phaser.GameObjects.Rectangle;
  /** Last-seen HP per enemy id, to detect hits for damage numbers / flashes. */
  private enemyHp = new Map<number, number>();
  /** Per-enemy white-flash deadline (ms timestamps), set on hit. */
  private enemyFlashUntil = new Map<number, number>();
  private prevPlayerHp = 0;
  private hurtFlash!: Phaser.GameObjects.Rectangle;
  /** Rebirth-style HUD (hearts + counters); rebuilt when its key changes. */
  private hudGroup!: Phaser.GameObjects.Group;
  private hudKey = '';
  /** Item-name banner shown when an item is picked up. */
  private itemBanner!: Phaser.GameObjects.Text;
  private bannerTween?: Phaser.Tweens.Tween;
  private prevItemCount = 0;
  /** Last seen player shot count; a rise cues the tear sound. */
  private prevShotsFired = 0;
  /** Edge-triggered "use active item" request, consumed by the next tick. */
  private useQueued = false;
  /** Last seen coin / key totals; a rise cues the pickup sound. */
  private prevCoins = 0;
  private prevKeys = 0;
  /** Previous-frame snapshots for one-shot SFX edge detection. */
  private prevEnemyIds = new Set<number>();
  private prevRoomSfx = -1;
  private prevActiveCharge = 0;
  private prevKnifeThrowing = false;
  private prevRamDashing = false;
  private prevStatus = 'playing';
  /** One sprite per owned familiar; they ease toward a spot beside the player. */
  private familiarSprites: Phaser.GameObjects.Image[] = [];
  /** One sprite per orbital (Orbital Fly) circling the player. */
  private orbitalSprites: Phaser.GameObjects.Image[] = [];
  /** The Mom's Knife blade (a rotated bar), shown only when the knife is held. */
  private knifeSprite?: Phaser.GameObjects.Rectangle;
  /** Achievement-unlock detection + toast popup state. */
  private prevBossDefeated = false;
  private prevWon = false;
  private achToastQueue: string[] = [];
  private achToast?: Phaser.GameObjects.Text;
  private achToastBusy = false;

  constructor() {
    super('GameScene');
  }

  init(data: { characterId?: string; seed?: number; seeded?: boolean }): void {
    if (data?.characterId) this.characterId = data.characterId;
    // A fresh run gets a random seed (chosen by the launcher), so dungeons and the
    // item bag vary. Replays then increment from it. The core stays deterministic.
    if (typeof data?.seed === 'number') this.seed = data.seed;
    this.seeded = data?.seeded === true; // seeded runs don't unlock achievements
  }

  create(): void {
    generateTextures(this, ROOM_W * TILE, this.scale.height);
    this.tiles = this.add.group();
    this.minimap = this.add.group();
    this.hudGroup = this.add.group();
    this.startRun();

    // Right-hand HUD strip background + separator, outside the play area.
    const playW = ROOM_W * TILE;
    this.add.rectangle(playW, 0, PANEL_W, this.scale.height, 0x0c0c12).setOrigin(0).setDepth(40);
    this.add.rectangle(playW, 0, 2, this.scale.height, 0x2a2a3a).setOrigin(0).setDepth(41);
    this.add
      .text(playW + 12, 8, 'MAP', { fontFamily: 'monospace', fontSize: '12px', color: '#8a93a3' })
      .setDepth(42);

    // Cave-ambiance vignette over the play area (under menus and HUD).
    this.add.image(0, 0, 'vignette').setOrigin(0).setDepth(30);

    const size = PLAYER_SPRITE_RADIUS * 2 * TILE;
    const p = this.state.player.pos;
    this.playerShadow = this.add.image(p.x * TILE, p.y * TILE + size * 0.62, 'shadow').setDepth(9);
    this.playerShadow.setDisplaySize(size * 1.2, size * 0.5);
    const playerTex = this.textures.exists(`player-${this.characterId}`)
      ? `player-${this.characterId}`
      : 'player';
    this.player = this.add.image(p.x * TILE, p.y * TILE, playerTex).setDepth(10);
    this.player.setDisplaySize(size * 1.25, size * 1.4);

    // Red screen flash when the player is hurt (over the play area only).
    this.hurtFlash = this.add
      .rectangle(0, 0, ROOM_W * TILE, this.scale.height, 0xff0000)
      .setOrigin(0)
      .setDepth(95)
      .setAlpha(0);

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

    // Item pickup announcement, centered near the top of the play area.
    this.itemBanner = this.add
      .text(playW / 2, 64, '', {
        fontFamily: 'monospace',
        fontSize: '17px',
        color: '#ffe9a8',
        backgroundColor: '#10101add',
        align: 'center',
        padding: { x: 14, y: 8 },
      })
      .setOrigin(0.5)
      .setDepth(140)
      .setAlpha(0);

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

    // Apply the saved volumes, then loop the music from the start of the run.
    setSfxVolume(getSfxVolume(this));
    setMusicVolume(getMusicVolume(this));
    playMusicFromStart(getMusicOn(this));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      stopMusic();
      stopEnemyAmbience();
    });
  }

  /** Start a fresh run with the current seed and reset all view caches. */
  private startRun(): void {
    this.state = createGame(this.seed, { characterId: this.characterId });
    this.roomKey = '';
    this.minimapKey = '';
    this.minimap?.clear(true, true);
    this.enemyHp.clear();
    this.enemyFlashUntil.clear();
    this.prevPlayerHp = this.state.player.hp;
    this.prevItemCount = this.state.player.items.length;
    this.prevShotsFired = this.state.player.shotsFired;
    this.prevCoins = this.state.player.coins;
    this.prevKeys = this.state.player.keys;
    this.prevEnemyIds = new Set();
    this.prevRoomSfx = -1;
    this.prevActiveCharge = this.state.player.activeCharge;
    this.prevKnifeThrowing = false;
    this.prevRamDashing = false;
    this.prevStatus = 'playing';
    this.hudKey = '';
    this.hudGroup?.clear(true, true);
    this.bannerTween?.remove();
    this.bannerTween = undefined;
    this.itemBanner?.setAlpha(0);
    this.hurtFlash?.setAlpha(0);
    this.held.clear();
    this.accumulator = 0;
    this.endShown = false;
    this.paused = false;
    this.pauseMenu?.clear(true, true);
    for (const s of this.enemySprites.values()) s.destroy();
    this.enemySprites.clear();
    for (const s of this.enemyShadows.values()) s.destroy();
    this.enemyShadows.clear();
    for (const s of this.projectileSprites.values()) s.destroy();
    this.projectileSprites.clear();
    for (const s of this.familiarSprites) s.destroy();
    this.familiarSprites = [];
    for (const s of this.orbitalSprites) s.destroy();
    this.orbitalSprites = [];
    this.knifeSprite?.destroy();
    this.knifeSprite = undefined;
    this.prevBossDefeated = false;
    this.prevWon = false;
    this.achToastQueue = [];
    this.achToastBusy = false;
    this.achToast?.destroy();
    this.achToast = undefined;
    for (const s of this.pickupSprites.values()) s.destroy();
    this.pickupSprites.clear();
    for (const s of this.pedestals.values()) s.destroy();
    this.pedestals.clear();
    for (const s of this.priceLabels.values()) s.destroy();
    this.priceLabels.clear();
    this.teleporter?.destroy();
    this.teleporter = undefined;
    this.bossBarBg?.destroy();
    this.bossBarBg = undefined;
    this.bossBarFill?.destroy();
    this.bossBarFill = undefined;
    this.bossChargeLine?.destroy();
    this.bossChargeLine = undefined;
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
    // Space: use the held active item (edge-triggered; consumed next tick).
    kb.on('keydown-SPACE', () => {
      if (this.state.status === 'playing' && !this.paused) this.useQueued = true;
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
      // overlay — bring it to the front so it's actually visible/clickable.
      this.scene.bringToTop('OptionsScene');
    }).setDepth(201);
    const achievements = createButton(this, width / 2, height * 0.48 + 128, 'Succès', () => {
      this.scene.pause();
      this.scene.launch('AchievementsScene', { returnTo: 'GameScene' });
      this.scene.bringToTop('AchievementsScene');
    }).setDepth(201);
    const menu = createButton(this, width / 2, height * 0.48 + 192, 'Menu principal', () =>
      this.scene.start('MenuScene'),
    ).setDepth(201);
    this.pauseMenu.addMultiple([dim, title, resume, options, achievements, menu]);
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
    // Only clear the queued use once a tick has actually consumed it, so a press
    // landing on a frame that runs no tick isn't dropped.
    if (steps > 0) this.useQueued = false;

    // Enemy ambience: a buzz that tracks fly count, periodic groans for melee foes.
    let flies = 0;
    let melee = 0;
    for (const e of this.state.enemies) {
      if (e.kind === 'fly') flies++;
      else if (e.kind !== 'shooter' && e.kind !== 'boss') melee++;
    }
    updateEnemyAmbience(flies, melee, deltaMs, getSoundOn(this));

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
      useItem: this.useQueued,
    };
  }

  private render(): void {
    const { player, currentRoom, doorsOpen } = this.state;

    this.checkAchievements();

    // The grid changes when the room changes, its doors open, or a locked door
    // gets opened with a key — redraw then.
    const lockedKey = this.state.doors.filter((d) => isDoorLocked(this.state, d)).length;
    const key = `${currentRoom}:${doorsOpen}:${lockedKey}`;
    if (key !== this.roomKey) {
      this.drawRoom();
      this.roomKey = key;
    }

    const size = PLAYER_SPRITE_RADIUS * 2 * TILE;
    // When flying, lift the sprite off its (ground-anchored) shadow to read as hovering.
    const lift = player.flying ? size * 0.35 : 0;
    this.player.setPosition(player.pos.x * TILE, player.pos.y * TILE - lift);
    this.player.setAlpha(player.invuln > 0 ? 0.5 : 1);
    this.playerShadow.setPosition(player.pos.x * TILE, player.pos.y * TILE + size * 0.62);

    // Mom's Knife: a held bar that extends with charge, or a short flying blade
    // once thrown (it leaves the hand, flies out and returns).
    if (player.knife) {
      if (!this.knifeSprite) {
        this.knifeSprite = this.add.rectangle(0, 0, 1, 1, 0xd8dde6).setOrigin(0, 0.5).setDepth(11);
      }
      this.knifeSprite.setVisible(true);
      const thrown = player.knifeThrow;
      if (thrown) {
        this.knifeSprite
          .setPosition(thrown.pos.x * TILE, thrown.pos.y * TILE)
          .setRotation(Math.atan2(thrown.dir.y, thrown.dir.x))
          .setDisplaySize(TILE * 0.9, 7)
          .setFillStyle(0xfff2a0);
      } else {
        // Held blade: fixed length (no extend while charging), scaled by range items.
        const heldReach = KNIFE_BASE_REACH * (player.tearRange / PLAYER_TEAR_RANGE);
        this.knifeSprite
          .setPosition(player.pos.x * TILE, player.pos.y * TILE - lift)
          .setRotation(Math.atan2(player.knifeDir.y, player.knifeDir.x))
          .setDisplaySize(heldReach * TILE, 6)
          .setFillStyle(player.knifeCharge > 0.98 ? 0xfff2a0 : 0xd8dde6);
      }
    } else if (this.knifeSprite) {
      this.knifeSprite.setVisible(false);
    }

    const sfx = getSoundOn(this);

    // Player-hit feedback: screen shake + red flash + hurt sound when HP drops;
    // a soft heart cue when HP rises (heal).
    if (player.hp < this.prevPlayerHp) {
      this.cameras.main.shake(120, 0.008);
      this.hurtFlash.setAlpha(0.35);
      this.tweens.add({ targets: this.hurtFlash, alpha: 0, duration: 250 });
      if (sfx) playHurt();
    } else if (player.hp > this.prevPlayerHp && sfx) {
      playHeart();
    }
    this.prevPlayerHp = player.hp;

    // Item pickup announcement when the inventory grows.
    if (player.items.length > this.prevItemCount) {
      const lastId = player.items[player.items.length - 1];
      const item = lastId !== undefined ? getItem(lastId) : undefined;
      if (item) this.showItemBanner(item.name, item.description);
      if (sfx) playPickup();
    }
    this.prevItemCount = player.items.length;

    // Tear sound: one cue per trigger pull (the core counts shots, not pellets).
    if (player.shotsFired > this.prevShotsFired && sfx) playShoot();
    this.prevShotsFired = player.shotsFired;

    if (sfx) {
      if (player.coins > this.prevCoins) playCoin();
      if (player.keys > this.prevKeys) playKey();
      if (player.keys < this.prevKeys) playUnlock(); // spent a key on a locked door
    }
    this.prevCoins = player.coins;
    this.prevKeys = player.keys;

    if (sfx) this.playEventSounds();

    this.syncEnemies();
    this.updateBossTelegraph();
    this.syncProjectiles();
    this.syncPickups();
    this.syncFamiliars();
    this.syncOrbitals();
    this.syncTeleporter();
    this.syncBossBar();
    this.updateItemTooltip();
    this.updateMinimap();
    this.syncHud();

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
        `SHOTS ${player.shotCount}${player.piercing ? ' pierce' : ''}${player.homing ? ' homing' : ''}`,
        `FLY   ${player.flying ? 'yes' : 'no'}`,
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

  /** Rebirth-style HUD: heart row, coin/key counters, floor label. */
  private syncHud(): void {
    const p = this.state.player;
    const key = `${p.hp}:${p.maxHp}:${p.coins}:${p.keys}:${this.state.floor}:${p.activeItem ?? '-'}:${p.activeCharge}`;
    if (key === this.hudKey) return;
    this.hudKey = key;
    this.hudGroup.clear(true, true);

    // Hearts: full / half / empty, wrapping every 8.
    const HX = 12;
    const HY = 10;
    const SP = 24;
    for (let i = 0; i < p.maxHp; i++) {
      const tex = p.hp >= i + 1 ? 'heart-full' : p.hp > i ? 'heart-half' : 'heart-empty';
      const col = i % 8;
      const row = Math.floor(i / 8);
      this.hudGroup.add(
        this.add
          .image(HX + col * SP, HY + row * SP, tex)
          .setOrigin(0)
          .setScale(3)
          .setDepth(100),
      );
    }

    const countersY = HY + Math.ceil(p.maxHp / 8) * SP + 8;
    const counter = (icon: string, y: number, value: string, color: string): void => {
      this.hudGroup.add(this.add.image(20, y, icon).setScale(2.2).setDepth(100));
      this.hudGroup.add(
        this.add
          .text(36, y, value, {
            fontFamily: 'monospace',
            fontSize: '15px',
            color,
            fontStyle: 'bold',
          })
          .setOrigin(0, 0.5)
          .setDepth(100),
      );
    };
    counter('coin', countersY + 8, `x ${p.coins}`, '#ffd23f');
    counter('key', countersY + 30, `x ${p.keys}`, '#e8c95a');
    this.hudGroup.add(
      this.add
        .text(12, countersY + 48, `ETAGE ${this.state.floor}`, {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#8a93a3',
        })
        .setDepth(100),
    );

    // Active item slot: a boxed icon with the item name and a charge bar, so it's
    // unmistakable that a usable item is equipped (and whether it's ready).
    if (p.activeItem) {
      const item = getItem(p.activeItem);
      const max = item?.active?.charge ?? 0;
      const ready = max > 0 && p.activeCharge >= max;
      const boxX = 12;
      const boxY = countersY + 70;
      const boxW = 150;
      const boxH = 40;

      const box = this.add
        .rectangle(boxX, boxY, boxW, boxH, 0x10141e, 0.85)
        .setOrigin(0)
        .setStrokeStyle(2, ready ? 0x7cffb2 : 0x3a4150)
        .setDepth(100);
      this.hudGroup.add(box);
      // Icon in a square cell on the left of the box.
      this.hudGroup.add(
        this.add.image(boxX + 20, boxY + boxH / 2, 'item-orb').setScale(2.6).setDepth(101),
      );
      this.hudGroup.add(
        this.add
          .text(boxX + 40, boxY + 9, item?.name ?? p.activeItem, {
            fontFamily: 'monospace',
            fontSize: '12px',
            color: '#dfe7ef',
            fontStyle: 'bold',
          })
          .setOrigin(0, 0.5)
          .setDepth(101),
      );
      // Charge bar (full + green text "PRET" when usable).
      const barX = boxX + 40;
      const barY = boxY + 26;
      const barW = 96;
      this.hudGroup.add(
        this.add.rectangle(barX, barY, barW, 7, 0x000000, 0.5).setOrigin(0).setDepth(101),
      );
      const frac = max > 0 ? Math.min(1, p.activeCharge / max) : 0;
      if (frac > 0) {
        this.hudGroup.add(
          this.add
            .rectangle(barX, barY, barW * frac, 7, ready ? 0x7cffb2 : 0xffd23f)
            .setOrigin(0)
            .setDepth(101),
        );
      }
      this.hudGroup.add(
        this.add
          .text(barX + barW + 6, barY + 3, ready ? 'PRET (Espace)' : `${p.activeCharge}/${max}`, {
            fontFamily: 'monospace',
            fontSize: '10px',
            color: ready ? '#7cffb2' : '#8a93a3',
          })
          .setOrigin(0, 0.5)
          .setDepth(101),
      );
    }
  }

  /** Shows the picked-up item's name, then fades out. */
  private showItemBanner(name: string, description: string): void {
    this.bannerTween?.remove();
    this.itemBanner.setText(`${name}\n${description}`).setAlpha(1);
    this.bannerTween = this.tweens.add({
      targets: this.itemBanner,
      alpha: 0,
      delay: 1800,
      duration: 600,
      ease: 'Quad.easeIn',
    });
  }

  private syncEnemies(): void {
    const now = this.time.now;
    const live = new Set<number>();
    for (const e of this.state.enemies) {
      live.add(e.id);
      let sprite = this.enemySprites.get(e.id);
      if (!sprite) {
        const d = e.radius * 2 * TILE;
        const shadow = this.add.image(0, 0, 'shadow').setDepth(4);
        shadow.setDisplaySize(d * 1.2, d * 0.45);
        this.enemyShadows.set(e.id, shadow);
        sprite = this.add.image(0, 0, `enemy-${e.kind}`).setDepth(5);
        sprite.setDisplaySize(d * 1.25, d * 1.25);
        this.enemySprites.set(e.id, sprite);
      }
      sprite.setPosition(e.pos.x * TILE, e.pos.y * TILE);
      const shadow = this.enemyShadows.get(e.id);
      shadow?.setPosition(e.pos.x * TILE, e.pos.y * TILE + e.radius * TILE * 0.85);

      // Ram boss: pulse bigger while charging its dash (visual tell).
      if (e.kind === 'boss' && e.bossVariant === 3) {
        const base = e.radius * 2 * TILE * 1.25;
        const pulse = e.dashSpeed === 0 ? 1 + 0.14 * Math.sin(now / 55) : 1;
        sprite.setDisplaySize(base * pulse, base * pulse);
      }

      // Hit feedback: a chunk of damage (>=1) spawns a floating number + white flash.
      const prev = this.enemyHp.get(e.id);
      if (prev !== undefined && e.hp < prev) {
        const dmg = Math.round(prev - e.hp);
        if (dmg >= 1) {
          this.spawnDamageNumber(e.pos.x * TILE, e.pos.y * TILE, dmg);
          this.enemyFlashUntil.set(e.id, now + 60);
        }
      }
      this.enemyHp.set(e.id, e.hp);

      // Tint priority: hit flash > burning > slowed > boss variant > none.
      const flashing = (this.enemyFlashUntil.get(e.id) ?? 0) > now;
      const burning = e.effects.some((fx) => fx.kind === 'burn');
      const slowed = e.effects.some((fx) => fx.kind === 'slow');
      const ramLocked =
        e.kind === 'boss' &&
        e.bossVariant === 3 &&
        e.dashSpeed === 0 &&
        e.aiTimer >= RAM_CHARGE_TIME - RAM_AIM_LEAD;
      if (flashing) sprite.setTintFill(0xffffff);
      else if (ramLocked) sprite.setTint(Math.floor(now / 80) % 2 === 0 ? 0xffffff : 0xff3030);
      else if (burning) sprite.setTint(0xffa14d);
      else if (slowed) sprite.setTint(0x8fd0ff);
      else if (e.kind === 'boss') sprite.setTint(BOSS_VARIANT_COLORS[e.bossVariant] ?? 0xd6409f);
      else sprite.clearTint();
    }
    this.cull(this.enemySprites, live);
    this.cull(this.enemyShadows, live);
    for (const id of this.enemyHp.keys()) if (!live.has(id)) this.enemyHp.delete(id);
    for (const id of this.enemyFlashUntil.keys()) if (!live.has(id)) this.enemyFlashUntil.delete(id);
  }

  /** A small damage number that floats up and fades. */
  private spawnDamageNumber(px: number, py: number, dmg: number): void {
    const label = this.add
      .text(px, py - 8, `${dmg}`, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffe066',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(120);
    this.tweens.add({
      targets: label,
      y: py - 32,
      alpha: 0,
      duration: 480,
      ease: 'Quad.easeOut',
      onComplete: () => label.destroy(),
    });
  }

  private syncProjectiles(): void {
    const live = new Set<number>();
    for (const p of this.state.projectiles) {
      live.add(p.id);
      let sprite = this.projectileSprites.get(p.id);
      if (!sprite) {
        const tex = p.source === 'enemy' ? 'enemy-tear' : 'tear';
        const d = p.radius * 2 * TILE;
        sprite = this.add.image(0, 0, tex).setDepth(8);
        sprite.setDisplaySize(d * 1.5, d * 1.5);
        this.projectileSprites.set(p.id, sprite);
      }
      sprite.setPosition(p.pos.x * TILE, p.pos.y * TILE);
    }
    this.cull(this.projectileSprites, live);
  }

  private syncPickups(): void {
    const live = new Set<number>();
    const itemLive = new Set<number>();
    for (const pk of this.state.pickups) {
      live.add(pk.id);
      let sprite = this.pickupSprites.get(pk.id);
      if (!sprite) {
        const d = pk.radius * 2 * TILE;
        if (pk.kind === 'item') {
          // Items sit on a stone pedestal, with a per-item tint on the orb.
          const ped = this.add.image(0, 0, 'pedestal').setDepth(5);
          ped.setDisplaySize(TILE * 0.85, TILE * 0.55);
          this.pedestals.set(pk.id, ped);
          sprite = this.add.image(0, 0, 'item-orb').setDepth(6);
          sprite.setDisplaySize(TILE * 0.55, TILE * 0.55);
          sprite.setTint(itemTint(pk.itemId));
        } else if (pk.kind === 'heart') {
          sprite = this.add.image(0, 0, 'heart-full').setDepth(6);
          sprite.setDisplaySize(d * 1.4, d * 1.4);
        } else if (pk.kind === 'coin') {
          sprite = this.add.image(0, 0, 'coin').setDepth(6);
          sprite.setDisplaySize(d * 1.3, d * 1.3);
        } else {
          sprite = this.add.image(0, 0, 'key').setDepth(6);
          sprite.setDisplaySize(d * 0.85, d * 1.55);
        }
        this.pickupSprites.set(pk.id, sprite);
      }
      if (pk.kind === 'item') {
        itemLive.add(pk.id);
        sprite.setPosition(pk.pos.x * TILE, pk.pos.y * TILE - TILE * 0.12);
        this.pedestals.get(pk.id)?.setPosition(pk.pos.x * TILE, pk.pos.y * TILE + TILE * 0.22);
      } else {
        sprite.setPosition(pk.pos.x * TILE, pk.pos.y * TILE);
      }

      // Price tag under priced (shop) pickups.
      const cost = pk.kind === 'item' || pk.kind === 'heart' ? pk.cost : 0;
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
    this.cull(this.pedestals, itemLive);
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
      } else if (nearest.kind === 'key') {
        label = 'Key +1';
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
    const key = `${this.state.floor}:${this.state.currentRoom}:${visited}:${this.state.mapRevealed}`;
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
    const maxGx = Math.max(...rooms.map((r) => r.gx));
    const maxGy = Math.max(...rooms.map((r) => r.gy));
    const cols = maxGx - minGx + 1;
    const rows = maxGy - minGy + 1;
    const ox = ROOM_W * TILE + 12;
    const oy = 26;
    // Scale cells so the whole map fits the side strip even on big late floors.
    const gap = 2;
    const avail = PANEL_W - 20;
    const maxH = 150;
    const cell = Math.max(
      3,
      Math.min(13, Math.floor(avail / cols) - gap, Math.floor(maxH / rows) - gap),
    );

    // Record<RoomType,…> so a future room type is a compile error until colored.
    const typeColor: Record<RoomType, number> = {
      start: 0x46d369,
      normal: 0x6b7280,
      treasure: 0xffd23f,
      shop: 0x4ad6c8,
      boss: 0xe5484d,
      miniboss: 0xff9f43,
    };

    for (const room of rooms) {
      const rt = this.state.roomRuntimes.get(room.id);
      const visited = rt?.spawned ?? false;
      // Fog of war: only visited rooms are shown, unless the Dungeon Map revealed
      // the floor (then the unexplored rooms appear dimmed).
      if (!visited && !this.state.mapRevealed) continue;
      const x = ox + (room.gx - minGx) * (cell + gap) + cell / 2;
      const y = oy + (room.gy - minGy) * (cell + gap) + cell / 2;
      const color = typeColor[room.type] ?? 0x6b7280;
      const r = this.add.rectangle(x, y, cell, cell, color, visited ? 1 : 0.4).setDepth(45);
      if (room.id === this.state.currentRoom) r.setStrokeStyle(2, 0xffffff);
      this.minimap.add(r);
    }
  }

  /** Draws one sprite per owned familiar, easing toward a hovering spot by the player. */
  private syncFamiliars(): void {
    const fams = this.state.player.familiars;
    while (this.familiarSprites.length < fams.length) {
      const fam = fams[this.familiarSprites.length]!;
      const look = FAMILIAR_LOOK[fam.kind] ?? FAMILIAR_LOOK['key-dropper']!;
      const img = this.add.image(this.player.x, this.player.y, look.tex).setDepth(11);
      img.setDisplaySize(look.w, look.h);
      if (look.tint !== undefined) img.setTint(look.tint);
      this.familiarSprites.push(img);
    }
    while (this.familiarSprites.length > fams.length) this.familiarSprites.pop()?.destroy();

    // Position comes from the core (it eases the familiar toward the player); we
    // just convert to pixels and add a small cosmetic bob.
    const t = this.time.now / 1000;
    fams.forEach((fam, i) => {
      const sprite = this.familiarSprites[i]!;
      sprite.setPosition(fam.pos.x * TILE, fam.pos.y * TILE + Math.sin(t * 3 + i) * 3);
    });
  }

  /** Watches for floor-clear / win edges and unlocks the matching achievements. */
  private checkAchievements(): void {
    if (this.seeded) return; // seeded runs never unlock achievements
    const st = this.state;
    if (st.bossDefeated && !this.prevBossDefeated) {
      for (const id of floorClearedAchievements(st.floor, this.characterId)) {
        if (unlockAchievement(id)) this.queueAchievement(id);
      }
    }
    this.prevBossDefeated = st.bossDefeated;

    const won = st.status === 'won';
    if (won && !this.prevWon) {
      for (const id of gameWonAchievements(this.characterId)) {
        if (unlockAchievement(id)) this.queueAchievement(id);
      }
    }
    this.prevWon = won;
  }

  /** Enqueues an achievement toast and starts the display loop if idle. */
  private queueAchievement(id: string): void {
    this.achToastQueue.push(id);
    if (getSoundOn(this)) playAchievement();
    this.showNextToast();
  }

  private showNextToast(): void {
    if (this.achToastBusy) return;
    const id = this.achToastQueue.shift();
    if (id === undefined) return;
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (!a) {
      this.showNextToast();
      return;
    }
    this.achToastBusy = true;
    if (!this.achToast) {
      this.achToast = this.add
        .text(this.scale.width - 12, this.scale.height - 12, '', {
          fontFamily: 'monospace',
          fontSize: '14px',
          color: '#ffe9a8',
          backgroundColor: '#1a1430dd',
          align: 'right',
          padding: { x: 12, y: 8 },
        })
        .setOrigin(1, 1) // anchored to the bottom-right corner
        .setDepth(160);
    }
    this.achToast.setText(`SUCCÈS DÉBLOQUÉ\n${a.name}`).setAlpha(0).setVisible(true);
    this.tweens.add({
      targets: this.achToast,
      alpha: 1,
      duration: 220,
      yoyo: true,
      hold: 1800,
      onComplete: () => {
        this.achToast?.setVisible(false);
        this.achToastBusy = false;
        this.showNextToast();
      },
    });
  }

  /** Shows the ram boss's dash line once its direction is locked, just before it fires off. */
  private updateBossTelegraph(): void {
    const ram = this.state.enemies.find(
      (e) =>
        e.kind === 'boss' &&
        e.bossVariant === 3 &&
        e.dashSpeed === 0 &&
        e.aiTimer >= RAM_CHARGE_TIME - RAM_AIM_LEAD,
    );
    if (!ram) {
      this.bossChargeLine?.setVisible(false);
      return;
    }
    if (!this.bossChargeLine) {
      this.bossChargeLine = this.add.rectangle(0, 0, 1, 4, 0xff3030, 0.65).setOrigin(0, 0.5).setDepth(3);
    }
    this.bossChargeLine
      .setVisible(true)
      .setPosition(ram.pos.x * TILE, ram.pos.y * TILE)
      .setRotation(Math.atan2(ram.aiDir.y, ram.aiDir.x))
      .setDisplaySize(7 * TILE, 5);
  }

  /** Edge-detected one-shot SFX (door, knife throw, active use, boss dash, deaths, end). */
  private playEventSounds(): void {
    const s = this.state;
    const p = s.player;

    const roomChanged = s.currentRoom !== this.prevRoomSfx;
    if (roomChanged && this.prevRoomSfx !== -1) playDoor();

    // Enemy death: an id present last frame is gone now (and we didn't change room).
    const curIds = new Set<number>();
    for (const e of s.enemies) curIds.add(e.id);
    if (!roomChanged) {
      for (const id of this.prevEnemyIds) {
        if (!curIds.has(id)) {
          playEnemyDeath();
          break; // one cue per frame even if several died
        }
      }
    }
    this.prevEnemyIds = curIds;
    this.prevRoomSfx = s.currentRoom;

    if (p.activeCharge < this.prevActiveCharge) playUseItem(); // charge only drops on use
    this.prevActiveCharge = p.activeCharge;

    const throwing = p.knifeThrow !== null;
    if (throwing && !this.prevKnifeThrowing) playKnife();
    this.prevKnifeThrowing = throwing;

    const ramDashing = s.enemies.some(
      (e) => e.kind === 'boss' && e.bossVariant === 3 && e.dashSpeed > 0,
    );
    if (ramDashing && !this.prevRamDashing) playBossDash();
    this.prevRamDashing = ramDashing;

    if (s.status !== this.prevStatus) {
      if (s.status === 'won') playWin();
      else if (s.status === 'dead') playGameOver();
      this.prevStatus = s.status;
    }
  }

  /** Draws the orbiting flies at the positions the core computes. */
  private syncOrbitals(): void {
    const positions = getOrbitalPositions(this.state.player);
    while (this.orbitalSprites.length < positions.length) {
      const img = this.add.image(0, 0, 'enemy-fly').setDepth(11);
      img.setDisplaySize(TILE * 0.5, TILE * 0.45).setTint(0xbfe8a0); // pale-green orbiting fly
      this.orbitalSprites.push(img);
    }
    while (this.orbitalSprites.length > positions.length) this.orbitalSprites.pop()?.destroy();
    positions.forEach((p, i) => {
      this.orbitalSprites[i]!.setPosition(p.x * TILE, p.y * TILE);
    });
  }

  /** Boss HP bar across the top of the play area while a boss is alive. */
  private syncBossBar(): void {
    const boss = this.state.enemies.find((e) => e.kind === 'boss');
    if (!boss) {
      this.bossBarBg?.setVisible(false);
      this.bossBarFill?.setVisible(false);
      return;
    }
    const w = 320;
    const h = 10;
    const cx = (ROOM_W * TILE) / 2;
    const left = cx - w / 2;
    const y = 20;
    if (!this.bossBarBg) {
      this.bossBarBg = this.add.rectangle(cx, y, w, h, 0x3a0d1e).setDepth(110);
    }
    if (!this.bossBarFill) {
      this.bossBarFill = this.add.rectangle(left, y, w, h, 0xe5484d).setOrigin(0, 0.5).setDepth(111);
    }
    const ratio = Math.max(0, boss.hp / boss.maxHp);
    this.bossBarBg.setVisible(true);
    this.bossBarFill.setVisible(true).setPosition(left, y).setDisplaySize(w * ratio, h);
  }

  private syncTeleporter(): void {
    const show =
      this.state.bossDefeated && this.state.currentRoom === this.state.dungeon.bossRoom;
    if (show) {
      if (!this.teleporter) {
        this.teleporter = this.add
          .image(TELEPORTER_POS.x * TILE, TELEPORTER_POS.y * TILE, 'teleporter')
          .setDepth(7);
        const d = TELEPORTER_RADIUS * 2 * TILE;
        this.teleporter.setDisplaySize(d * 1.3, d * 1.3);
      }
      this.teleporter.setVisible(true);
      this.teleporter.rotation += 0.02; // slow swirl
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
    const { grid, dungeon } = this.state;
    const theme = themeForFloor(this.state.floor);

    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const tex = isWall(grid, x, y)
          ? wallTileKey(theme)
          : floorTileKey(theme, (x * 7 + y * 13 + this.state.floor * 5) % FLOOR_VARIANTS);
        const tile = this.add.image(x * TILE + TILE / 2, y * TILE + TILE / 2, tex);
        tile.setDisplaySize(TILE, TILE);
        this.tiles.add(tile);
      }
    }

    // Doors: an arch per exit, closed while the room is uncleared; the frame
    // is tinted to warn about special destinations (boss, miniboss, ...).
    for (const door of this.state.doors) {
      const o = doorWorldPos(grid, door.dir);
      const locked = isDoorLocked(this.state, door);
      // A locked door reads as shut (and gold-tinted) even in a cleared room.
      const tex = this.state.doorsOpen && !locked ? 'door-open' : 'door-closed';
      const img = this.add.image(o.x * TILE, o.y * TILE, tex).setDepth(3);
      img.setDisplaySize(TILE * 1.4, TILE);
      img.setAngle(DOOR_ANGLE[door.dir]);
      const tint = locked ? 0xf2c14e : DOOR_TINT[dungeon.rooms.get(door.to)?.type ?? 'normal'];
      if (tint !== undefined) img.setTint(tint);
      this.tiles.add(img);
    }

    // Floor traps.
    for (const trap of this.state.traps) {
      const px = trap.pos.x * TILE;
      const py = trap.pos.y * TILE;
      if (trap.kind === 'pit') {
        const pit = this.add.image(px, py, 'pit').setDepth(1);
        pit.setDisplaySize(TILE * 0.92, TILE * 0.92);
        this.tiles.add(pit);
      } else {
        const spike = this.add.image(px, py + TILE * 0.15, 'spike').setDepth(2);
        spike.setDisplaySize(TILE * 0.8, TILE * 0.4);
        this.tiles.add(spike);
      }
    }
  }
}
