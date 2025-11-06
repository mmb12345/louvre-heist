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
  private currentAngle: number = 0; // Track current facing direction

  constructor() {
    super({ key: 'GameScene' });
  }

  create() {
    // Create background grid with room divisions
    this.createBackground();

    // Create player sprite at center
    const startX = (GAME_CONFIG.MAP_WIDTH * GAME_CONFIG.TILE_SIZE) / 2;
    const startY = (GAME_CONFIG.MAP_HEIGHT * GAME_CONFIG.TILE_SIZE) / 2;

    this.player = this.add.sprite(startX, startY, 'playerStill');
    this.player.setDepth(10);

    // Create walking animation
    this.anims.create({
      key: 'walk',
      frames: [
        { key: 'playerWalk1' },
        { key: 'playerWalk2' },
      ],
      frameRate: 8, // 8 frames per second
      repeat: -1, // Loop indefinitely
    });

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

    // Determine velocity from key presses
    if (this.wasdKeys.A.isDown) {
      velocityX = -GAME_CONFIG.PLAYER_SPEED;
    } else if (this.wasdKeys.D.isDown) {
      velocityX = GAME_CONFIG.PLAYER_SPEED;
    }

    if (this.wasdKeys.W.isDown) {
      velocityY = -GAME_CONFIG.PLAYER_SPEED;
    } else if (this.wasdKeys.S.isDown) {
      velocityY = GAME_CONFIG.PLAYER_SPEED;
    }

    // Set rotation based on direction (check diagonals first)
    const isMoving = velocityX !== 0 || velocityY !== 0;

    if (isMoving) {
      if (velocityY < 0 && velocityX > 0) {
        // Up-right (W+D)
        this.currentAngle = 225;
      } else if (velocityY < 0 && velocityX < 0) {
        // Up-left (W+A)
        this.currentAngle = 135;
      } else if (velocityY > 0 && velocityX > 0) {
        // Down-right (S+D)
        this.currentAngle = 315;
      } else if (velocityY > 0 && velocityX < 0) {
        // Down-left (S+A)
        this.currentAngle = 45;
      } else if (velocityY < 0) {
        // Up (W)
        this.currentAngle = 180;
      } else if (velocityY > 0) {
        // Down (S)
        this.currentAngle = 0;
      } else if (velocityX < 0) {
        // Left (A)
        this.currentAngle = 90;
      } else if (velocityX > 0) {
        // Right (D)
        this.currentAngle = 270;
      }

      this.player.setAngle(this.currentAngle);

      // Play walk animation if not already playing
      if (!this.player.anims.isPlaying) {
        this.player.play('walk');
      }
    } else {
      // Stop animation and show still sprite, maintaining current angle
      this.player.stop();
      this.player.setTexture('playerStill');
      this.player.setAngle(this.currentAngle);
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
