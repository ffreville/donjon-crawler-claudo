import Phaser from 'phaser';
import { setMusicEnabled } from './music.js';
import {
  createButton,
  getMusicOn,
  getShowStats,
  getSoundOn,
  PALETTE,
  setMusicOn,
  setShowStats,
  setSoundOn,
} from './ui.js';

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

    const statsLabel = (): string => `Stats a droite : ${getShowStats(this) ? 'ON' : 'OFF'}`;
    const statsToggle = createButton(this, width / 2, height * 0.4, statsLabel(), () => {
      setShowStats(this, !getShowStats(this));
      statsToggle.setText(statsLabel());
    });

    const sfxLabel = (): string => `Bruitages : ${getSoundOn(this) ? 'ON' : 'OFF'}`;
    const sfxToggle = createButton(this, width / 2, height * 0.4 + 60, sfxLabel(), () => {
      setSoundOn(this, !getSoundOn(this));
      sfxToggle.setText(sfxLabel());
    });

    const musicLabel = (): string => `Musique : ${getMusicOn(this) ? 'ON' : 'OFF'}`;
    const musicToggle = createButton(this, width / 2, height * 0.4 + 120, musicLabel(), () => {
      const on = !getMusicOn(this);
      setMusicOn(this, on);
      setMusicEnabled(on); // apply live
      musicToggle.setText(musicLabel());
    });

    createButton(this, width / 2, height * 0.4 + 196, 'Retour', () => this.goBack());
    this.input.keyboard?.on('keydown-ESC', () => this.goBack());
  }
}
