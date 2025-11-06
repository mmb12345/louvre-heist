import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { PlayerSelectScene } from './scenes/PlayerSelectScene';
import { GameScene } from './scenes/GameScene';
import { GAME_CONFIG } from '@louvre-heist/shared';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 1280, // Viewport width
  height: 720,  // Viewport height
  parent: 'game-container',
  backgroundColor: '#1a1a2e',
  scene: [BootScene, PlayerSelectScene, GameScene],
  physics: {
    default: 'arcade',
    arcade: {
      debug: false,
    },
  },
  disableContextMenu: true,
  fps: {
    target: 60,
    forceSetTimeOut: false,
  },
};

new Phaser.Game(config);
