import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    // Create simple geometric shapes for our game
    this.createPlayerTexture();
    this.createTileTexture();
  }

  create() {
    // Start game immediately
    this.scene.start('GameScene');
  }

  private createPlayerTexture() {
    const graphics = this.add.graphics();
    graphics.fillStyle(0x00ff00, 1);
    graphics.fillCircle(16, 16, 12);
    graphics.generateTexture('player', 32, 32);
    graphics.destroy();
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
