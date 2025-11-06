import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    // Create simple geometric shapes for our game
    this.createPlayerTexture();
    this.createGuardTexture();
    this.createObjectiveTextures();
    this.createTileTexture();
  }

  create() {
    // Prompt for player name and room ID
    const playerName = prompt('Enter your name:', 'Player') || 'Player';
    const roomId = prompt('Enter room ID (same for all players):', 'room1') || 'room1';

    this.scene.start('GameScene', { playerName, roomId });
  }

  private createPlayerTexture() {
    const graphics = this.add.graphics();
    graphics.fillStyle(0x00ff00, 1);
    graphics.fillCircle(16, 16, 12);
    graphics.generateTexture('player', 32, 32);
    graphics.destroy();
  }

  private createGuardTexture() {
    const graphics = this.add.graphics();
    graphics.fillStyle(0xff0000, 1);
    graphics.fillCircle(16, 16, 12);
    graphics.fillStyle(0x000000, 1);
    graphics.fillCircle(16, 16, 4);
    graphics.generateTexture('guard', 32, 32);
    graphics.destroy();
  }

  private createObjectiveTextures() {
    // Security room (red square)
    let graphics = this.add.graphics();
    graphics.fillStyle(0xff6b6b, 1);
    graphics.fillRect(4, 4, 24, 24);
    graphics.lineStyle(2, 0xffffff, 1);
    graphics.strokeRect(4, 4, 24, 24);
    graphics.generateTexture('objective_destroy_footage', 32, 32);
    graphics.destroy();

    // Crown (yellow star)
    graphics = this.add.graphics();
    graphics.fillStyle(0xffd700, 1);
    graphics.fillStar(16, 16, 5, 12, 6);
    graphics.generateTexture('objective_find_crown', 32, 32);
    graphics.destroy();

    // Password (white paper)
    graphics = this.add.graphics();
    graphics.fillStyle(0xffffff, 1);
    graphics.fillRect(8, 6, 16, 20);
    graphics.lineStyle(1, 0x000000, 1);
    for (let i = 0; i < 3; i++) {
      graphics.lineBetween(10, 10 + i * 5, 22, 10 + i * 5);
    }
    graphics.generateTexture('objective_find_password', 32, 32);
    graphics.destroy();

    // Exit (green door)
    graphics = this.add.graphics();
    graphics.fillStyle(0x00ff00, 1);
    graphics.fillRect(6, 4, 20, 24);
    graphics.fillStyle(0x000000, 1);
    graphics.fillCircle(22, 16, 2);
    graphics.generateTexture('objective_find_exit', 32, 32);
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
