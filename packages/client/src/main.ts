import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { GAME_CONFIG } from '@louvre-heist/shared';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 1280, // Viewport width
  height: 720,  // Viewport height
  parent: 'game-container',
  backgroundColor: '#1a1a2e',
  scene: [BootScene, GameScene],
  physics: {
    default: 'arcade',
    arcade: {
      debug: true,
    },
  },
};

new Phaser.Game(config);
