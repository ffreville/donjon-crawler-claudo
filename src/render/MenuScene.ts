import Phaser from 'phaser';
import { createButton, PALETTE } from './ui.js';

/** Main menu: New game / Options. The first scene the game boots into. */
export class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
  }

  create(): void {
    if (this.registry.get('showStats') === undefined) this.registry.set('showStats', true);

    const { width, height } = this.scale;
    this.add.rectangle(0, 0, width, height, PALETTE.bg).setOrigin(0);

    this.add
      .text(width / 2, height * 0.26, 'DONJON CRAWLER', {
        fontFamily: 'monospace',
        fontSize: '40px',
        color: PALETTE.accent,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, height * 0.26 + 38, 'a tiny roguelite', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: PALETTE.dim,
      })
      .setOrigin(0.5);

    createButton(this, width / 2, height * 0.55, 'Nouvelle partie', () =>
      this.scene.start('GameScene'),
    );
    createButton(this, width / 2, height * 0.55 + 64, 'Options', () =>
      this.scene.start('OptionsScene'),
    );
  }
}
