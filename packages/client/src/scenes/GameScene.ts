import Phaser from 'phaser';
import { GAME_CONFIG } from '@louvre-heist/shared';

export class GameScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private wasdKeys!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  };
  private currentAngle: number = 0; // Track current facing direction
  private walls!: Phaser.Physics.Arcade.StaticGroup;
  private playerColor!: 'pink' | 'green' | 'blue';

  constructor() {
    super({ key: 'GameScene' });
  }

  create() {
    // Get the selected color from the registry
    this.playerColor = this.registry.get('playerColor') || 'pink';
    // Create background grid with room divisions
    this.createBackground();

    // Create walls with collision
    this.walls = this.physics.add.staticGroup();
    this.createWalls();

    // Create player sprite at center
    const startX = (GAME_CONFIG.MAP_WIDTH * GAME_CONFIG.TILE_SIZE) / 2;
    const startY = (GAME_CONFIG.MAP_HEIGHT * GAME_CONFIG.TILE_SIZE) / 2;

    this.player = this.physics.add.sprite(startX, startY, `${this.playerColor}Still`);
    this.player.setDepth(10);

    // Set smaller collision body for smoother movement
    this.player.body.setSize(24, 24);
    this.player.body.setOffset(4, 4);

    // Add collision
    this.physics.add.collider(this.player, this.walls);

    // Create walking animation with the selected color
    this.anims.create({
      key: 'walk',
      frames: [
        { key: `${this.playerColor}Walk1` },
        { key: `${this.playerColor}Walk2` },
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

    // Draw room dividers (every 40 tiles = 1 room)
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

  private createWalls() {
    const DOOR_SIZE = 9; // Door width in tiles

    // Create walls between rooms with collision
    for (let roomY = 0; roomY < GAME_CONFIG.ROOMS_GRID; roomY++) {
      for (let roomX = 0; roomX < GAME_CONFIG.ROOMS_GRID; roomX++) {

        // Create right wall (vertical) between this room and the next
        if (roomX < GAME_CONFIG.ROOMS_GRID - 1) {
          const wallX = (roomX + 1) * GAME_CONFIG.ROOM_SIZE;
          // Door in the middle of the wall
          const doorStart = Math.floor((GAME_CONFIG.ROOM_SIZE - DOOR_SIZE) / 2);

          for (let tileY = 0; tileY < GAME_CONFIG.ROOM_SIZE; tileY++) {
            const isDoor = tileY >= doorStart && tileY < doorStart + DOOR_SIZE;

            if (!isDoor) {
              const wallSprite = this.walls.create(
                wallX * GAME_CONFIG.TILE_SIZE + GAME_CONFIG.TILE_SIZE / 2,
                (roomY * GAME_CONFIG.ROOM_SIZE + tileY) * GAME_CONFIG.TILE_SIZE + GAME_CONFIG.TILE_SIZE / 2,
                'wall'
              ) as Phaser.Physics.Arcade.Sprite;
              wallSprite.setDisplaySize(GAME_CONFIG.TILE_SIZE, GAME_CONFIG.TILE_SIZE);
              wallSprite.body.setSize(GAME_CONFIG.TILE_SIZE, GAME_CONFIG.TILE_SIZE, true);
            }
          }
        }

        // Create bottom wall (horizontal) between this room and the one below
        if (roomY < GAME_CONFIG.ROOMS_GRID - 1) {
          const wallY = (roomY + 1) * GAME_CONFIG.ROOM_SIZE;
          // Door in the middle of the wall
          const doorStart = Math.floor((GAME_CONFIG.ROOM_SIZE - DOOR_SIZE) / 2);

          for (let tileX = 0; tileX < GAME_CONFIG.ROOM_SIZE; tileX++) {
            const isDoor = tileX >= doorStart && tileX < doorStart + DOOR_SIZE;

            if (!isDoor) {
              const wallSprite = this.walls.create(
                (roomX * GAME_CONFIG.ROOM_SIZE + tileX) * GAME_CONFIG.TILE_SIZE + GAME_CONFIG.TILE_SIZE / 2,
                wallY * GAME_CONFIG.TILE_SIZE + GAME_CONFIG.TILE_SIZE / 2,
                'wall'
              ) as Phaser.Physics.Arcade.Sprite;
              wallSprite.setDisplaySize(GAME_CONFIG.TILE_SIZE, GAME_CONFIG.TILE_SIZE);
              wallSprite.body.setSize(GAME_CONFIG.TILE_SIZE, GAME_CONFIG.TILE_SIZE, true);
            }
          }
        }
      }
    }

    // Create outer boundary walls
    this.createBoundaryWalls();
  }

  private createBoundaryWalls() {
    const mapWidth = GAME_CONFIG.MAP_WIDTH * GAME_CONFIG.TILE_SIZE;
    const mapHeight = GAME_CONFIG.MAP_HEIGHT * GAME_CONFIG.TILE_SIZE;

    // Top wall
    for (let x = 0; x < GAME_CONFIG.MAP_WIDTH; x++) {
      const wall = this.walls.create(
        x * GAME_CONFIG.TILE_SIZE + GAME_CONFIG.TILE_SIZE / 2,
        GAME_CONFIG.TILE_SIZE / 2,
        'wall'
      ) as Phaser.Physics.Arcade.Sprite;
      wall.setDisplaySize(GAME_CONFIG.TILE_SIZE, GAME_CONFIG.TILE_SIZE);
      wall.body.setSize(GAME_CONFIG.TILE_SIZE, GAME_CONFIG.TILE_SIZE, true);
    }

    // Bottom wall
    for (let x = 0; x < GAME_CONFIG.MAP_WIDTH; x++) {
      const wall = this.walls.create(
        x * GAME_CONFIG.TILE_SIZE + GAME_CONFIG.TILE_SIZE / 2,
        mapHeight - GAME_CONFIG.TILE_SIZE / 2,
        'wall'
      ) as Phaser.Physics.Arcade.Sprite;
      wall.setDisplaySize(GAME_CONFIG.TILE_SIZE, GAME_CONFIG.TILE_SIZE);
      wall.body.setSize(GAME_CONFIG.TILE_SIZE, GAME_CONFIG.TILE_SIZE, true);
    }

    // Left wall
    for (let y = 0; y < GAME_CONFIG.MAP_HEIGHT; y++) {
      const wall = this.walls.create(
        GAME_CONFIG.TILE_SIZE / 2,
        y * GAME_CONFIG.TILE_SIZE + GAME_CONFIG.TILE_SIZE / 2,
        'wall'
      ) as Phaser.Physics.Arcade.Sprite;
      wall.setDisplaySize(GAME_CONFIG.TILE_SIZE, GAME_CONFIG.TILE_SIZE);
      wall.body.setSize(GAME_CONFIG.TILE_SIZE, GAME_CONFIG.TILE_SIZE, true);
    }

    // Right wall
    for (let y = 0; y < GAME_CONFIG.MAP_HEIGHT; y++) {
      const wall = this.walls.create(
        mapWidth - GAME_CONFIG.TILE_SIZE / 2,
        y * GAME_CONFIG.TILE_SIZE + GAME_CONFIG.TILE_SIZE / 2,
        'wall'
      ) as Phaser.Physics.Arcade.Sprite;
      wall.setDisplaySize(GAME_CONFIG.TILE_SIZE, GAME_CONFIG.TILE_SIZE);
      wall.body.setSize(GAME_CONFIG.TILE_SIZE, GAME_CONFIG.TILE_SIZE, true);
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
      this.player.setTexture(`${this.playerColor}Still`);
      this.player.setAngle(this.currentAngle);
    }

    // Update player velocity (physics handles collision)
    this.player.setVelocity(velocityX * 60, velocityY * 60);
  }
}
