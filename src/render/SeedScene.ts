import Phaser from 'phaser';
import { createButton, PALETTE } from './ui.js';

/**
 * Lets the player type a numeric seed to launch a reproducible run. Seeded runs
 * are flagged so they don't unlock achievements. After validating, the seed is
 * carried into character select (you still pick a hero).
 */
export class SeedScene extends Phaser.Scene {
  private digits = '';
  private display!: Phaser.GameObjects.Text;

  constructor() {
    super('SeedScene');
  }

  create(): void {
    this.digits = '';
    const { width, height } = this.scale;
    this.add.rectangle(0, 0, width, height, PALETTE.bg).setOrigin(0);

    this.add
      .text(width / 2, height * 0.22, 'PARTIE SEEDÉE', {
        fontFamily: 'monospace',
        fontSize: '32px',
        color: PALETTE.accent,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, height * 0.22 + 40, 'Tape un numéro de seed, puis valide.', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: PALETTE.dim,
      })
      .setOrigin(0.5);

    // The typed seed, in a framed box.
    this.add
      .rectangle(width / 2, height * 0.46, 260, 48, 0x141926, 0.95)
      .setStrokeStyle(2, 0x2a3145);
    this.display = this.add
      .text(width / 2, height * 0.46, '_', {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: PALETTE.text,
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height * 0.46 + 40, 'Les succès ne se débloquent pas en partie seedée.', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#8a93a3',
      })
      .setOrigin(0.5);

    createButton(this, width / 2, height * 0.66, 'Lancer', () => this.launch());
    createButton(this, width / 2, height * 0.66 + 64, 'Retour', () =>
      this.scene.start('MenuScene'),
    );

    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key) && this.digits.length < 10) this.digits += e.key;
      else if (e.key === 'Backspace') this.digits = this.digits.slice(0, -1);
      else if (e.key === 'Enter') this.launch();
      else if (e.key === 'Escape') {
        this.scene.start('MenuScene');
        return;
      }
      this.display.setText(this.digits.length ? this.digits : '_');
    });
  }

  private launch(): void {
    if (this.digits.length === 0) return;
    this.scene.start('CharacterSelectScene', { seed: Number(this.digits), seeded: true });
  }
}
