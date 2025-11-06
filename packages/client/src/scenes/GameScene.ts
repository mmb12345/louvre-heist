import Phaser from "phaser";
import { GAME_CONFIG, ROOM_TYPES } from "@louvre-heist/shared";
import { ColyseusClient } from "../network/ColyseusClient";
import type { Player, Room, Guard, Crown, PostIt } from "@louvre-heist/shared";
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
  private updateThrottle: number = 100; // Send updates every 100ms (10 times per second)
  private lastSentPosition: { x: number; y: number; angle: number } = {
    x: 0,
    y: 0,
    angle: 0,
  };

  // Guards
  private guards: Map<string, Phaser.Physics.Arcade.Sprite> = new Map();
  private guardTargets: Map<string, { x: number; y: number }> = new Map();
  private guardLastServerPos: Map<string, { x: number; y: number }> = new Map(); // Track last known server position
  private guardsGroup!: Phaser.Physics.Arcade.Group;

  // Minimap
  private minimapContainer!: Phaser.GameObjects.Container;
  private minimapPlayerDot!: Phaser.GameObjects.Circle;
  private minimapOtherPlayerDots: Map<string, Phaser.GameObjects.Circle> =
    new Map();
  private minimapGuardDots: Map<string, Phaser.GameObjects.Circle> = new Map();
  private rooms: Map<string, Room> = new Map();
  private roomItems: Map<string, Phaser.Physics.Arcade.Sprite> = new Map();

  // Crown
  private crownSprite?: Phaser.GameObjects.Sprite;
  private crownUIIndicator?: Phaser.GameObjects.Container;

  // Post-it
  private postitSprite?: Phaser.GameObjects.Sprite;
  private passwordUIIndicator?: Phaser.GameObjects.Container;

  // Console
  private consoleVisible: boolean = false;
  private consoleContainer!: Phaser.GameObjects.Container;
  private consoleInput!: Phaser.GameObjects.Text;
  private consoleOutput!: Phaser.GameObjects.Text;
  private consoleInputBuffer: string = "";
  private consoleHistory: string[] = [];
  private consoleHistoryIndex: number = -1;

  // Game Over
  private isGameOver: boolean = false;

  constructor() {
    super({ key: "GameScene" });
  }

  async create() {
    // Prevent game from pausing when window loses focus
    this.game.events.off("blur");
    this.game.events.off("focus");

    // Reset physics on window focus to prevent slow movement
    window.addEventListener("focus", () => {
      if (this.player && this.player.body) {
        this.player.body.reset(this.player.x, this.player.y);
      }
    });

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
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    if (playerBody) {
      playerBody.setSize(24, 24);
      playerBody.setOffset(4, 4);
    }

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

    // Create guards group
    this.guardsGroup = this.physics.add.group();

    // Set up collision between bullets and guards
    this.physics.add.overlap(
      this.bullets,
      this.guardsGroup,
      this.bulletHitGuard as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this
    );

    // Set up collision between bullets and walls (bullets destroy on impact)
    this.physics.add.collider(
      this.bullets,
      this.walls,
      (bullet) => {
        bullet.destroy();
      },
      undefined,
      this
    );

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
    const bg = this.add.rectangle(
      0,
      0,
      minimapSize,
      minimapSize,
      0x000000,
      0.7
    );
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
      gridGraphics.lineBetween(0, y * roomSize, minimapSize, y * roomSize);
    }

    for (let x = 0; x <= GAME_CONFIG.ROOMS_GRID; x++) {
      gridGraphics.lineBetween(x * roomSize, 0, x * roomSize, minimapSize);
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
    wallGraphics.lineStyle(2, 0x8b7355, 0.8);

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
          const doorStartY =
            wallStartY + (doorStart / GAME_CONFIG.ROOM_SIZE) * roomSize;
          const doorEndY =
            wallStartY + (doorEnd / GAME_CONFIG.ROOM_SIZE) * roomSize;
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
          const doorStartX =
            wallStartX + (doorStart / GAME_CONFIG.ROOM_SIZE) * roomSize;
          const doorEndX =
            wallStartX + (doorEnd / GAME_CONFIG.ROOM_SIZE) * roomSize;
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
    const existingRoomGraphics =
      this.minimapContainer.getByName("roomTypesGraphics");
    if (existingRoomGraphics) {
      existingRoomGraphics.destroy();
    }

    // Create graphics for room types
    const roomGraphics = this.add.graphics();
    roomGraphics.setName("roomTypesGraphics");

    // Define colors for each room type
    const roomColors: Record<string, number> = {
      [ROOM_TYPES.GUARD_ROOM]: 0xff0000, // Red
      [ROOM_TYPES.SECURITY_ROOM]: 0xff6600, // Orange
      [ROOM_TYPES.CROWN_ROOM]: 0xffd700, // Gold
      [ROOM_TYPES.LOOT_ROOM]: 0x00ff00, // Green
      [ROOM_TYPES.EXIT]: 0x00ffff, // Cyan
      [ROOM_TYPES.HALLWAY]: 0x000000, // Transparent/black
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
      pink: 0xff00ea,
      green: 0x00ea50,
      blue: 0x4169e1,
    };
    this.minimapPlayerDot.setFillStyle(colorMap[this.playerColor]);

    // Update other players on minimap
    this.otherPlayers.forEach((sprite, sessionId) => {
      let dot = this.minimapOtherPlayerDots.get(sessionId);

      if (!dot) {
        // Create dot for new player
        const color = sprite.getData("color");
        dot = this.add.circle(
          0,
          0,
          3,
          colorMap[color as keyof typeof colorMap]
        );
        dot.setStrokeStyle(1, 0x000000);
        this.minimapContainer.add(dot);
        this.minimapOtherPlayerDots.set(sessionId, dot);
      }

      // Update position
      const otherPlayerTileX = sprite.x / GAME_CONFIG.TILE_SIZE;
      const otherPlayerTileY = sprite.y / GAME_CONFIG.TILE_SIZE;
      const otherMinimapX =
        (otherPlayerTileX / GAME_CONFIG.MAP_WIDTH) * minimapSize;
      const otherMinimapY =
        (otherPlayerTileY / GAME_CONFIG.MAP_HEIGHT) * minimapSize;

      dot.setPosition(otherMinimapX, otherMinimapY);
    });

    // Update guards on minimap
    this.guards.forEach((sprite, guardId) => {
      let dot = this.minimapGuardDots.get(guardId);

      if (!dot) {
        // Create dot for new guard (red/orange color to indicate danger)
        dot = this.add.circle(0, 0, 4, 0xff0000); // Red, slightly larger than players
        dot.setStrokeStyle(1, 0x000000);
        this.minimapContainer.add(dot);
        this.minimapGuardDots.set(guardId, dot);
      }

      // Update position
      const guardTileX = sprite.x / GAME_CONFIG.TILE_SIZE;
      const guardTileY = sprite.y / GAME_CONFIG.TILE_SIZE;
      const guardMinimapX = (guardTileX / GAME_CONFIG.MAP_WIDTH) * minimapSize;
      const guardMinimapY = (guardTileY / GAME_CONFIG.MAP_HEIGHT) * minimapSize;

      dot.setPosition(guardMinimapX, guardMinimapY);
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
    const bg = this.add.rectangle(
      0,
      0,
      consoleWidth,
      consoleHeight,
      0x000000,
      0.9
    );
    bg.setOrigin(0);
    this.consoleContainer.add(bg);

    // Border
    const border = this.add.rectangle(0, 0, consoleWidth, consoleHeight);
    border.setOrigin(0);
    border.setStrokeStyle(2, 0x00ff00, 1);
    this.consoleContainer.add(border);

    // Title
    const title = this.add.text(
      10,
      10,
      "DEVELOPER CONSOLE (` or F1 to toggle)",
      {
        fontSize: "16px",
        color: "#00ff00",
        fontStyle: "bold",
      }
    );
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
      if (
        event.key === "`" ||
        event.key === "~" ||
        event.code === "Backquote" ||
        event.key === "F1"
      ) {
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
          this.consoleInputBuffer =
            this.consoleHistory[this.consoleHistoryIndex];
          this.consoleInput.setText(this.consoleInputBuffer);
        }
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        // Navigate history down
        if (this.consoleHistoryIndex < this.consoleHistory.length - 1) {
          this.consoleHistoryIndex++;
          this.consoleInputBuffer =
            this.consoleHistory[this.consoleHistoryIndex];
          this.consoleInput.setText(this.consoleInputBuffer);
        } else {
          this.consoleHistoryIndex = this.consoleHistory.length;
          this.consoleInputBuffer = "";
          this.consoleInput.setText("");
        }
      } else if (
        event.key.length === 1 &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
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
      this.addConsoleOutput("  reset - Regenerate map and reset positions");
    } else if (cmd === "clear") {
      this.consoleOutput.setText("");
    } else {
      // Send to server
      if (this.colyseusClient && this.colyseusClient.room) {
        this.colyseusClient.room.send("console_command", {
          command: cmd,
          args,
        });
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

      // Listen for position reset (from reset command)
      room.onMessage("reset_position", (data: { x: number; y: number }) => {
        // Update physics body position to match server reset
        this.player.setPosition(
          data.x * GAME_CONFIG.TILE_SIZE,
          data.y * GAME_CONFIG.TILE_SIZE
        );
        // Reset velocity to stop any movement
        if (this.player.body && "velocity" in this.player.body) {
          this.player.body.velocity.set(0, 0);
        }
      });

      // Listen for room data
      room.state.rooms.onAdd((room: Room, key: string) => {
        this.rooms.set(key, room);
        // Redraw minimap with room types
        this.redrawMinimapRoomTypes();
        // Place room items
        this.placeRoomItem(room, key);
      });

      // Delay network updates to let initial state settle
      this.time.delayedCall(500, () => {
        this.lastUpdateTime = this.time.now;
      });

      // Listen for room removal (e.g., on reset)
      room.state.rooms.onRemove((room: Room, key: string) => {
        this.rooms.delete(key);
        // Remove room item sprite if it exists
        const item = this.roomItems.get(key);
        if (item) {
          item.destroy();
          this.roomItems.delete(key);
        }
      });

      // Listen for guards joining
      room.state.guards.onAdd((guard: Guard, guardId: string) => {
        console.log("Guard added:", guardId);
        this.addGuard(guardId, guard);

        // Listen to guard position changes
        guard.onChange(() => {
          this.updateGuardTarget(guardId, guard);
        });
      });

      // Listen for guards leaving (e.g., when killed)
      room.state.guards.onRemove((guard: Guard, guardId: string) => {
        console.log("Guard removed:", guardId);
        this.removeGuard(guardId);
      });

      // Process existing guards that are already in the state
      room.state.guards.forEach((guard: Guard, guardId: string) => {
        console.log("Processing existing guard:", guardId);
        this.addGuard(guardId, guard);

        // Listen to guard position changes
        guard.onChange(() => {
          this.updateGuardTarget(guardId, guard);
        });
      });

      // Use a delayed check to wait for crown to be initialized
      this.time.delayedCall(1000, () => {
        if (room.state.crown) {
          console.log("Crown detected in room state!", room.state.crown);
          this.renderCrown(room.state.crown);

          // Listen for crown property changes
          room.state.crown.onChange(() => {
            console.log("Crown changed!", room.state.crown);
            if (room.state.crown) {
              this.renderCrown(room.state.crown);
            }
          });
        } else {
          console.log("No crown in room state yet");
        }
      });

      // Listen for crown picked up event
      room.onMessage(
        "crown_picked_up",
        (data: { playerId: string; playerName: string }) => {
          console.log(`${data.playerName} picked up the crown!`);
          this.showCrownPickupMessage(data.playerName);
        }
      );

      // Use a delayed check to wait for post-it to be initialized
      this.time.delayedCall(1000, () => {
        if (room.state.postit) {
          console.log("Post-it detected in room state!", room.state.postit);
          this.renderPostIt(room.state.postit);

          // Listen for post-it property changes
          room.state.postit.onChange(() => {
            console.log("Post-it changed!", room.state.postit);
            if (room.state.postit) {
              this.renderPostIt(room.state.postit);
            }
          });
        } else {
          console.log("No post-it in room state yet");
        }
      });

      // Listen for post-it picked up event
      room.onMessage(
        "postit_picked_up",
        (data: { playerId: string; playerName: string; password: string }) => {
          console.log(`${data.playerName} picked up the post-it!`);
          this.showPasswordUI(data.password);
        }
      );

      // Listen for guard shooting event
      room.onMessage(
        "guard_shoot",
        (data: { guardId: string; guardX: number; guardY: number; targetX: number; targetY: number }) => {
          this.spawnGuardBullet(data.guardX, data.guardY, data.targetX, data.targetY);
        }
      );
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

    // Add collision with all room items (computers, etc.)
    this.roomItems.forEach((item) => {
      this.physics.add.collider(sprite, item);
    });

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

  private addGuard(guardId: string, guard: Guard) {
    console.log(
      `Creating guard sprite for ${guardId} at pixel position (${
        guard.x * GAME_CONFIG.TILE_SIZE
      }, ${guard.y * GAME_CONFIG.TILE_SIZE})`
    );

    // Create sprite for guard at their position
    const sprite = this.physics.add.sprite(
      guard.x * GAME_CONFIG.TILE_SIZE,
      guard.y * GAME_CONFIG.TILE_SIZE,
      "guardStill"
    );

    // Set depth to be same as player so they're visible
    sprite.setDepth(10);

    // Store guard ID in sprite data for collision detection
    sprite.setData("guardId", guardId);

    // Add to guards group for collision detection with bullets FIRST
    this.guardsGroup.add(sprite);

    // Set collision body (3x wider, 2x taller than original 24x24)
    const hitboxWidth = 72; // 24 * 3
    const hitboxHeight = 48; // 24 * 2
    const body = sprite.body as Phaser.Physics.Arcade.Body;
    if (body) {
      // Get sprite dimensions
      const spriteWidth = sprite.width;
      const spriteHeight = sprite.height;

      body.setSize(hitboxWidth, hitboxHeight);
      // Center the hitbox on the sprite center
      const offsetX = (spriteWidth - hitboxWidth) / 2;
      const offsetY = (spriteHeight - hitboxHeight) / 2;
      body.setOffset(offsetX, offsetY);
    }

    // Add collision with walls
    this.physics.add.collider(sprite, this.walls);

    // Add collision with all room items (computers, etc.)
    this.roomItems.forEach((item) => {
      this.physics.add.collider(sprite, item);
    });

    // Add collision with players
    this.physics.add.collider(sprite, this.player);

    this.guards.set(guardId, sprite);
    console.log(
      `Guard ${guardId} sprite created successfully. Total guards: ${this.guards.size}`
    );

    // Initialize target position for lerping
    this.guardTargets.set(guardId, {
      x: guard.x * GAME_CONFIG.TILE_SIZE,
      y: guard.y * GAME_CONFIG.TILE_SIZE,
    });

    // Create walking animation
    if (!this.anims.exists("guardWalk")) {
      this.anims.create({
        key: "guardWalk",
        frames: [{ key: "guardWalk1" }, { key: "guardWalk2" }],
        frameRate: 8,
        repeat: -1,
      });
    }
  }

  private killGuard(guardId: string, impactAngle: number) {
    const sprite = this.guards.get(guardId);
    if (!sprite) return;

    // Mark as dead to prevent multiple kills
    sprite.setData("isDead", true);

    // Change to dead sprite
    sprite.setTexture("guardDead");

    // Stop any animation
    if (sprite.anims.isPlaying) {
      sprite.stop();
    }

    // Rotate guard to fall away from bullet impact
    // Add 90 degrees (PI/2) to align with sprite orientation
    sprite.setRotation(impactAngle + Math.PI / 2);

    // Lower depth so dead guards are below living entities but above floor
    sprite.setDepth(6); // Below players (10) and living guards (10), above crown/items (5)

    // Remove from guards group (no more collision with bullets)
    this.guardsGroup.remove(sprite, false, false);

    // Disable physics body but keep sprite visible
    if (sprite.body) {
      sprite.body.enable = false;
    }

    // Remove from tracking (no more movement updates)
    this.guardTargets.delete(guardId);
    this.guardLastServerPos.delete(guardId);

    // Change minimap dot to gray to show dead
    const dot = this.minimapGuardDots.get(guardId);
    if (dot) {
      dot.setFillStyle(0x666666); // Gray for dead
    }
  }

  private removeGuard(guardId: string) {
    const sprite = this.guards.get(guardId);
    if (sprite) {
      // Remove from guards group
      this.guardsGroup.remove(sprite, true, true);
      this.guards.delete(guardId);
      this.guardTargets.delete(guardId);
    }

    // Remove minimap dot
    const dot = this.minimapGuardDots.get(guardId);
    if (dot) {
      dot.destroy();
      this.minimapGuardDots.delete(guardId);
    }
  }

  private updateGuardTarget(guardId: string, guard: Guard) {
    // Update the target position for lerping
    this.guardTargets.set(guardId, {
      x: guard.x * GAME_CONFIG.TILE_SIZE,
      y: guard.y * GAME_CONFIG.TILE_SIZE,
    });
  }

  private placeRoomItem(room: Room, key: string) {
    // Only place items in specific room types
    if (room.roomType === ROOM_TYPES.SECURITY_ROOM) {
      // Calculate center position of the room in pixels
      const centerX =
        (room.gridX * GAME_CONFIG.ROOM_SIZE + GAME_CONFIG.ROOM_SIZE / 2) *
        GAME_CONFIG.TILE_SIZE;
      const centerY =
        (room.gridY * GAME_CONFIG.ROOM_SIZE + GAME_CONFIG.ROOM_SIZE / 2) *
        GAME_CONFIG.TILE_SIZE;

      // Create the control room computer as a static physics sprite
      const computer = this.physics.add.staticSprite(
        centerX,
        centerY,
        "controlRoomComputer"
      );
      computer.setDepth(5); // Below player (10) but above floor

      // Set up collision body to match the sprite size
      computer.refreshBody();

      // Add collision with player
      this.physics.add.collider(this.player, computer);

      // Add collision with other players
      this.otherPlayers.forEach((otherPlayer) => {
        this.physics.add.collider(otherPlayer, computer);
      });

      // Store the sprite for cleanup
      this.roomItems.set(key, computer);
    }
  }

  private renderCrown(crown: Crown) {
    if (crown.pickedUp) {
      // Crown has been picked up, hide the world sprite
      if (this.crownSprite) {
        this.crownSprite.setVisible(false);
      }

      // Show UI indicator for the player who has it
      this.updateCrownUIIndicator(crown.ownerId);
    } else {
      // Crown is in the world, show it
      if (!this.crownSprite) {
        // Create crown sprite
        this.crownSprite = this.add.sprite(
          crown.x * GAME_CONFIG.TILE_SIZE,
          crown.y * GAME_CONFIG.TILE_SIZE,
          "crown"
        );
        this.crownSprite.setDepth(5); // Below player but above floor
        this.crownSprite.setScale(0.8); // Scale down a bit
      } else {
        // Update position and make visible
        this.crownSprite.setPosition(
          crown.x * GAME_CONFIG.TILE_SIZE,
          crown.y * GAME_CONFIG.TILE_SIZE
        );
        this.crownSprite.setVisible(true);
      }

      // Hide UI indicator since no one has it
      if (this.crownUIIndicator) {
        this.crownUIIndicator.setVisible(false);
      }
    }
  }

  private updateCrownUIIndicator(ownerId: string) {
    // Check if the local player has the crown
    const localPlayerHasCrown = ownerId === this.sessionId;

    if (!this.crownUIIndicator) {
      // Create crown UI indicator container in top right corner
      this.crownUIIndicator = this.add.container(0, 0);
      this.crownUIIndicator.setScrollFactor(0); // Fixed to camera
      this.crownUIIndicator.setDepth(1000); // On top of everything

      // Background
      const bg = this.add.rectangle(0, 0, 100, 40, 0x000000, 0.7);
      this.crownUIIndicator.add(bg);

      // Crown icon (smaller)
      const crownIcon = this.add.sprite(-30, 0, "crown");
      crownIcon.setScale(0.3);
      this.crownUIIndicator.add(crownIcon);

      // Text
      const crownText = this.add.text(0, 0, "Crown", {
        fontSize: "16px",
        color: "#FFD700",
      });
      crownText.setOrigin(0, 0.5);
      this.crownUIIndicator.add(crownText);

      // Position in bottom left
      this.crownUIIndicator.setPosition(80, this.cameras.main.height - 30);
    }

    // Show/hide based on whether someone has the crown
    if (ownerId) {
      this.crownUIIndicator.setVisible(true);

      // Update the text to show who has it
      const crownText = this.crownUIIndicator.getAt(
        2
      ) as Phaser.GameObjects.Text;
      if (localPlayerHasCrown) {
        crownText.setText("You have\nthe crown!");
        crownText.setColor("#FFD700");
      } else {
        // Find the player name
        const ownerPlayer = this.otherPlayers.get(ownerId);
        if (ownerPlayer) {
          const nameText = ownerPlayer.getData(
            "nameText"
          ) as Phaser.GameObjects.Text;
          const playerName = nameText?.text || "Player";
          crownText.setText(`${playerName}\nhas crown`);
          crownText.setColor("#FFFFFF");
        }
      }
    } else {
      this.crownUIIndicator.setVisible(false);
    }
  }

  private showCrownPickupMessage(playerName: string) {
    // Play crown pickup sound
    this.sound.play("crown-picked-up", { volume: 0.2 });

    // Show a temporary message in the center of the screen
    const message = this.add.text(
      this.cameras.main.centerX,
      this.cameras.main.centerY - 100,
      `${playerName} picked up the crown!`,
      {
        fontSize: "24px",
        color: "#FFD700",
        backgroundColor: "#000000cc",
        padding: { x: 20, y: 10 },
      }
    );
    message.setOrigin(0.5);
    message.setScrollFactor(0);
    message.setDepth(1001);

    // Fade out and destroy after 3 seconds
    this.tweens.add({
      targets: message,
      alpha: 0,
      duration: 1000,
      delay: 2000,
      onComplete: () => {
        message.destroy();
      },
    });
  }

  private renderPostIt(postit: PostIt) {
    if (postit.pickedUp) {
      // Post-it has been picked up, hide the world sprite
      if (this.postitSprite) {
        this.postitSprite.setVisible(false);
      }
    } else {
      // Post-it is in the world, show it
      if (!this.postitSprite) {
        // Create post-it sprite
        this.postitSprite = this.add.sprite(
          postit.x * GAME_CONFIG.TILE_SIZE,
          postit.y * GAME_CONFIG.TILE_SIZE,
          "postit"
        );
        this.postitSprite.setDepth(5); // Below player but above floor
        this.postitSprite.setScale(1); // Normal size
      } else {
        // Update position and make visible
        this.postitSprite.setPosition(
          postit.x * GAME_CONFIG.TILE_SIZE,
          postit.y * GAME_CONFIG.TILE_SIZE
        );
        this.postitSprite.setVisible(true);
      }
    }
  }

  private showPasswordUI(password: string) {
    // Create password UI indicator in lower right corner if it doesn't exist
    if (!this.passwordUIIndicator) {
      this.passwordUIIndicator = this.add.container(0, 0);
      this.passwordUIIndicator.setScrollFactor(0); // Fixed to camera
      this.passwordUIIndicator.setDepth(1000); // On top of everything

      // Background
      const bg = this.add.rectangle(0, 0, 150, 60, 0x000000, 0.8);
      this.passwordUIIndicator.add(bg);

      // Title
      const title = this.add.text(0, -15, "PASSWORD:", {
        fontSize: "12px",
        color: "#FFFF00",
        fontStyle: "bold",
      });
      title.setOrigin(0.5);
      this.passwordUIIndicator.add(title);

      // Password text
      const passwordText = this.add.text(0, 5, password, {
        fontSize: "20px",
        color: "#FFE66D",
        fontStyle: "bold",
      });
      passwordText.setOrigin(0.5);
      this.passwordUIIndicator.add(passwordText);

      // Position in lower right
      this.passwordUIIndicator.setPosition(
        this.cameras.main.width - 100,
        this.cameras.main.height - 50
      );
    }

    // Show the password UI
    this.passwordUIIndicator.setVisible(true);
  }

  private showGameOverScreen() {
    if (this.isGameOver) return; // Already showing game over
    this.isGameOver = true;

    // Stop player movement
    if (this.player.body && "velocity" in this.player.body) {
      this.player.body.velocity.set(0, 0);
    }

    // Count alive players
    let alivePlayers = 0;
    let totalPlayers = 0;
    if (this.room && this.room.state && this.room.state.players) {
      this.room.state.players.forEach((player) => {
        totalPlayers++;
        if (!player.caught) {
          alivePlayers++;
        }
      });
    }

    // Create container for game over screen
    const gameOverContainer = this.add.container(0, 0);
    gameOverContainer.setScrollFactor(0);
    gameOverContainer.setDepth(2000);

    // Semi-transparent black overlay
    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.8);
    overlay.fillRect(0, 0, this.cameras.main.width, this.cameras.main.height);
    gameOverContainer.add(overlay);

    // Game Over text
    const gameOverText = this.add.text(
      this.cameras.main.centerX,
      this.cameras.main.centerY - 80,
      "GAME OVER",
      {
        fontSize: "64px",
        color: "#ff0000",
        fontStyle: "bold",
      }
    );
    gameOverText.setOrigin(0.5);
    gameOverContainer.add(gameOverText);

    // Shot message
    const shotText = this.add.text(
      this.cameras.main.centerX,
      this.cameras.main.centerY - 10,
      "You were shot by a guard!",
      {
        fontSize: "24px",
        color: "#ffffff",
      }
    );
    shotText.setOrigin(0.5);
    gameOverContainer.add(shotText);

    // Players alive count
    const playersAliveText = this.add.text(
      this.cameras.main.centerX,
      this.cameras.main.centerY + 30,
      `Players alive: ${alivePlayers}/${totalPlayers}`,
      {
        fontSize: "28px",
        color: alivePlayers > 0 ? "#00ff00" : "#ff0000",
        fontStyle: "bold",
      }
    );
    playersAliveText.setOrigin(0.5);
    gameOverContainer.add(playersAliveText);

    // Restart instructions
    const restartText = this.add.text(
      this.cameras.main.centerX,
      this.cameras.main.centerY + 90,
      "Press SPACE to restart",
      {
        fontSize: "20px",
        color: "#ffff00",
      }
    );
    restartText.setOrigin(0.5);
    gameOverContainer.add(restartText);

    // Add blinking effect to restart text
    this.tweens.add({
      targets: restartText,
      alpha: 0.3,
      duration: 800,
      yoyo: true,
      repeat: -1,
    });
  }

  private restartGame() {
    // Reset game over flag
    this.isGameOver = false;

    // Disconnect from current room
    if (this.colyseusClient) {
      this.colyseusClient.leave();
    }

    // Restart the scene
    this.scene.restart();
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
      const lerpFactor = 0.3; // Interpolation speed (0.3 = 30% per frame, more responsive)

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

  private lerpGuards() {
    if (!this.colyseusClient || !this.colyseusClient.room) return;

    // Interpolate positions of all guards for smooth movement
    this.guards.forEach((sprite, guardId) => {
      // Skip dead guards (they stay in place)
      const isDead = sprite.getData("isDead");
      if (isDead) return;

      // Get current server position for this guard
      const guard = this.colyseusClient.room!.state.guards.get(guardId);
      if (!guard) return;

      // Convert server position (tile coordinates) to pixel coordinates
      const serverX = guard.x * GAME_CONFIG.TILE_SIZE;
      const serverY = guard.y * GAME_CONFIG.TILE_SIZE;

      // Get last known server position
      const lastServerPos = this.guardLastServerPos.get(guardId);

      // Check if server position has changed
      if (
        !lastServerPos ||
        lastServerPos.x !== serverX ||
        lastServerPos.y !== serverY
      ) {
        // Server position changed - update target and last position
        this.guardTargets.set(guardId, { x: serverX, y: serverY });
        this.guardLastServerPos.set(guardId, { x: serverX, y: serverY });
      }

      // Get target position for lerping
      const target = this.guardTargets.get(guardId);
      if (!target) return;

      // Use a higher lerp factor for smoother, faster interpolation
      const lerpFactor = 0.05;

      // Lerp sprite position towards target
      const currentX = sprite.x;
      const currentY = sprite.y;
      const newX = currentX + (target.x - currentX) * lerpFactor;
      const newY = currentY + (target.y - currentY) * lerpFactor;

      sprite.setPosition(newX, newY);

      // Calculate if guard is moving based on distance to target
      const distanceToTarget = Math.sqrt(
        Math.pow(target.x - currentX, 2) + Math.pow(target.y - currentY, 2)
      );
      const isMoving = distanceToTarget > 2; // Moving if more than 2 pixels from target

      // Calculate rotation angle based on movement direction
      if (isMoving) {
        const dx = target.x - currentX;
        const dy = target.y - currentY;
        const angle = Math.atan2(dy, dx);

        // Set rotation to face movement direction (add 90 degrees + 180 degrees flip)
        sprite.setRotation(angle + Math.PI / 2 + Math.PI);

        // Play walking animation
        if (
          !sprite.anims.isPlaying ||
          sprite.anims.currentAnim?.key !== "guardWalk"
        ) {
          sprite.play("guardWalk");
        }
      } else {
        // Stop animation when not moving
        if (sprite.anims.isPlaying) {
          sprite.stop();
          sprite.setTexture("guardStill");
        }
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
              if (wallSprite.body) {
                wallSprite.body.setSize(
                  GAME_CONFIG.TILE_SIZE,
                  GAME_CONFIG.TILE_SIZE
                );
              }
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
              if (wallSprite.body) {
                wallSprite.body.setSize(
                  GAME_CONFIG.TILE_SIZE,
                  GAME_CONFIG.TILE_SIZE
                );
              }
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
      if (wall.body) {
        wall.body.setSize(GAME_CONFIG.TILE_SIZE, GAME_CONFIG.TILE_SIZE);
      }
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
      if (wall.body) {
        wall.body.setSize(GAME_CONFIG.TILE_SIZE, GAME_CONFIG.TILE_SIZE);
      }
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
      if (wall.body) {
        wall.body.setSize(GAME_CONFIG.TILE_SIZE, GAME_CONFIG.TILE_SIZE);
      }
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
      if (wall.body) {
        wall.body.setSize(GAME_CONFIG.TILE_SIZE, GAME_CONFIG.TILE_SIZE);
      }
      wall.refreshBody();
    }
  }

  private bulletHitGuard(
    bullet: Phaser.GameObjects.GameObject,
    guard: Phaser.GameObjects.GameObject
  ) {
    const bulletSprite = bullet as Phaser.Physics.Arcade.Sprite;
    const guardSprite = guard as Phaser.Physics.Arcade.Sprite;

    // Calculate the direction from bullet to guard (direction of impact)
    const dx = guardSprite.x - bulletSprite.x;
    const dy = guardSprite.y - bulletSprite.y;
    const impactAngle = Math.atan2(dy, dx);

    // Destroy the bullet
    bullet.destroy();

    // Play guard shot sound (skip first 400ms of silence)
    this.sound.play("guard-shot", { volume: 0.3, seek: 0.4 });

    // Find the guard ID from the sprite
    const guardId = guardSprite.getData("guardId");

    if (guardId) {
      // Check if already dead
      const isDead = guardSprite.getData("isDead");
      if (isDead) return; // Already dead, don't process again

      // Mark guard as dead (leave body on floor), pass impact direction
      this.killGuard(guardId, impactAngle);

      // Notify server that guard was killed
      if (this.colyseusClient && this.colyseusClient.room) {
        this.colyseusClient.room.send("guard_killed", { guardId });
      }
    }
  }

  private shoot() {
    if (this.isShooting || this.shootCooldown > 0) return;

    // Set shooting state
    this.isShooting = true;
    this.shootCooldown = 200; // 500ms cooldown

    // Play shoot sound
    this.sound.play("shoot", { volume: 0.05 });

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

    // Add bullet to group for tracking first
    this.bullets.add(bullet);

    // Set collision body size for bullet (larger for better collision detection)
    const body = bullet.body as Phaser.Physics.Arcade.Body;
    if (body) {
      body.setCircle(20); // Larger hitbox for easier guard kills
      body.setAllowGravity(false); // Ensure no gravity affects bullet
      body.setDrag(0); // No drag/friction
    }

    // Calculate bullet velocity based on current angle
    // Note: In Phaser, angle 0 is facing down, and increases clockwise
    const bulletSpeed = 1200; // Fast enough to be visible but slow enough for collision
    const velocityX = -Math.sin(angleInRadians) * bulletSpeed; // Negated for correct X direction
    const velocityY = Math.cos(angleInRadians) * bulletSpeed;

    // Set velocity on the physics body after adding to group
    body.setVelocity(velocityX, velocityY);

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

  private spawnGuardBullet(guardX: number, guardY: number, targetX: number, targetY: number) {
    // Convert tile coordinates to pixel coordinates
    const startX = guardX * GAME_CONFIG.TILE_SIZE;
    const startY = guardY * GAME_CONFIG.TILE_SIZE;
    const endX = targetX * GAME_CONFIG.TILE_SIZE;
    const endY = targetY * GAME_CONFIG.TILE_SIZE;

    // Calculate direction from guard to target
    const dx = endX - startX;
    const dy = endY - startY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance === 0) return; // Guard and target at same position, don't shoot

    // Create bullet sprite
    const bullet = this.physics.add.sprite(startX, startY, "bullet");
    bullet.setDepth(15);
    bullet.setScale(1.5);
    bullet.setTint(0xff0000); // Red color for guard bullets

    // Set up physics body
    const body = bullet.body as Phaser.Physics.Arcade.Body;
    if (body) {
      body.setCircle(20);
      body.setAllowGravity(false);
      body.setDrag(0);
    }

    // Calculate velocity
    const bulletSpeed = 800; // Slightly slower than player bullets
    const velocityX = (dx / distance) * bulletSpeed;
    const velocityY = (dy / distance) * bulletSpeed;

    body.setVelocity(velocityX, velocityY);

    // Add collision with player
    this.physics.add.overlap(
      bullet,
      this.player,
      () => {
        bullet.destroy();
        // Trigger game over when hit
        this.showGameOverScreen();
      },
      undefined,
      this
    );

    // Auto-destroy bullet after 5 seconds
    this.time.delayedCall(5000, () => {
      if (bullet && bullet.active) {
        bullet.destroy();
      }
    });
  }

  update(time: number, delta: number) {
    if (!this.player) return;

    // Lerp other players' positions for smooth movement
    this.lerpOtherPlayers();

    // Lerp guards' positions for smooth movement
    this.lerpGuards();

    // Update minimap
    this.updateMinimap();

    // Update shoot cooldown
    if (this.shootCooldown > 0) {
      this.shootCooldown -= delta;
    }

    // Handle shooting
    if (Phaser.Input.Keyboard.JustDown(this.spaceKey) && !this.consoleVisible && !this.isGameOver) {
      this.shoot();
    }

    // Update bullets - remove if off screen (physics handles movement)
    this.bullets.children.entries.forEach((bullet) => {
      const b = bullet as Phaser.Physics.Arcade.Sprite;
      if (b.active) {
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

    // Skip player input if console is visible or game is over
    if (!this.consoleVisible && !this.isGameOver) {
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

      // Send position to server (throttled and only if changed)
      if (this.colyseusClient && this.colyseusClient.room) {
        if (time - this.lastUpdateTime > this.updateThrottle) {
          // Convert pixel position to tile position for server
          const tileX = this.player.x / GAME_CONFIG.TILE_SIZE;
          const tileY = this.player.y / GAME_CONFIG.TILE_SIZE;

          // Only send if position or angle has changed significantly
          const posChanged =
            Math.abs(tileX - this.lastSentPosition.x) > 0.1 ||
            Math.abs(tileY - this.lastSentPosition.y) > 0.1;
          const angleChanged =
            Math.abs(this.currentAngle - this.lastSentPosition.angle) > 1;

          if (
            posChanged ||
            angleChanged ||
            isMoving !== this.player.anims?.isPlaying
          ) {
            this.colyseusClient.sendMove(
              tileX,
              tileY,
              this.currentAngle,
              isMoving
            );
            this.lastSentPosition = {
              x: tileX,
              y: tileY,
              angle: this.currentAngle,
            };
            this.lastUpdateTime = time;
          }
        }
      }
    }

    // Update player velocity (physics handles collision)
    this.player.setVelocity(velocityX * 60, velocityY * 60);
  }
}
