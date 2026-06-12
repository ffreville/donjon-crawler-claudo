import Phaser from 'phaser';
import { ACHIEVEMENTS } from '../core/index.js';
import { unlockedAchievements } from './achievementStore.js';
import { PALETTE } from './ui.js';

/** Lists every achievement and whether it's unlocked. Reachable from menu or pause. */
export class AchievementsScene extends Phaser.Scene {
  private returnTo = 'MenuScene';

  constructor() {
    super('AchievementsScene');
  }

  init(data: { returnTo?: string }): void {
    this.returnTo = data?.returnTo ?? 'MenuScene';
  }

  private goBack(): void {
    if (this.returnTo === 'GameScene') {
      this.scene.stop();
      this.scene.resume('GameScene');
    } else {
      this.scene.start(this.returnTo);
    }
  }

  create(): void {
    const { width, height } = this.scale;
    this.add.rectangle(0, 0, width, height, PALETTE.bg).setOrigin(0);

    const unlocked = unlockedAchievements();
    const got = ACHIEVEMENTS.filter((a) => unlocked.has(a.id)).length;
    this.add
      .text(width / 2, height * 0.06, `SUCCÈS  (${got}/${ACHIEVEMENTS.length})`, {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: PALETTE.accent,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    // Two columns.
    const cols = 2;
    const colW = (width - 40) / cols;
    const top = height * 0.13;
    const rowH = 30;
    const perCol = Math.ceil(ACHIEVEMENTS.length / cols);

    ACHIEVEMENTS.forEach((a, i) => {
      const col = Math.floor(i / perCol);
      const row = i % perCol;
      const x = 20 + col * colW;
      const y = top + row * rowH;
      const done = unlocked.has(a.id);
      this.add
        .text(x, y, `${done ? '✔' : '✖'}  ${a.name}`, {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: done ? '#7cffb2' : PALETTE.dim,
          fontStyle: done ? 'bold' : 'normal',
        })
        .setOrigin(0, 0);
      this.add
        .text(x + 18, y + 14, done ? a.description : '— verrouillé —', {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#6b7280',
          wordWrap: { width: colW - 30 },
        })
        .setOrigin(0, 0);
    });

    const back = this.add
      .text(width / 2, height * 0.95, 'Retour', {
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
    back.on('pointerup', () => this.goBack());
    this.input.keyboard?.on('keydown-ESC', () => this.goBack());
  }
}
