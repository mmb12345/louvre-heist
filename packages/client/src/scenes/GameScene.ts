import Phaser from "phaser";
import { GAME_CONFIG, ROOM_TYPES } from "@louvre-heist/shared";
import { ColyseusClient } from "../network/ColyseusClient";
import type { Player, Room } from "@louvre-heist/shared";
import { generatePlayerName } from "../utils/nameGenerator";

export class GameScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private wasdKeys!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  };
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private currentAngle: number = 0; // Track current facing direction
  private walls!: Phaser.Physics.Arcade.StaticGroup;
  private playerColor!: "pink" | "green" | "blue";
  private bullets!: Phaser.Physics.Arcade.Group;
  private isShooting: boolean = false;
  private shootCooldown: number = 0;

  // Multiplayer
  private colyseusClient!: ColyseusClient;
  private sessionId?: string;
  private otherPlayers: Map<string, Phaser.Physics.Arcade.Sprite> = new Map();
  private playerTargets: Map<
    string,
    { x: number; y: number; angle: number; isMoving: boolean }
  > = new Map();
  private lastUpdateTime: number = 0;
  private updateThrottle: number = 50; // Send updates every 50ms (20 times per second)

  // Minimap
  private minimapContainer!: Phaser.GameObjects.Container;
  private minimapPlayerDot!: Phaser.GameObjects.Circle;
  private minimapOtherPlayerDots: Map<string, Phaser.GameObjects.Circle> = new Map();
  private rooms: Map<string, Room> = new Map();

  // Console
  private consoleVisible: boolean = false;
  private consoleContainer!: Phaser.GameObjects.Container;
  private consoleInput!: Phaser.GameObjects.Text;
  private consoleOutput!: Phaser.GameObjects.Text;
  private consoleInputBuffer: string = "";
  private consoleHistory: string[] = [];
  private consoleHistoryIndex: number = -1;

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
    const startX =
      (startRoomX * GAME_CONFIG.ROOM_SIZE + GAME_CONFIG.ROOM_SIZE / 2) *
      GAME_CONFIG.TILE_SIZE;
    const startY =
      (startRoomY * GAME_CONFIG.ROOM_SIZE + GAME_CONFIG.ROOM_SIZE * 0.75) *
      GAME_CONFIG.TILE_SIZE;

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

    // Setup space key for shooting
    this.spaceKey = this.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.SPACE
    );

    // Create bullets group
    this.bullets = this.physics.add.group();

    // Set physics world bounds to match map size
    this.physics.world.setBounds(
      0,
      0,
      GAME_CONFIG.MAP_WIDTH * GAME_CONFIG.TILE_SIZE,
      GAME_CONFIG.MAP_HEIGHT * GAME_CONFIG.TILE_SIZE
    );

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

    // Create minimap
    this.createMinimap();

    // Create console
    this.createConsole();

    // Setup console keyboard handler
    this.setupConsoleInput();

    // Connect to multiplayer server
    await this.setupMultiplayer();
  }

  private createMinimap() {
    const minimapSize = 200; // Size of minimap in pixels
    const minimapX = this.cameras.main.width - minimapSize - 20; // 20px from right edge
    const minimapY = 20; // 20px from top
    const roomSize = minimapSize / GAME_CONFIG.ROOMS_GRID; // Size of each room on minimap

    // Create container for minimap
    this.minimapContainer = this.add.container(minimapX, minimapY);
    this.minimapContainer.setScrollFactor(0);
    this.minimapContainer.setDepth(100);

    // Background
    const bg = this.add.rectangle(0, 0, minimapSize, minimapSize, 0x000000, 0.7);
    bg.setOrigin(0);
    this.minimapContainer.add(bg);

    // Border
    const border = this.add.rectangle(0, 0, minimapSize, minimapSize);
    border.setOrigin(0);
    border.setStrokeStyle(2, 0xffffff, 0.8);
    this.minimapContainer.add(border);

    // Draw room grid
    const gridGraphics = this.add.graphics();
    gridGraphics.lineStyle(1, 0xffffff, 0.3);

    for (let y = 0; y <= GAME_CONFIG.ROOMS_GRID; y++) {
      gridGraphics.lineBetween(
        0,
        y * roomSize,
        minimapSize,
        y * roomSize
      );
    }

    for (let x = 0; x <= GAME_CONFIG.ROOMS_GRID; x++) {
      gridGraphics.lineBetween(
        x * roomSize,
        0,
        x * roomSize,
        minimapSize
      );
    }

    gridGraphics.setPosition(0, 0);
    this.minimapContainer.add(gridGraphics);

    // Draw wall indicators on minimap
    this.drawMinimapWalls(roomSize);

    // Create player dot
    this.minimapPlayerDot = this.add.circle(0, 0, 4, 0xffffff);
    this.minimapPlayerDot.setStrokeStyle(2, 0x000000);
    this.minimapContainer.add(this.minimapPlayerDot);

    // Title
    const title = this.add.text(minimapSize / 2, -15, "MAP", {
      fontSize: "14px",
      color: "#ffffff",
      fontStyle: "bold",
    });
    title.setOrigin(0.5);
    this.minimapContainer.add(title);
  }

  private drawMinimapWalls(roomSize: number) {
    const DOOR_SIZE = 9;
    const wallGraphics = this.add.graphics();
    wallGraphics.lineStyle(2, 0x8B7355, 0.8);

    // Draw interior walls with doors
    for (let roomY = 0; roomY < GAME_CONFIG.ROOMS_GRID; roomY++) {
      for (let roomX = 0; roomX < GAME_CONFIG.ROOMS_GRID; roomX++) {
        // Vertical walls
        if (roomX < GAME_CONFIG.ROOMS_GRID - 1) {
          const wallX = (roomX + 1) * roomSize;
          const doorStart = Math.floor((GAME_CONFIG.ROOM_SIZE - DOOR_SIZE) / 2);
          const doorEnd = doorStart + DOOR_SIZE;

          // Draw wall segments around door
          const wallStartY = roomY * roomSize;
          const doorStartY = wallStartY + (doorStart / GAME_CONFIG.ROOM_SIZE) * roomSize;
          const doorEndY = wallStartY + (doorEnd / GAME_CONFIG.ROOM_SIZE) * roomSize;
          const wallEndY = (roomY + 1) * roomSize;

          wallGraphics.lineBetween(wallX, wallStartY, wallX, doorStartY);
          wallGraphics.lineBetween(wallX, doorEndY, wallX, wallEndY);
        }

        // Horizontal walls
        if (roomY < GAME_CONFIG.ROOMS_GRID - 1) {
          const wallY = (roomY + 1) * roomSize;
          const doorStart = Math.floor((GAME_CONFIG.ROOM_SIZE - DOOR_SIZE) / 2);
          const doorEnd = doorStart + DOOR_SIZE;

          // Draw wall segments around door
          const wallStartX = roomX * roomSize;
          const doorStartX = wallStartX + (doorStart / GAME_CONFIG.ROOM_SIZE) * roomSize;
          const doorEndX = wallStartX + (doorEnd / GAME_CONFIG.ROOM_SIZE) * roomSize;
          const wallEndX = (roomX + 1) * roomSize;

          wallGraphics.lineBetween(wallStartX, wallY, doorStartX, wallY);
          wallGraphics.lineBetween(doorEndX, wallY, wallEndX, wallY);
        }
      }
    }

    this.minimapContainer.add(wallGraphics);
  }

  private redrawMinimapRoomTypes() {
    const minimapSize = 200;
    const roomSize = minimapSize / GAME_CONFIG.ROOMS_GRID;

    // Remove any existing room type graphics
    const existingRoomGraphics = this.minimapContainer.getByName("roomTypesGraphics");
    if (existingRoomGraphics) {
      existingRoomGraphics.destroy();
    }

    // Create graphics for room types
    const roomGraphics = this.add.graphics();
    roomGraphics.setName("roomTypesGraphics");

    // Define colors for each room type
    const roomColors: Record<string, number> = {
      [ROOM_TYPES.GUARD_ROOM]: 0xFF0000,      // Red
      [ROOM_TYPES.SECURITY_ROOM]: 0xFF6600,   // Orange
      [ROOM_TYPES.CROWN_ROOM]: 0xFFD700,      // Gold
      [ROOM_TYPES.LOOT_ROOM]: 0x00FF00,       // Green
      [ROOM_TYPES.EXIT]: 0x00FFFF,            // Cyan
      [ROOM_TYPES.HALLWAY]: 0x000000,         // Transparent/black
    };

    // Draw colored squares for special rooms
    this.rooms.forEach((room, key) => {
      if (room.roomType === ROOM_TYPES.HALLWAY) return; // Skip hallways

      const color = roomColors[room.roomType];
      if (color !== undefined) {
        roomGraphics.fillStyle(color, 0.3); // 30% opacity
        roomGraphics.fillRect(
          room.gridX * roomSize + 1,
          room.gridY * roomSize + 1,
          roomSize - 2,
          roomSize - 2
        );

        // Add a border for visibility
        roomGraphics.lineStyle(1, color, 0.6);
        roomGraphics.strokeRect(
          room.gridX * roomSize + 1,
          room.gridY * roomSize + 1,
          roomSize - 2,
          roomSize - 2
        );
      }
    });

    // Add to minimap container (insert before player dots)
    this.minimapContainer.addAt(roomGraphics, 3); // Add after grid and walls
  }

  private updateMinimap() {
    const minimapSize = 200;
    const roomSize = minimapSize / GAME_CONFIG.ROOMS_GRID;

    // Update player position on minimap
    const playerTileX = this.player.x / GAME_CONFIG.TILE_SIZE;
    const playerTileY = this.player.y / GAME_CONFIG.TILE_SIZE;
    const minimapX = (playerTileX / GAME_CONFIG.MAP_WIDTH) * minimapSize;
    const minimapY = (playerTileY / GAME_CONFIG.MAP_HEIGHT) * minimapSize;

    this.minimapPlayerDot.setPosition(minimapX, minimapY);

    // Update player dot color based on player color
    const colorMap = {
      pink: 0xFF00EA,
      green: 0x00EA50,
      blue: 0x4169E1
    };
    this.minimapPlayerDot.setFillStyle(colorMap[this.playerColor]);

    // Update other players on minimap
    this.otherPlayers.forEach((sprite, sessionId) => {
      let dot = this.minimapOtherPlayerDots.get(sessionId);

      if (!dot) {
        // Create dot for new player
        const color = sprite.getData("color");
        dot = this.add.circle(0, 0, 3, colorMap[color as keyof typeof colorMap]);
        dot.setStrokeStyle(1, 0x000000);
        this.minimapContainer.add(dot);
        this.minimapOtherPlayerDots.set(sessionId, dot);
      }

      // Update position
      const otherPlayerTileX = sprite.x / GAME_CONFIG.TILE_SIZE;
      const otherPlayerTileY = sprite.y / GAME_CONFIG.TILE_SIZE;
      const otherMinimapX = (otherPlayerTileX / GAME_CONFIG.MAP_WIDTH) * minimapSize;
      const otherMinimapY = (otherPlayerTileY / GAME_CONFIG.MAP_HEIGHT) * minimapSize;

      dot.setPosition(otherMinimapX, otherMinimapY);
    });
  }

  private createConsole() {
    const consoleWidth = 600;
    const consoleHeight = 400;
    const consoleX = (this.cameras.main.width - consoleWidth) / 2;
    const consoleY = 100;

    // Create console container
    this.consoleContainer = this.add.container(consoleX, consoleY);
    this.consoleContainer.setScrollFactor(0);
    this.consoleContainer.setDepth(200); // Above everything
    this.consoleContainer.setVisible(false);

    // Background
    const bg = this.add.rectangle(0, 0, consoleWidth, consoleHeight, 0x000000, 0.9);
    bg.setOrigin(0);
    this.consoleContainer.add(bg);

    // Border
    const border = this.add.rectangle(0, 0, consoleWidth, consoleHeight);
    border.setOrigin(0);
    border.setStrokeStyle(2, 0x00ff00, 1);
    this.consoleContainer.add(border);

    // Title
    const title = this.add.text(10, 10, "DEVELOPER CONSOLE (` or F1 to toggle)", {
      fontSize: "16px",
      color: "#00ff00",
      fontStyle: "bold",
    });
    this.consoleContainer.add(title);

    // Output area
    this.consoleOutput = this.add.text(10, 40, "", {
      fontSize: "14px",
      color: "#ffffff",
      fontFamily: "monospace",
      wordWrap: { width: consoleWidth - 20 },
    });
    this.consoleContainer.add(this.consoleOutput);

    // Input prompt
    const inputPrompt = this.add.text(10, consoleHeight - 30, ">", {
      fontSize: "14px",
      color: "#00ff00",
      fontFamily: "monospace",
    });
    this.consoleContainer.add(inputPrompt);

    // Input text
    this.consoleInput = this.add.text(25, consoleHeight - 30, "", {
      fontSize: "14px",
      color: "#ffffff",
      fontFamily: "monospace",
    });
    this.consoleContainer.add(this.consoleInput);

    // Cursor
    const cursor = this.add.text(0, 0, "_", {
      fontSize: "14px",
      color: "#00ff00",
      fontFamily: "monospace",
    });
    this.consoleContainer.add(cursor);

    // Animate cursor
    this.tweens.add({
      targets: cursor,
      alpha: 0,
      duration: 500,
      yoyo: true,
      repeat: -1,
    });

    // Update cursor position
    this.time.addEvent({
      delay: 50,
      callback: () => {
        if (this.consoleVisible) {
          const inputWidth = this.consoleInput.width;
          cursor.setPosition(25 + inputWidth, consoleHeight - 30);
        }
      },
      loop: true,
    });
  }

  private setupConsoleInput() {
    // Listen for all keyboard input
    this.input.keyboard!.on("keydown", (event: KeyboardEvent) => {
      // Toggle console with tilde/backtick or F1 key
      if (event.key === "`" || event.key === "~" || event.code === "Backquote" || event.key === "F1") {
        event.preventDefault();
        this.consoleVisible = !this.consoleVisible;
        this.consoleContainer.setVisible(this.consoleVisible);

        if (this.consoleVisible) {
          // Focus on console
          this.consoleInputBuffer = "";
          this.consoleInput.setText("");
        }
        return;
      }

      // Handle console input only when visible
      if (!this.consoleVisible) return;

      if (event.key === "Enter") {
        event.preventDefault();
        // Execute command
        const command = this.consoleInputBuffer.trim();
        if (command) {
          this.executeCommand(command);
          this.consoleHistory.push(command);
          this.consoleHistoryIndex = this.consoleHistory.length;
        }
        this.consoleInputBuffer = "";
        this.consoleInput.setText("");
      } else if (event.key === "Backspace") {
        event.preventDefault();
        this.consoleInputBuffer = this.consoleInputBuffer.slice(0, -1);
        this.consoleInput.setText(this.consoleInputBuffer);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        // Navigate history up
        if (this.consoleHistoryIndex > 0) {
          this.consoleHistoryIndex--;
          this.consoleInputBuffer = this.consoleHistory[this.consoleHistoryIndex];
          this.consoleInput.setText(this.consoleInputBuffer);
        }
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        // Navigate history down
        if (this.consoleHistoryIndex < this.consoleHistory.length - 1) {
          this.consoleHistoryIndex++;
          this.consoleInputBuffer = this.consoleHistory[this.consoleHistoryIndex];
          this.consoleInput.setText(this.consoleInputBuffer);
        } else {
          this.consoleHistoryIndex = this.consoleHistory.length;
          this.consoleInputBuffer = "";
          this.consoleInput.setText("");
        }
      } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        // Add character to input
        this.consoleInputBuffer += event.key;
        this.consoleInput.setText(this.consoleInputBuffer);
      }
    });
  }

  private executeCommand(command: string) {
    // Add command to output
    this.addConsoleOutput(`> ${command}`);

    // Parse command
    const parts = command.split(" ");
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    // Handle local commands first
    if (cmd === "help") {
      this.addConsoleOutput("Console: Press ` (tilde) or F1 to toggle");
      this.addConsoleOutput("");
      this.addConsoleOutput("Available commands:");
      this.addConsoleOutput("Local:");
      this.addConsoleOutput("  help - Show this help message");
      this.addConsoleOutput("  clear - Clear console output");
      this.addConsoleOutput("Server:");
      this.addConsoleOutput("  teleport <x> <y> - Teleport to coordinates");
      this.addConsoleOutput("  players - List all connected players");
      this.addConsoleOutput("  rooms - List special room locations");
      this.addConsoleOutput("  godmode - Enable god mode (can't be caught)");
      this.addConsoleOutput("  objective [type] - List or complete objectives");
      this.addConsoleOutput("  time [seconds] - Get or set remaining time");
    } else if (cmd === "clear") {
      this.consoleOutput.setText("");
    } else {
      // Send to server
      if (this.colyseusClient && this.colyseusClient.room) {
        this.colyseusClient.room.send("console_command", { command: cmd, args });
      } else {
        this.addConsoleOutput("Error: Not connected to server");
      }
    }
  }

  private addConsoleOutput(text: string) {
    const currentOutput = this.consoleOutput.text;
    const lines = currentOutput.split("\n");

    // Keep last 15 lines
    if (lines.length >= 15) {
      lines.shift();
    }

    lines.push(text);
    this.consoleOutput.setText(lines.join("\n"));
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

      // Listen for console command responses
      room.onMessage("console_response", (data: { output: string }) => {
        this.addConsoleOutput(data.output);
      });

      // Listen for room data
      room.state.rooms.onAdd((room: Room, key: string) => {
        this.rooms.set(key, room);
        // Redraw minimap with room types
        this.redrawMinimapRoomTypes();
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

      // Remove from minimap
      const minimapDot = this.minimapOtherPlayerDots.get(sessionId);
      if (minimapDot) {
        minimapDot.destroy();
        this.minimapOtherPlayerDots.delete(sessionId);
      }
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
            frames: [{ key: `${color}Walk1` }, { key: `${color}Walk2` }],
            frameRate: 8,
            repeat: -1,
          });
        }
        if (
          !sprite.anims.isPlaying ||
          sprite.anims.currentAnim?.key !== walkAnimKey
        ) {
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

  private shoot() {
    if (this.isShooting || this.shootCooldown > 0) return;

    // Set shooting state
    this.isShooting = true;
    this.shootCooldown = 500; // 500ms cooldown

    // Change to shoot sprite
    this.player.setTexture(`${this.playerColor}Shoot`);
    this.player.setAngle(this.currentAngle);

    // Calculate bullet spawn position from gun (offset from player center)
    const angleInRadians = Phaser.Math.DegToRad(this.currentAngle);

    // Adjust offsets based on direction
    let gunForwardOffset = 35; // Distance from player center forward
    let gunSideOffset = -50;

    if (this.currentAngle === 90 || this.currentAngle === 270) {
      gunSideOffset = -gunSideOffset; // Flip for horizontal directions
      gunForwardOffset = -35; // Move back for left/right to reach gun end
    }

    // Calculate position: forward along facing direction + sideways perpendicular
    const bulletStartX =
      this.player.x +
      Math.sin(angleInRadians) * gunForwardOffset +
      Math.sin(angleInRadians + Math.PI / 2) * gunSideOffset;
    const bulletStartY =
      this.player.y +
      Math.cos(angleInRadians) * gunForwardOffset +
      Math.cos(angleInRadians + Math.PI / 2) * gunSideOffset;

    // Create bullet as a physics sprite using the bullet texture
    const bullet = this.physics.add.sprite(
      bulletStartX,
      bulletStartY,
      "bullet"
    );
    bullet.setDepth(15);
    bullet.setScale(1.5);

    // Calculate bullet velocity based on current angle
    // Note: In Phaser, angle 0 is facing down, and increases clockwise
    const bulletSpeed = 500;
    const velocityX = -Math.sin(angleInRadians) * bulletSpeed; // Negated for correct X direction
    const velocityY = Math.cos(angleInRadians) * bulletSpeed;

    // Store velocity on the bullet for manual updates
    bullet.setData("velocityX", velocityX);
    bullet.setData("velocityY", velocityY);

    // Set velocity on the physics body
    bullet.setVelocity(velocityX, velocityY);

    // Add bullet to group for tracking
    this.bullets.add(bullet);

    // Auto-destroy bullet after 5 seconds
    this.time.delayedCall(5000, () => {
      if (bullet && bullet.active) {
        bullet.destroy();
      }
    });

    // Reset shooting sprite after 600ms
    this.time.delayedCall(600, () => {
      this.isShooting = false;
    });
  }

  update(time: number, delta: number) {
    if (!this.player) return;

    // Lerp other players' positions for smooth movement
    this.lerpOtherPlayers();

    // Update minimap
    this.updateMinimap();

    // Update shoot cooldown
    if (this.shootCooldown > 0) {
      this.shootCooldown -= delta;
    }

    // Handle shooting
    if (Phaser.Input.Keyboard.JustDown(this.spaceKey) && !this.consoleVisible) {
      this.shoot();
    }

    // Update bullets - move them and remove if off screen
    this.bullets.children.entries.forEach((bullet) => {
      const b = bullet as Phaser.Physics.Arcade.Sprite;
      if (b.active) {
        // Manually update bullet position
        const velX = b.getData("velocityX") || 0;
        const velY = b.getData("velocityY") || 0;
        b.x += velX * (delta / 1000);
        b.y += velY * (delta / 1000);

        // Remove bullets that go off screen
        const bounds = this.physics.world.bounds;
        if (
          b.x < bounds.x ||
          b.x > bounds.x + bounds.width ||
          b.y < bounds.y ||
          b.y > bounds.y + bounds.height
        ) {
          b.destroy();
        }
      }
    });

    let velocityX = 0;
    let velocityY = 0;

    // Skip player input if console is visible
    if (!this.consoleVisible) {
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

        // Play walk animation if not already playing (and not shooting)
        if (!this.isShooting) {
          if (!this.player.anims.isPlaying) {
            this.player.play("walk");
          }
        }
      } else {
        // Stop animation and show still sprite, maintaining current angle (unless shooting)
        if (!this.isShooting) {
          this.player.stop();
          this.player.setTexture(`${this.playerColor}Still`);
          this.player.setAngle(this.currentAngle);
        }
      }

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

    // Update player velocity (physics handles collision)
    this.player.setVelocity(velocityX * 60, velocityY * 60);
  }
}
