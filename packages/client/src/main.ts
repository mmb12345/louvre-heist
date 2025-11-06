import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { GAME_CONFIG } from '@louvre-heist/shared';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: GAME_CONFIG.MAP_WIDTH * GAME_CONFIG.TILE_SIZE,
  height: GAME_CONFIG.MAP_HEIGHT * GAME_CONFIG.TILE_SIZE + 100, // Extra space for UI
  parent: 'game-container',
  backgroundColor: '#1a1a2e',
  scene: [BootScene, GameScene],
  physics: {
    default: 'arcade',
    arcade: {
      debug: false,
    },
  },
};

new Phaser.Game(config);
