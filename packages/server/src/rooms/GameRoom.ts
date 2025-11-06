import { Room, Client } from '@colyseus/core';
import { GameState, Player, Guard, Objective, Room as RoomSchema } from '@louvre-heist/shared';
import {
  GAME_CONFIG,
  OBJECTIVES,
  ROOM_TYPES,
  PATROL_PATTERNS,
  type PlayerInput,
  type PatrolPattern
} from '@louvre-heist/shared';

export class GameRoom extends Room<GameState> {
  private gameLoop!: NodeJS.Timeout;
  private guardUpdateInterval!: NodeJS.Timeout;

  onCreate(options: any) {
    this.setState(new GameState());
    this.state.timeRemaining = GAME_CONFIG.GAME_DURATION;

    this.generateMap();
    this.setupMessageHandlers();
    this.initializeObjectives();
    this.initializeGuards();
  }

  private generateMap() {
    const gridSize = GAME_CONFIG.ROOMS_GRID; // 10x10 grid
    const usedPositions = new Set<string>();

    // Helper function to get random position
    const getRandomPosition = (minX: number = 0, maxX: number = gridSize - 1, minY: number = 0, maxY: number = gridSize - 1): { x: number; y: number } => {
      let x: number, y: number, key: string;
      let attempts = 0;
      do {
        x = Math.floor(Math.random() * (maxX - minX + 1)) + minX;
        y = Math.floor(Math.random() * (maxY - minY + 1)) + minY;
        key = `${x},${y}`;
        attempts++;
      } while (usedPositions.has(key) && attempts < 100);

      usedPositions.add(key);
      return { x, y };
    };

    // Randomly generate special room locations
    const specialRooms = [];

    // 4 Guard rooms (spread in corners/edges)
    specialRooms.push({ ...getRandomPosition(0, 3, 0, 3), type: ROOM_TYPES.GUARD_ROOM }); // Top-left quadrant
    specialRooms.push({ ...getRandomPosition(6, 9, 0, 3), type: ROOM_TYPES.GUARD_ROOM }); // Top-right quadrant
    specialRooms.push({ ...getRandomPosition(0, 3, 6, 9), type: ROOM_TYPES.GUARD_ROOM }); // Bottom-left quadrant
    specialRooms.push({ ...getRandomPosition(6, 9, 6, 9), type: ROOM_TYPES.GUARD_ROOM }); // Bottom-right quadrant

    // 1 Security room (avoid edges)
    specialRooms.push({ ...getRandomPosition(1, 8, 1, 8), type: ROOM_TYPES.SECURITY_ROOM });

    // 1 Crown room (avoid edges)
    specialRooms.push({ ...getRandomPosition(1, 8, 1, 8), type: ROOM_TYPES.CROWN_ROOM });

    // 2 Loot rooms (anywhere except edges)
    specialRooms.push({ ...getRandomPosition(1, 8, 1, 8), type: ROOM_TYPES.LOOT_ROOM });
    specialRooms.push({ ...getRandomPosition(1, 8, 1, 8), type: ROOM_TYPES.LOOT_ROOM });

    // 1 Exit (prefer center area for balance)
    specialRooms.push({ ...getRandomPosition(3, 6, 3, 6), type: ROOM_TYPES.EXIT });

    // Create a map of special room locations for quick lookup
    const specialRoomMap = new Map<string, string>();
    specialRooms.forEach(room => {
      specialRoomMap.set(`${room.x},${room.y}`, room.type);
    });

    // Generate all rooms in the grid
    for (let gridY = 0; gridY < gridSize; gridY++) {
      for (let gridX = 0; gridX < gridSize; gridX++) {
        const room = new RoomSchema();
        room.gridX = gridX;
        room.gridY = gridY;

        // Check if this is a special room
        const key = `${gridX},${gridY}`;
        room.roomType = specialRoomMap.get(key) || ROOM_TYPES.HALLWAY;

        this.state.rooms.set(key, room);
      }
    }

    console.log(`Generated ${this.state.rooms.size} rooms with ${specialRooms.length} special rooms`);
  }

