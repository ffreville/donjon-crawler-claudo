import Phaser from 'phaser';
import { ROOM_H, ROOM_W } from '../core/index.js';
import { GameScene, PANEL_W, TILE } from './GameScene.js';
import { MenuScene } from './MenuScene.js';
import { OptionsScene } from './OptionsScene.js';
import { CharacterSelectScene } from './CharacterSelectScene.js';
import { AchievementsScene } from './AchievementsScene.js';
import { SeedScene } from './SeedScene.js';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: ROOM_W * TILE + PANEL_W,
  height: ROOM_H * TILE,
  backgroundColor: '#15151c',
  pixelArt: true,
  // The play area is large; scale the canvas to fit the window (keep aspect).
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  // First scene boots automatically: Menu -> (Game | Options).
  scene: [MenuScene, OptionsScene, CharacterSelectScene, AchievementsScene, SeedScene, GameScene],
};

export const game = new Phaser.Game(config);
