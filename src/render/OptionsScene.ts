import Phaser from 'phaser';
import { setMusicVolume } from './music.js';
import { setSfxVolume } from './audio.js';
import {
  createButton,
  getMusicVolume,
  getSfxVolume,
  getShowStats,
  makeSlider,
  PALETTE,
  setMusicVolumeSetting,
  setShowStats,
  setSfxVolumeSetting,
} from './ui.js';

/** Options menu: stats panel toggle + music / SFX volume sliders. */
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
      .text(width / 2, height * 0.2, 'OPTIONS', {
        fontFamily: 'monospace',
        fontSize: '34px',
        color: PALETTE.accent,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const statsLabel = (): string => `Stats a droite : ${getShowStats(this) ? 'ON' : 'OFF'}`;
    const statsToggle = createButton(this, width / 2, height * 0.38, statsLabel(), () => {
      setShowStats(this, !getShowStats(this));
      statsToggle.setText(statsLabel());
    });

    // Volume sliders. The slider sits left of center; its label of the row above it.
    const sliderX = width / 2 - 130;
    const sliderW = 220;

    this.add
      .text(sliderX, height * 0.52 - 22, 'Musique', {
        fontFamily: 'monospace',
        fontSize: '15px',
        color: PALETTE.text,
      })
      .setOrigin(0, 0.5);
    makeSlider(this, sliderX, height * 0.52, sliderW, getMusicVolume(this), (v) => {
      setMusicVolumeSetting(this, v);
      setMusicVolume(v); // apply live
    });

    this.add
      .text(sliderX, height * 0.64 - 22, 'Bruitages', {
        fontFamily: 'monospace',
        fontSize: '15px',
        color: PALETTE.text,
      })
      .setOrigin(0, 0.5);
    makeSlider(this, sliderX, height * 0.64, sliderW, getSfxVolume(this), (v) => {
      setSfxVolumeSetting(this, v);
      setSfxVolume(v); // apply live
    });

    createButton(this, width / 2, height * 0.82, 'Retour', () => this.goBack());
    this.input.keyboard?.on('keydown-ESC', () => this.goBack());
  }
}
