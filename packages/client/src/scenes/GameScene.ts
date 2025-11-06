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

  constructor() {
    super({ key: 'GameScene' });
  }

  create() {
    // Create background grid with room divisions
    this.createBackground();

    // Create walls group
    this.walls = this.physics.add.staticGroup();
    this.createWalls();

    // Create player sprite at center
    const startX = (GAME_CONFIG.MAP_WIDTH * GAME_CONFIG.TILE_SIZE) / 2;
    const startY = (GAME_CONFIG.MAP_HEIGHT * GAME_CONFIG.TILE_SIZE) / 2;

    this.player = this.physics.add.sprite(startX, startY, 'playerStill');
    this.player.setDepth(10);
    this.player.setCollideWorldBounds(true);

    // Add collision between player and walls
    this.physics.add.collider(this.player, this.walls);

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

  }

  private createWalls() {
    const DOOR_SIZE = 3; // Door width in tiles
    const MIN_DOORS_PER_ROOM = 3;

    // Track doors for each room (roomX, roomY, side) -> door positions
    const roomDoors: Map<string, Set<number>> = new Map();

    // Helper to get/create door set for a room side
    const getDoorSet = (roomX: number, roomY: number, side: string): Set<number> => {
      const key = `${roomX},${roomY},${side}`;
      if (!roomDoors.has(key)) {
        roomDoors.set(key, new Set());
      }
      return roomDoors.get(key)!;
    };

    // Generate doors for each room
    for (let roomY = 0; roomY < GAME_CONFIG.ROOMS_GRID; roomY++) {
      for (let roomX = 0; roomX < GAME_CONFIG.ROOMS_GRID; roomX++) {
        const sides = ['top', 'right', 'bottom', 'left'];
        const availableSides = [...sides];

        // Ensure at least 3 doors per room
        for (let i = 0; i < MIN_DOORS_PER_ROOM; i++) {
          if (availableSides.length === 0) break;

          const sideIndex = Math.floor(Math.random() * availableSides.length);
          const side = availableSides[sideIndex];
          availableSides.splice(sideIndex, 1);

          // Pick a random position for the door (avoid corners)
          const doorPos = Math.floor(Math.random() * (GAME_CONFIG.ROOM_SIZE - DOOR_SIZE - 4)) + 2;

          getDoorSet(roomX, roomY, side).add(doorPos);
        }

        // Maybe add a 4th door randomly
        if (Math.random() < 0.3 && availableSides.length > 0) {
          const side = availableSides[Math.floor(Math.random() * availableSides.length)];
          const doorPos = Math.floor(Math.random() * (GAME_CONFIG.ROOM_SIZE - DOOR_SIZE - 4)) + 2;
          getDoorSet(roomX, roomY, side).add(doorPos);
        }
      }
    }

    // Create walls between rooms
    for (let roomY = 0; roomY < GAME_CONFIG.ROOMS_GRID; roomY++) {
      for (let roomX = 0; roomX < GAME_CONFIG.ROOMS_GRID; roomX++) {
        // Right wall (vertical)
        if (roomX < GAME_CONFIG.ROOMS_GRID - 1) {
          const wallX = (roomX + 1) * GAME_CONFIG.ROOM_SIZE;
          const currentDoors = getDoorSet(roomX, roomY, 'right');
          const neighborDoors = getDoorSet(roomX + 1, roomY, 'left');
          const allDoors = new Set([...currentDoors, ...neighborDoors]);

          for (let tileY = 0; tileY < GAME_CONFIG.ROOM_SIZE; tileY++) {
            let isDoor = false;
            for (const doorPos of allDoors) {
              if (tileY >= doorPos && tileY < doorPos + DOOR_SIZE) {
                isDoor = true;
                break;
              }
            }

            if (!isDoor) {
              const wall = this.walls.create(
                wallX * GAME_CONFIG.TILE_SIZE + GAME_CONFIG.TILE_SIZE / 2,
                (roomY * GAME_CONFIG.ROOM_SIZE + tileY) * GAME_CONFIG.TILE_SIZE + GAME_CONFIG.TILE_SIZE / 2,
                'wall'
              ) as Phaser.Physics.Arcade.Sprite;
              wall.setDisplaySize(GAME_CONFIG.TILE_SIZE, GAME_CONFIG.TILE_SIZE);
              wall.body.setSize(GAME_CONFIG.TILE_SIZE, GAME_CONFIG.TILE_SIZE);
              wall.refreshBody();
            }
          }
        }

        // Bottom wall (horizontal)
        if (roomY < GAME_CONFIG.ROOMS_GRID - 1) {
          const wallY = (roomY + 1) * GAME_CONFIG.ROOM_SIZE;
          const currentDoors = getDoorSet(roomX, roomY, 'bottom');
          const neighborDoors = getDoorSet(roomX, roomY + 1, 'top');
          const allDoors = new Set([...currentDoors, ...neighborDoors]);

          for (let tileX = 0; tileX < GAME_CONFIG.ROOM_SIZE; tileX++) {
            let isDoor = false;
            for (const doorPos of allDoors) {
              if (tileX >= doorPos && tileX < doorPos + DOOR_SIZE) {
                isDoor = true;
                break;
              }
            }

            if (!isDoor) {
              const wall = this.walls.create(
                (roomX * GAME_CONFIG.ROOM_SIZE + tileX) * GAME_CONFIG.TILE_SIZE + GAME_CONFIG.TILE_SIZE / 2,
                wallY * GAME_CONFIG.TILE_SIZE + GAME_CONFIG.TILE_SIZE / 2,
                'wall'
              ) as Phaser.Physics.Arcade.Sprite;
              wall.setDisplaySize(GAME_CONFIG.TILE_SIZE, GAME_CONFIG.TILE_SIZE);
              wall.body.setSize(GAME_CONFIG.TILE_SIZE, GAME_CONFIG.TILE_SIZE);
              wall.refreshBody();
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

    // Top and bottom walls
    for (let x = 0; x < GAME_CONFIG.MAP_WIDTH; x++) {
      // Top
      const topWall = this.walls.create(
        x * GAME_CONFIG.TILE_SIZE + GAME_CONFIG.TILE_SIZE / 2,
        GAME_CONFIG.TILE_SIZE / 2,
        'wall'
      ) as Phaser.Physics.Arcade.Sprite;
      topWall.setDisplaySize(GAME_CONFIG.TILE_SIZE, GAME_CONFIG.TILE_SIZE);
      topWall.body.setSize(GAME_CONFIG.TILE_SIZE, GAME_CONFIG.TILE_SIZE);
      topWall.refreshBody();

      // Bottom
      const bottomWall = this.walls.create(
        x * GAME_CONFIG.TILE_SIZE + GAME_CONFIG.TILE_SIZE / 2,
        mapHeight - GAME_CONFIG.TILE_SIZE / 2,
        'wall'
      ) as Phaser.Physics.Arcade.Sprite;
      bottomWall.setDisplaySize(GAME_CONFIG.TILE_SIZE, GAME_CONFIG.TILE_SIZE);
      bottomWall.body.setSize(GAME_CONFIG.TILE_SIZE, GAME_CONFIG.TILE_SIZE);
      bottomWall.refreshBody();
    }

    // Left and right walls
    for (let y = 0; y < GAME_CONFIG.MAP_HEIGHT; y++) {
      // Left
      const leftWall = this.walls.create(
        GAME_CONFIG.TILE_SIZE / 2,
        y * GAME_CONFIG.TILE_SIZE + GAME_CONFIG.TILE_SIZE / 2,
        'wall'
      ) as Phaser.Physics.Arcade.Sprite;
      leftWall.setDisplaySize(GAME_CONFIG.TILE_SIZE, GAME_CONFIG.TILE_SIZE);
      leftWall.body.setSize(GAME_CONFIG.TILE_SIZE, GAME_CONFIG.TILE_SIZE);
      leftWall.refreshBody();

      // Right
      const rightWall = this.walls.create(
        mapWidth - GAME_CONFIG.TILE_SIZE / 2,
        y * GAME_CONFIG.TILE_SIZE + GAME_CONFIG.TILE_SIZE / 2,
        'wall'
      ) as Phaser.Physics.Arcade.Sprite;
      rightWall.setDisplaySize(GAME_CONFIG.TILE_SIZE, GAME_CONFIG.TILE_SIZE);
      rightWall.body.setSize(GAME_CONFIG.TILE_SIZE, GAME_CONFIG.TILE_SIZE);
      rightWall.refreshBody();
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

    // Update player velocity (physics handles collision)
    // Convert to pixels per second for physics
    const speed = GAME_CONFIG.PLAYER_SPEED * 60; // Convert to pixels per second
    this.player.setVelocity(velocityX * 60, velocityY * 60);
  }
}
