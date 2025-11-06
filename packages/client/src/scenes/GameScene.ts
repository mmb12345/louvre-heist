import Phaser from "phaser";
import { GAME_CONFIG } from "@louvre-heist/shared";
import { ColyseusClient } from "../network/ColyseusClient";
import type { Player } from "@louvre-heist/shared";
import { generatePlayerName } from "../utils/nameGenerator";

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
  private playerColor!: "pink" | "green" | "blue";

  // Multiplayer
  private colyseusClient!: ColyseusClient;
  private sessionId?: string;
  private otherPlayers: Map<string, Phaser.Physics.Arcade.Sprite> = new Map();
  private playerTargets: Map<string, { x: number; y: number; angle: number; isMoving: boolean }> = new Map();
  private lastUpdateTime: number = 0;
  private updateThrottle: number = 50; // Send updates every 50ms (20 times per second)

  constructor() {
    super({ key: "GameScene" });
  }

  async create() {
    // Get the selected color from the registry
    this.playerColor = this.registry.get("playerColor") || "pink";
    // Create background grid with room divisions
    this.createBackground();

    // Create walls with collision
    this.walls = this.physics.add.staticGroup();
    this.createWalls();

    // Create player sprite in bottom middle room
    const startRoomX = 4; // Middle room (0-9 grid)
    const startRoomY = 9; // Bottom row
    const startX = (startRoomX * GAME_CONFIG.ROOM_SIZE + GAME_CONFIG.ROOM_SIZE / 2) * GAME_CONFIG.TILE_SIZE;
    const startY = (startRoomY * GAME_CONFIG.ROOM_SIZE + GAME_CONFIG.ROOM_SIZE * 0.75) * GAME_CONFIG.TILE_SIZE;

    this.player = this.physics.add.sprite(
      startX,
      startY,
      `${this.playerColor}Still`
    );
    this.player.setDepth(10);

    // Set smaller collision body for smoother movement
    this.player.body.setSize(24, 24);
    this.player.body.setOffset(4, 4);

    // Add collision
    this.physics.add.collider(this.player, this.walls);

    // Create walking animation with the selected color
    this.anims.create({
      key: "walk",
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
    const controlsText = this.add.text(16, 16, "WASD: Move", {
      fontSize: "20px",
      color: "#ffffff",
      backgroundColor: "#000000",
      padding: { x: 8, y: 4 },
    });
    controlsText.setScrollFactor(0);
    controlsText.setDepth(100);

    // Connect to multiplayer server
    await this.setupMultiplayer();
  }

  private async setupMultiplayer() {
    try {
      this.colyseusClient = new ColyseusClient();

      // Generate a unique player name based on color
      const playerName = generatePlayerName(this.playerColor);

      const room = await this.colyseusClient.joinOrCreate(
        "game-room",
        playerName,
        this.playerColor
      );

      this.sessionId = room.sessionId;
      console.log("Connected to multiplayer server!");

      // Listen for other players joining
      room.state.players.onAdd((player: Player, sessionId: string) => {
        if (sessionId === this.sessionId) {
          // This is our local player, skip
          return;
        }

        console.log("Player joined:", sessionId, player.color);
        this.addOtherPlayer(sessionId, player);

        // Listen to individual player changes for smooth updates
        player.onChange(() => {
          if (sessionId !== this.sessionId) {
            this.updatePlayerTarget(sessionId, player);
          }
        });
      });

      // Listen for other players leaving
      room.state.players.onRemove((player: Player, sessionId: string) => {
        console.log("Player left:", sessionId);
        this.removeOtherPlayer(sessionId);
      });
    } catch (error) {
      console.error("Failed to connect to multiplayer:", error);
    }
  }

  private addOtherPlayer(sessionId: string, player: Player) {
    // Create sprite for other player at their position
    const sprite = this.physics.add.sprite(
      player.x * GAME_CONFIG.TILE_SIZE,
      player.y * GAME_CONFIG.TILE_SIZE,
      `${player.color}Still`
    );
    sprite.setDepth(10);
    sprite.body.setSize(24, 24);
    sprite.body.setOffset(4, 4);

    // Add collision with walls
    this.physics.add.collider(sprite, this.walls);

    this.otherPlayers.set(sessionId, sprite);

    // Store color in sprite data for animation
    sprite.setData("color", player.color);

    // Initialize target position for lerping
    this.playerTargets.set(sessionId, {
      x: player.x * GAME_CONFIG.TILE_SIZE,
      y: player.y * GAME_CONFIG.TILE_SIZE,
      angle: player.angle,
      isMoving: player.isMoving,
    });

    // Add player name label
    const nameText = this.add.text(0, 0, player.name, {
      fontSize: "16px",
      color: "#ffffff",
      backgroundColor: "#000000cc",
      padding: { x: 6, y: 3 },
    });
    nameText.setOrigin(0.5);
    nameText.setDepth(11); // Above player sprites
    sprite.setData("nameText", nameText);
  }

  private removeOtherPlayer(sessionId: string) {
    const sprite = this.otherPlayers.get(sessionId);
    if (sprite) {
      const nameText = sprite.getData("nameText");
      if (nameText) nameText.destroy();
      sprite.destroy();
      this.otherPlayers.delete(sessionId);
      this.playerTargets.delete(sessionId);
    }
  }

  private updatePlayerTarget(sessionId: string, player: Player) {
    // Update the target position for lerping
    this.playerTargets.set(sessionId, {
      x: player.x * GAME_CONFIG.TILE_SIZE,
      y: player.y * GAME_CONFIG.TILE_SIZE,
      angle: player.angle,
      isMoving: player.isMoving,
    });
  }

  private lerpOtherPlayers() {
    // Interpolate positions of all other players for smooth movement
    this.otherPlayers.forEach((sprite, sessionId) => {
      const target = this.playerTargets.get(sessionId);
      if (!target) return;

      const color = sprite.getData("color");
      const lerpFactor = 0.2; // Interpolation speed (0.2 = 20% per frame)

      // Lerp position
      const currentX = sprite.x;
      const currentY = sprite.y;
      const newX = currentX + (target.x - currentX) * lerpFactor;
      const newY = currentY + (target.y - currentY) * lerpFactor;

      sprite.setPosition(newX, newY);

      // Lerp angle
      let angleDiff = target.angle - sprite.angle;
      // Handle angle wrapping (shortest path)
      if (angleDiff > 180) angleDiff -= 360;
      if (angleDiff < -180) angleDiff += 360;
      const newAngle = sprite.angle + angleDiff * lerpFactor;
      sprite.setAngle(newAngle);

      // Update animation based on movement state
      if (target.isMoving) {
        const walkAnimKey = `${color}Walk`;
        if (!this.anims.exists(walkAnimKey)) {
          this.anims.create({
            key: walkAnimKey,
            frames: [
              { key: `${color}Walk1` },
              { key: `${color}Walk2` },
            ],
            frameRate: 8,
            repeat: -1,
          });
        }
        if (!sprite.anims.isPlaying || sprite.anims.currentAnim?.key !== walkAnimKey) {
          sprite.play(walkAnimKey);
        }
      } else {
        if (sprite.anims.isPlaying) {
          sprite.stop();
          sprite.setTexture(`${color}Still`);
        }
      }

      // Update name label position (above the player sprite)
      const nameText = sprite.getData("nameText");
      if (nameText) {
        nameText.setPosition(sprite.x, sprite.y - 30);
      }
    });
  }

  private createBackground() {
    // Draw tiles
    for (let y = 0; y < GAME_CONFIG.MAP_HEIGHT; y++) {
      for (let x = 0; x < GAME_CONFIG.MAP_WIDTH; x++) {
        this.add.image(
          x * GAME_CONFIG.TILE_SIZE + GAME_CONFIG.TILE_SIZE / 2,
          y * GAME_CONFIG.TILE_SIZE + GAME_CONFIG.TILE_SIZE / 2,
          "tile"
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
                wallX * GAME_CONFIG.TILE_SIZE,
                (roomY * GAME_CONFIG.ROOM_SIZE + tileY) *
                  GAME_CONFIG.TILE_SIZE +
                  GAME_CONFIG.TILE_SIZE / 2,
                "wall"
              ) as Phaser.Physics.Arcade.Sprite;
              wallSprite.setDisplaySize(
                GAME_CONFIG.TILE_SIZE,
                GAME_CONFIG.TILE_SIZE
              );
              wallSprite.body.setSize(
                GAME_CONFIG.TILE_SIZE,
                GAME_CONFIG.TILE_SIZE
              );
              wallSprite.refreshBody();
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
                (roomX * GAME_CONFIG.ROOM_SIZE + tileX) *
                  GAME_CONFIG.TILE_SIZE +
                  GAME_CONFIG.TILE_SIZE / 2,
                wallY * GAME_CONFIG.TILE_SIZE,
                "wall"
              ) as Phaser.Physics.Arcade.Sprite;
              wallSprite.setDisplaySize(
                GAME_CONFIG.TILE_SIZE,
                GAME_CONFIG.TILE_SIZE
              );
              wallSprite.body.setSize(
                GAME_CONFIG.TILE_SIZE,
                GAME_CONFIG.TILE_SIZE
              );
              wallSprite.refreshBody();
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
        "wall"
      ) as Phaser.Physics.Arcade.Sprite;
      wall.setDisplaySize(GAME_CONFIG.TILE_SIZE, GAME_CONFIG.TILE_SIZE);
      wall.body.setSize(GAME_CONFIG.TILE_SIZE, GAME_CONFIG.TILE_SIZE);
      wall.refreshBody();
    }

    // Bottom wall
    for (let x = 0; x < GAME_CONFIG.MAP_WIDTH; x++) {
      const wall = this.walls.create(
        x * GAME_CONFIG.TILE_SIZE + GAME_CONFIG.TILE_SIZE / 2,
        mapHeight - GAME_CONFIG.TILE_SIZE / 2,
        "wall"
      ) as Phaser.Physics.Arcade.Sprite;
      wall.setDisplaySize(GAME_CONFIG.TILE_SIZE, GAME_CONFIG.TILE_SIZE);
      wall.body.setSize(GAME_CONFIG.TILE_SIZE, GAME_CONFIG.TILE_SIZE);
      wall.refreshBody();
    }

    // Left wall
    for (let y = 0; y < GAME_CONFIG.MAP_HEIGHT; y++) {
      const wall = this.walls.create(
        GAME_CONFIG.TILE_SIZE / 2,
        y * GAME_CONFIG.TILE_SIZE + GAME_CONFIG.TILE_SIZE / 2,
        "wall"
      ) as Phaser.Physics.Arcade.Sprite;
      wall.setDisplaySize(GAME_CONFIG.TILE_SIZE, GAME_CONFIG.TILE_SIZE);
      wall.body.setSize(GAME_CONFIG.TILE_SIZE, GAME_CONFIG.TILE_SIZE);
      wall.refreshBody();
    }

    // Right wall
    for (let y = 0; y < GAME_CONFIG.MAP_HEIGHT; y++) {
      const wall = this.walls.create(
        mapWidth - GAME_CONFIG.TILE_SIZE / 2,
        y * GAME_CONFIG.TILE_SIZE + GAME_CONFIG.TILE_SIZE / 2,
        "wall"
      ) as Phaser.Physics.Arcade.Sprite;
      wall.setDisplaySize(GAME_CONFIG.TILE_SIZE, GAME_CONFIG.TILE_SIZE);
      wall.body.setSize(GAME_CONFIG.TILE_SIZE, GAME_CONFIG.TILE_SIZE);
      wall.refreshBody();
    }
  }

  update(time: number) {
    if (!this.player) return;

    // Lerp other players' positions for smooth movement
    this.lerpOtherPlayers();

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
        this.player.play("walk");
      }
    } else {
      // Stop animation and show still sprite, maintaining current angle
      this.player.stop();
      this.player.setTexture(`${this.playerColor}Still`);
      this.player.setAngle(this.currentAngle);
    }

    // Update player velocity (physics handles collision)
    this.player.setVelocity(velocityX * 60, velocityY * 60);

    // Send position to server (throttled)
    if (this.colyseusClient && this.colyseusClient.room) {
      if (time - this.lastUpdateTime > this.updateThrottle) {
        // Convert pixel position to tile position for server
        const tileX = this.player.x / GAME_CONFIG.TILE_SIZE;
        const tileY = this.player.y / GAME_CONFIG.TILE_SIZE;
        this.colyseusClient.sendMove(tileX, tileY, this.currentAngle, isMoving);
        this.lastUpdateTime = time;
      }
    }
  }
}
