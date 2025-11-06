import Phaser from 'phaser';
import { GAME_CONFIG } from '@louvre-heist/shared';

export class GameScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Sprite;
  private wasdKeys!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  };

  constructor() {
    super({ key: 'GameScene' });
  }

  create() {
    // Create background grid with room divisions
    this.createBackground();

    // Create player sprite at center
    const startX = (GAME_CONFIG.MAP_WIDTH * GAME_CONFIG.TILE_SIZE) / 2;
    const startY = (GAME_CONFIG.MAP_HEIGHT * GAME_CONFIG.TILE_SIZE) / 2;

    this.player = this.add.sprite(startX, startY, 'player');
    this.player.setDepth(10);

    // Setup WASD controls
    this.wasdKeys = this.input.keyboard!.addKeys({
      W: Phaser.Input.Keyboard.KeyCodes.W,
      A: Phaser.Input.Keyboard.KeyCodes.A,
      S: Phaser.Input.Keyboard.KeyCodes.S,
      D: Phaser.Input.Keyboard.KeyCodes.D,
    }) as any;

    // Setup camera to follow player
    this.cameras.main.startFollow(this.player);
    this.cameras.main.setZoom(1);
    this.cameras.main.setBounds(
      0,
      0,
      GAME_CONFIG.MAP_WIDTH * GAME_CONFIG.TILE_SIZE,
      GAME_CONFIG.MAP_HEIGHT * GAME_CONFIG.TILE_SIZE
    );

    // Add simple UI
    const controlsText = this.add.text(16, 16, 'WASD: Move', {
      fontSize: '20px',
      color: '#ffffff',
      backgroundColor: '#000000',
      padding: { x: 8, y: 4 },
    });
    controlsText.setScrollFactor(0);
    controlsText.setDepth(100);
  }

  private createBackground() {
    // Draw tiles
    for (let y = 0; y < GAME_CONFIG.MAP_HEIGHT; y++) {
      for (let x = 0; x < GAME_CONFIG.MAP_WIDTH; x++) {
        this.add.image(
          x * GAME_CONFIG.TILE_SIZE + GAME_CONFIG.TILE_SIZE / 2,
          y * GAME_CONFIG.TILE_SIZE + GAME_CONFIG.TILE_SIZE / 2,
          'tile'
        );
      }
    }

    // Draw room dividers (every 20 tiles = 1 room)
    const graphics = this.add.graphics();
    graphics.lineStyle(2, 0xffffff, 0.3);

    for (let i = 0; i <= GAME_CONFIG.ROOMS_GRID; i++) {
      const pos = i * GAME_CONFIG.ROOM_SIZE * GAME_CONFIG.TILE_SIZE;

      // Vertical lines
      graphics.lineBetween(
        pos,
        0,
        pos,
        GAME_CONFIG.MAP_HEIGHT * GAME_CONFIG.TILE_SIZE
      );

      // Horizontal lines
      graphics.lineBetween(
        0,
        pos,
        GAME_CONFIG.MAP_WIDTH * GAME_CONFIG.TILE_SIZE,
        pos
      );
    }
  }

  update() {
    if (!this.player) return;

    let velocityX = 0;
    let velocityY = 0;

    // Check WASD keys and rotate sprite based on direction
    if (this.wasdKeys.A.isDown) {
      velocityX = -GAME_CONFIG.PLAYER_SPEED;
      this.player.setAngle(180); // Face left
    } else if (this.wasdKeys.D.isDown) {
      velocityX = GAME_CONFIG.PLAYER_SPEED;
      this.player.setAngle(0); // Face right
    }

    if (this.wasdKeys.W.isDown) {
      velocityY = -GAME_CONFIG.PLAYER_SPEED;
      this.player.setAngle(270); // Face up
    } else if (this.wasdKeys.S.isDown) {
      velocityY = GAME_CONFIG.PLAYER_SPEED;
      this.player.setAngle(90); // Face down
    }

    // Update player position with boundary checking
    const newX = this.player.x + velocityX;
    const newY = this.player.y + velocityY;

    const maxX = GAME_CONFIG.MAP_WIDTH * GAME_CONFIG.TILE_SIZE;
    const maxY = GAME_CONFIG.MAP_HEIGHT * GAME_CONFIG.TILE_SIZE;

    this.player.x = Phaser.Math.Clamp(newX, 0, maxX);
    this.player.y = Phaser.Math.Clamp(newY, 0, maxY);
  }
}