  private setupMessageHandlers() {
    this.onMessage('move', (client, input: any) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || player.caught || this.state.gameOver) return;

      // Update player position (input now contains x, y directly from client)
      if (input.x !== undefined && input.y !== undefined) {
        player.x = input.x;
        player.y = input.y;
      }

      // Update player angle and movement state
      if (input.angle !== undefined) {
        player.angle = input.angle;
      }
      if (input.isMoving !== undefined) {
        player.isMoving = input.isMoving;
      }

      // Check for objective interactions
      this.checkObjectiveInteraction(player);
    });

    this.onMessage('interact', (client) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || player.caught || this.state.gameOver) return;

      // Check if player is near an objective
      this.state.objectives.forEach((objective) => {
        const distance = Math.sqrt(
          Math.pow(player.x - objective.x, 2) + Math.pow(player.y - objective.y, 2)
        );

        if (distance < 2) {
          if (objective.type === OBJECTIVES.DESTROY_FOOTAGE) {
            objective.completed = true;
            this.broadcast('objective_completed', { type: objective.type });
          } else if (objective.type === OBJECTIVES.FIND_CROWN) {
            objective.completed = true;
            this.broadcast('objective_completed', { type: objective.type });
          } else if (objective.type === OBJECTIVES.FIND_PASSWORD) {
            player.hasPassword = true;
            objective.completed = true;
            this.broadcast('objective_completed', { type: objective.type });
          } else if (objective.type === OBJECTIVES.FIND_EXIT) {
            // Can only exit if all objectives are complete and player has password
            if (this.checkAllObjectivesComplete() && player.hasPassword) {
              objective.completed = true;
              this.broadcast('objective_completed', { type: objective.type });
              this.checkWinCondition();
            }
          }
        }
      });
    });

    this.onMessage('console_command', (client, data: { command: string; args: string[] }) => {
      this.handleConsoleCommand(client, data.command, data.args);
    });
  }

  private handleConsoleCommand(client: Client, command: string, args: string[]) {
    const sendResponse = (output: string) => {
      client.send('console_response', { output });
    };

    const player = this.state.players.get(client.sessionId);
    if (!player) {
      sendResponse('Error: Player not found');
      return;
    }

    switch (command) {
      case 'teleport':
        if (args.length < 2) {
          sendResponse('Usage: teleport <x> <y>');
          return;
        }
        const x = parseFloat(args[0]);
        const y = parseFloat(args[1]);
        if (isNaN(x) || isNaN(y)) {
          sendResponse('Error: Invalid coordinates');
          return;
        }
        player.x = x;
        player.y = y;
        sendResponse(`Teleported to (${x}, ${y})`);
        break;

      case 'players':
        const playerList = Array.from(this.state.players.values())
          .map(p => `${p.name} (${p.color}) - (${p.x.toFixed(1)}, ${p.y.toFixed(1)})`)
          .join('\n');
        sendResponse(`Players:\n${playerList}`);
        break;

      case 'rooms':
        const specialRooms = Array.from(this.state.rooms.values())
          .filter(r => r.roomType !== ROOM_TYPES.HALLWAY);
        const roomList = specialRooms
          .map(r => `${r.roomType} at (${r.gridX}, ${r.gridY})`)
          .join('\n');
        sendResponse(`Special Rooms:\n${roomList}`);
        break;

      case 'guards':
        const guardList = Array.from(this.state.guards.values())
          .map(g => `${g.id} at (${g.x.toFixed(1)}, ${g.y.toFixed(1)})`)
          .join('\n');
        if (guardList) {
          sendResponse(`Guards:\n${guardList}`);
        } else {
          sendResponse('No guards on the map');
        }
        break;

      case 'speed':
        if (args.length < 1) {
          sendResponse('Usage: speed <value>');
          return;
        }
        const speed = parseFloat(args[0]);
        if (isNaN(speed)) {
          sendResponse('Error: Invalid speed value');
          return;
        }
        // Note: Speed is controlled client-side, this just confirms
        sendResponse(`Note: Speed is controlled client-side. Current request: ${speed}`);
        break;

      case 'godmode':
        player.caught = false;
        sendResponse('God mode activated - you cannot be caught');
        break;

      case 'objective':
        if (args.length < 1) {
          const objList = Array.from(this.state.objectives.values())
            .map(o => `${o.type}: ${o.completed ? 'DONE' : 'PENDING'} at (${o.x}, ${o.y})`)
            .join('\n');
          sendResponse(`Objectives:\n${objList}`);
        } else {
          const objType = args[0];
          const objective = Array.from(this.state.objectives.values())
            .find(o => o.type === objType);
          if (objective) {
            objective.completed = true;
            sendResponse(`Completed objective: ${objType}`);
            this.broadcast('objective_completed', { type: objType });
          } else {
            sendResponse(`Error: Unknown objective "${objType}"`);
          }
        }
        break;

      case 'time':
        if (args.length < 1) {
          sendResponse(`Time remaining: ${this.state.timeRemaining} seconds`);
        } else {
          const newTime = parseInt(args[0]);
          if (isNaN(newTime)) {
            sendResponse('Error: Invalid time value');
            return;
          }
          this.state.timeRemaining = newTime;
          sendResponse(`Time set to ${newTime} seconds`);
        }
        break;

      case 'reset':
        // Clear existing rooms
        this.state.rooms.clear();

        // Regenerate map
        this.generateMap();

        // Clear existing guards and respawn them
        this.state.guards.clear();
        this.initializeGuards();

        // Reset all player positions to starting location (bottom middle room)
        const startRoomX = 4; // Middle room (0-9 grid)
        const startRoomY = 9; // Bottom row
        const startX = startRoomX * GAME_CONFIG.ROOM_SIZE + GAME_CONFIG.ROOM_SIZE / 2;
        const startY = startRoomY * GAME_CONFIG.ROOM_SIZE + GAME_CONFIG.ROOM_SIZE * 0.75;

        this.state.players.forEach(p => {
          p.x = startX;
          p.y = startY;
        });

        // Broadcast position reset to all clients so they update their physics bodies
        this.broadcast('reset_position', { x: startX, y: startY });

        sendResponse('Map regenerated and player positions reset');
        this.broadcast('console_response', { output: 'Map has been regenerated with new guards!' });
        break;

      default:
        sendResponse(`Unknown command: ${command}`);
        sendResponse('Try "help" in the client console for available commands');
        break;
    }
  }

  private initializeObjectives() {
    // Security room - destroy footage
    const securityRoom = new Objective();
    securityRoom.id = 'security';
    securityRoom.type = OBJECTIVES.DESTROY_FOOTAGE;
    securityRoom.x = 10;
    securityRoom.y = 10;
    this.state.objectives.set('security', securityRoom);

    // Crown room
    const crownRoom = new Objective();
    crownRoom.id = 'crown';
    crownRoom.type = OBJECTIVES.FIND_CROWN;
    crownRoom.x = 40;
    crownRoom.y = 10;
    this.state.objectives.set('crown', crownRoom);

    // Password location
    const passwordRoom = new Objective();
    passwordRoom.id = 'password';
    passwordRoom.type = OBJECTIVES.FIND_PASSWORD;
    passwordRoom.x = 10;
    passwordRoom.y = 40;
    this.state.objectives.set('password', passwordRoom);

    // Exit
    const exit = new Objective();
    exit.id = 'exit';
    exit.type = OBJECTIVES.FIND_EXIT;
    exit.x = 40;
    exit.y = 40;
    this.state.objectives.set('exit', exit);
  }

  private initializeGuards() {
    // Find all guard rooms
    const guardRooms = Array.from(this.state.rooms.values()).filter(
      (room) => room.roomType === ROOM_TYPES.GUARD_ROOM
    );

    // Randomly decide how many guards to spawn (1-4)
    const numGuards = Math.floor(Math.random() * 4) + 1;
    console.log(`Spawning ${numGuards} guards in ${guardRooms.length} guard rooms`);

    // Spawn guards in random guard rooms
    for (let i = 0; i < numGuards && i < guardRooms.length; i++) {
      const room = guardRooms[i];
      const guard = new Guard();
      guard.id = `guard_${i}`;
      guard.patrolPattern = i % PATROL_PATTERNS.length; // Cycle through available patterns

      // Spawn guard in center of the guard room (in tile coordinates)
      guard.x = room.gridX * GAME_CONFIG.ROOM_SIZE + GAME_CONFIG.ROOM_SIZE / 2;
      guard.y = room.gridY * GAME_CONFIG.ROOM_SIZE + GAME_CONFIG.ROOM_SIZE / 2;
      guard.patrolIndex = 0;

      this.state.guards.set(guard.id, guard);
      console.log(`Guard ${guard.id} spawned at room (${room.gridX}, ${room.gridY}), position (${guard.x}, ${guard.y})`);
    }
  }

  onJoin(client: Client, options: any) {
    console.log(`${client.sessionId} joined`);

    const player = new Player();
    player.id = client.sessionId;
    player.name = options.name || `Player ${this.state.players.size + 1}`;
    player.color = options.color || 'pink'; // Default to pink if no color provided

    // Spawn players at center (they'll be at their actual client positions)
    const centerX = GAME_CONFIG.MAP_WIDTH / 2;
    const centerY = GAME_CONFIG.MAP_HEIGHT / 2;
    player.x = centerX;
    player.y = centerY;
    player.angle = 0;
    player.isMoving = false;

    this.state.players.set(client.sessionId, player);

    console.log(`Player ${player.name} joined with color ${player.color}`);
  }

  private startGame() {
    this.state.gameStarted = true;
    this.broadcast('game_started');

    // Main game loop - update timer
    this.gameLoop = setInterval(() => {
      if (this.state.timeRemaining > 0 && !this.state.gameOver) {
        this.state.timeRemaining -= 1;

        if (this.state.timeRemaining <= 0) {
          this.endGame(false);
        }
      }
    }, 1000);

    // Guard movement loop
    this.guardUpdateInterval = setInterval(() => {
      this.updateGuards();
    }, 500);
  }

  private updateGuards() {
    if (this.state.gameOver) return;

    this.state.guards.forEach((guard) => {
      const pattern = PATROL_PATTERNS[guard.patrolPattern];
      const targetPoint = pattern[guard.patrolIndex];

      // Move guard towards target
      const dx = targetPoint.x - guard.x;
      const dy = targetPoint.y - guard.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < 0.5) {
        // Reached patrol point, move to next
        guard.patrolIndex = (guard.patrolIndex + 1) % pattern.length;
      } else {
        // Move towards target
        guard.x += (dx / distance) * GAME_CONFIG.GUARD_SPEED;
        guard.y += (dy / distance) * GAME_CONFIG.GUARD_SPEED;
      }

      // Check if guard caught any player
      this.state.players.forEach((player) => {
        if (player.caught) return;

        const distToPlayer = Math.sqrt(
          Math.pow(guard.x - player.x, 2) + Math.pow(guard.y - player.y, 2)
        );

        if (distToPlayer < GAME_CONFIG.GUARD_CATCH_RANGE) {
          player.caught = true;
          this.broadcast('player_caught', { playerId: player.id, playerName: player.name });

          // Check if all players are caught
          const allCaught = Array.from(this.state.players.values()).every(p => p.caught);
          if (allCaught) {
            this.endGame(false);
          }
        }
      });
    });
  }

  private checkObjectiveInteraction(player: Player) {
    this.state.objectives.forEach((objective) => {
      if (objective.completed) return;

      const distance = Math.sqrt(
        Math.pow(player.x - objective.x, 2) + Math.pow(player.y - objective.y, 2)
      );

      // Notify player when near objective
      if (distance < 3) {
        // Player is near, they can interact
      }
    });
  }

  private checkAllObjectivesComplete(): boolean {
    const required = [OBJECTIVES.DESTROY_FOOTAGE, OBJECTIVES.FIND_CROWN, OBJECTIVES.FIND_PASSWORD];
    return required.every(type => {
      return Array.from(this.state.objectives.values()).some(
        obj => obj.type === type && obj.completed
      );
    });
  }

  private checkWinCondition() {
    // Check if exit objective is complete
    const exitObjective = this.state.objectives.get('exit');
    if (exitObjective && exitObjective.completed) {
      this.endGame(true);
    }
  }

  private endGame(victory: boolean) {
    this.state.gameOver = true;
    this.state.victory = victory;

    if (this.gameLoop) clearInterval(this.gameLoop);
    if (this.guardUpdateInterval) clearInterval(this.guardUpdateInterval);

    this.broadcast('game_over', { victory });

    // Auto-disconnect after 10 seconds
    setTimeout(() => {
      this.disconnect();
    }, 10000);
  }

  onLeave(client: Client, consented: boolean) {
    console.log(`${client.sessionId} left`);
    this.state.players.delete(client.sessionId);

    // If not enough players, end game
    if (this.state.gameStarted && this.state.players.size < 2) {
      this.endGame(false);
    }
  }

  onDispose() {
    if (this.gameLoop) clearInterval(this.gameLoop);
    if (this.guardUpdateInterval) clearInterval(this.guardUpdateInterval);
    console.log('Room disposed');
  }
}
