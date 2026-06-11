import Phaser from 'phaser';

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
  btn.on('pointerup', onClick);
  return btn;
}

/** Settings live in the cross-scene registry. Stats panel defaults to shown. */
export function getShowStats(scene: Phaser.Scene): boolean {
  return scene.registry.get('showStats') !== false;
}

export function setShowStats(scene: Phaser.Scene, value: boolean): void {
  scene.registry.set('showStats', value);
}

/** Sound effects default to on. */
export function getSoundOn(scene: Phaser.Scene): boolean {
  return scene.registry.get('soundOn') !== false;
}

export function setSoundOn(scene: Phaser.Scene, value: boolean): void {
  scene.registry.set('soundOn', value);
}

/** Music defaults to on. */
export function getMusicOn(scene: Phaser.Scene): boolean {
  return scene.registry.get('musicOn') !== false;
}

export function setMusicOn(scene: Phaser.Scene, value: boolean): void {
  scene.registry.set('musicOn', value);
}
