import Phaser from 'phaser';
import { playClick } from './audio.js';

/** Shared visual palette for menus and HUD. */
export const PALETTE = {
  bg: 0x0e0e16,
  panel: '#1d2230',
  panelHover: '#2a3145',
  text: '#dfe7ef',
  accent: '#ffd166',
  dim: '#8a93a3',
} as const;

/** A styled, hover-highlighted, clickable text button centered at (x, y). */
export function createButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
): Phaser.GameObjects.Text {
  const btn = scene.add
    .text(x, y, label, {
      fontFamily: 'monospace',
      fontSize: '22px',
      color: PALETTE.text,
      backgroundColor: PALETTE.panel,
      padding: { x: 20, y: 10 },
      align: 'center',
    })
    .setOrigin(0.5)
    .setInteractive({ useHandCursor: true });
  btn.on('pointerover', () => btn.setColor(PALETTE.accent).setBackgroundColor(PALETTE.panelHover));
  btn.on('pointerout', () => btn.setColor(PALETTE.text).setBackgroundColor(PALETTE.panel));
  btn.on('pointerup', () => {
    if (getSoundOn(scene)) playClick();
    onClick();
  });
  return btn;
}

/** Settings live in the cross-scene registry. Stats panel defaults to shown. */
export function getShowStats(scene: Phaser.Scene): boolean {
  return scene.registry.get('showStats') !== false;
}

export function setShowStats(scene: Phaser.Scene, value: boolean): void {
  scene.registry.set('showStats', value);
}

/** Volumes (0..1) live in the registry. SFX defaults to 0.8, music to 0.4. */
export function getSfxVolume(scene: Phaser.Scene): number {
  const v = scene.registry.get('sfxVolume');
  return typeof v === 'number' ? v : 0.8;
}
export function setSfxVolumeSetting(scene: Phaser.Scene, value: number): void {
  scene.registry.set('sfxVolume', Math.max(0, Math.min(1, value)));
}
export function getMusicVolume(scene: Phaser.Scene): number {
  const v = scene.registry.get('musicVolume');
  return typeof v === 'number' ? v : 0.4;
}
export function setMusicVolumeSetting(scene: Phaser.Scene, value: number): void {
  scene.registry.set('musicVolume', Math.max(0, Math.min(1, value)));
}

/** SFX / music are "on" when their volume is above zero (used to gate playback). */
export function getSoundOn(scene: Phaser.Scene): boolean {
  return getSfxVolume(scene) > 0;
}
export function getMusicOn(scene: Phaser.Scene): boolean {
  return getMusicVolume(scene) > 0;
}

/**
 * A horizontal volume slider: a track + fill + draggable handle. `onChange` fires
 * with the new 0..1 value as it's dragged or clicked. Returns nothing.
 */
export function makeSlider(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  value: number,
  onChange: (v: number) => void,
): void {
  const v0 = Math.max(0, Math.min(1, value));
  scene.add.rectangle(x, y, w, 6, 0x2a3145).setOrigin(0, 0.5); // track background
  // Invisible click area, added BEFORE the handle so the handle stays on top (draggable).
  const hit = scene.add.rectangle(x, y, w, 24, 0xffffff, 0).setOrigin(0, 0.5).setInteractive();
  const fill = scene.add.rectangle(x, y, w, 6, 0xffd166).setOrigin(0, 0.5);
  fill.scaleX = Math.max(0.0001, v0);
  const handle = scene.add
    .rectangle(x + w * v0, y, 14, 22, 0xdfe7ef)
    .setOrigin(0.5)
    .setInteractive({ draggable: true, useHandCursor: true });
  const label = scene.add
    .text(x + w + 14, y, `${Math.round(v0 * 100)}%`, {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: PALETTE.text,
    })
    .setOrigin(0, 0.5);
  const apply = (frac: number): void => {
    const v = Math.max(0, Math.min(1, frac));
    fill.scaleX = Math.max(0.0001, v);
    handle.x = x + w * v;
    label.setText(`${Math.round(v * 100)}%`);
    onChange(v);
  };
  handle.on('drag', (_p: Phaser.Input.Pointer, dragX: number) => apply((dragX - x) / w));
  hit.on('pointerdown', (p: Phaser.Input.Pointer) => apply((p.x - x) / w));
}
