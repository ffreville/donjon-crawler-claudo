import Phaser from 'phaser';
import { ROOM_H, ROOM_W } from '../core/index.js';
import { GameScene, TILE } from './GameScene.js';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: ROOM_W * TILE,
  height: ROOM_H * TILE,
  backgroundColor: '#15151c',
  pixelArt: true,
  scene: [GameScene],
};

export const game = new Phaser.Game(config);
