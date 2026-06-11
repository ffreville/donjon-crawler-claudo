import Phaser from 'phaser';
import {
  CHARACTERS,
  getItem,
  PLAYER_FIRE_RATE,
  PLAYER_SPEED,
  PLAYER_TEAR_DAMAGE,
  PLAYER_TEAR_RANGE,
  type Character,
} from '../core/index.js';
import { generateTextures } from './textures.js';
import { PALETTE } from './ui.js';

/** Base stats shown when a character doesn't override them. */
const BASE = {
  maxHp: 6,
  speed: PLAYER_SPEED,
  tearDamage: PLAYER_TEAR_DAMAGE,
  tearRange: PLAYER_TEAR_RANGE,
  fireRate: PLAYER_FIRE_RATE,
  shotCount: 1,
};

const num = (n: number): string => (Number.isInteger(n) ? `${n}` : n.toFixed(1));

/** Character picker shown before a run. Each card starts the game as that hero. */
export class CharacterSelectScene extends Phaser.Scene {
  constructor() {
    super('CharacterSelectScene');
  }

  create(): void {
    // Make sure the per-character sprites exist (no-op if already generated).
    generateTextures(this, this.scale.width, this.scale.height);

    const { width, height } = this.scale;
    this.add.rectangle(0, 0, width, height, PALETTE.bg).setOrigin(0);
    this.add
      .text(width / 2, height * 0.08, 'CHOISIS TON PERSONNAGE', {
        fontFamily: 'monospace',
        fontSize: '26px',
        color: PALETTE.accent,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    // Grid layout (4 columns), so 8 cards aren't cramped into one thin row.
    const n = CHARACTERS.length;
    const cols = 4;
    const rows = Math.ceil(n / cols);
    const mx = 14;
    const my = 12;
    const gridTop = height * 0.15;
    const gridBottom = height * 0.88;
    const cardW = (width - mx * (cols + 1)) / cols;
    const cardH = (gridBottom - gridTop - my * (rows - 1)) / rows;

    CHARACTERS.forEach((c, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = mx + col * (cardW + mx);
      const y = gridTop + row * (cardH + my);
      this.buildCard(c, x, y, cardW, cardH);
    });

    const back = this.add
      .text(width / 2, height * 0.93, 'Retour', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: PALETTE.text,
        backgroundColor: PALETTE.panel,
        padding: { x: 16, y: 8 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    back.on('pointerover', () => back.setColor(PALETTE.accent));
    back.on('pointerout', () => back.setColor(PALETTE.text));
    back.on('pointerup', () => this.scene.start('MenuScene'));
    this.input.keyboard?.on('keydown-ESC', () => this.scene.start('MenuScene'));
  }

  private buildCard(c: Character, x: number, y: number, w: number, h: number): void {
    const box = this.add
      .rectangle(x, y, w, h, 0x141926, 0.95)
      .setOrigin(0)
      .setStrokeStyle(2, 0x2a3145)
      .setInteractive({ useHandCursor: true });

    const tex = this.textures.exists(`player-${c.id}`) ? `player-${c.id}` : 'player';
    const sprite = this.add.image(x + 30, y + h * 0.5, tex).setScale(3.4); // portrait on the left

    const tx = x + 60; // text column, right of the portrait
    const wrap = w - 70;
    this.add
      .text(tx, y + 12, c.name, {
        fontFamily: 'monospace',
        fontSize: '15px',
        color: PALETTE.accent,
        fontStyle: 'bold',
      })
      .setOrigin(0, 0);

    const st = { ...BASE, ...(c.stats ?? {}) };
    const statLines = [
      `PV ${num(st.maxHp)}   DMG ${num(st.tearDamage)}   Port ${num(st.tearRange)}`,
      `Vit ${num(st.speed)}   Cad ${num(st.fireRate)}${st.shotCount > 1 ? `   x${st.shotCount}` : ''}`,
    ].join('\n');
    this.add
      .text(tx, y + 34, statLines, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#cfe3ff',
        lineSpacing: 3,
      })
      .setOrigin(0, 0);

    // Starting gear.
    const gear: string[] = [];
    for (const id of c.items ?? []) gear.push(getItem(id)?.name ?? id);
    if (c.activeItem) gear.push(`${getItem(c.activeItem)?.name ?? c.activeItem} (actif)`);
    if (c.coins) gear.push(`${c.coins} pieces`);
    if (c.keys) gear.push(`${c.keys} cle`);
    this.add
      .text(tx, y + 78, `Depart: ${gear.length ? gear.join(', ') : '—'}`, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#ffd23f',
        wordWrap: { width: wrap },
      })
      .setOrigin(0, 0);

    this.add
      .text(tx, y + h - 34, c.blurb, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: PALETTE.dim,
        wordWrap: { width: wrap },
      })
      .setOrigin(0, 0);

    const start = (): void => {
      this.scene.start('GameScene', { characterId: c.id });
    };
    box.on('pointerover', () => box.setStrokeStyle(2, 0xffd166));
    box.on('pointerout', () => box.setStrokeStyle(2, 0x2a3145));
    box.on('pointerup', start);
    sprite.setInteractive({ useHandCursor: true }).on('pointerup', start);
  }
}
