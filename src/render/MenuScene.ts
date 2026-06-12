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

    createButton(this, width / 2, height * 0.5, 'Nouvelle partie', () =>
      this.scene.start('CharacterSelectScene'),
    );
    createButton(this, width / 2, height * 0.5 + 58, 'Partie seedée', () =>
      this.scene.start('SeedScene'),
    );
    createButton(this, width / 2, height * 0.5 + 116, 'Succès', () =>
      this.scene.start('AchievementsScene', { returnTo: 'MenuScene' }),
    );
    createButton(this, width / 2, height * 0.5 + 174, 'Options', () =>
      this.scene.start('OptionsScene'),
    );
  }
}
