import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    // Load custom player sprites
    this.load.image('playerStill', '/assets/pinkStill.svg');
    this.load.image('playerWalk1', '/assets/pinkWalk1.svg');
    this.load.image('playerWalk2', '/assets/pinkWalk2.svg');

    // Create tile texture
    this.createTileTexture();
  }

  create() {
    // Start game immediately
    this.scene.start('GameScene');
  }

  private createTileTexture() {
    const graphics = this.add.graphics();
    graphics.fillStyle(0x2d2d44, 1);
    graphics.fillRect(0, 0, 32, 32);
    graphics.lineStyle(1, 0x1a1a2e, 0.5);
    graphics.strokeRect(0, 0, 32, 32);
    graphics.generateTexture('tile', 32, 32);
    graphics.destroy();
  }
}
