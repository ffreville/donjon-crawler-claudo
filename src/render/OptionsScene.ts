import Phaser from 'phaser';
import { createButton, getShowStats, PALETTE, setShowStats } from './ui.js';

/** Options menu: toggle the right-side stats panel. */
export class OptionsScene extends Phaser.Scene {
  /** Where 'Retour' goes: 'MenuScene' (from main menu) or 'GameScene' (from pause). */
  private returnTo = 'MenuScene';

  constructor() {
    super('OptionsScene');
  }

  init(data: { returnTo?: string }): void {
    this.returnTo = data.returnTo ?? 'MenuScene';
  }

  private goBack(): void {
    if (this.returnTo === 'GameScene') {
      // Came from the in-game pause menu: resume the still-paused run.
      this.scene.stop();
      this.scene.resume('GameScene');
    } else {
      this.scene.start(this.returnTo);
    }
  }

  create(): void {
    const { width, height } = this.scale;
    this.add.rectangle(0, 0, width, height, PALETTE.bg).setOrigin(0);

    this.add
      .text(width / 2, height * 0.26, 'OPTIONS', {
        fontFamily: 'monospace',
        fontSize: '34px',
        color: PALETTE.accent,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const label = (): string => `Stats a droite : ${getShowStats(this) ? 'ON' : 'OFF'}`;
    const toggle = createButton(this, width / 2, height * 0.48, label(), () => {
      setShowStats(this, !getShowStats(this));
      toggle.setText(label());
    });

    createButton(this, width / 2, height * 0.48 + 72, 'Retour', () => this.goBack());
    this.input.keyboard?.on('keydown-ESC', () => this.goBack());
  }
}
