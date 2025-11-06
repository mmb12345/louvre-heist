import { Room, Client } from '@colyseus/core';
import { GameState, Player, Guard, Objective, Room as RoomSchema, Crown, PostIt, ExitDoor } from '@louvre-heist/shared';
import {
  GAME_CONFIG,
  OBJECTIVES,
  ROOM_TYPES,
  type PlayerInput,
  type PatrolPattern
} from '@louvre-heist/shared';

export class GameRoom extends Room<GameState> {
  private gameLoop!: NodeJS.Timeout;
  private guardUpdateInterval!: NodeJS.Timeout;
  private guardPatrolPatterns: Map<string, PatrolPattern> = new Map();

  onCreate(options: any) {
    this.setState(new GameState());
    this.state.timeRemaining = GAME_CONFIG.GAME_DURATION;

    this.generateMap();
    this.setupMessageHandlers();
    this.initializeObjectives();
    this.initializeGuards();
    this.initializeCrown();
    this.initializePostIt();
    this.initializeExitDoor();

    // Start guard movement immediately
    this.guardUpdateInterval = setInterval(() => {
      this.updateGuards();
    }, 500);
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

      // Check for crown pickup
      this.checkCrownPickup(player);

      // Check for post-it pickup
      this.checkPostItPickup(player);

      // Check for security room interaction (to unlock exit)
      this.checkSecurityRoomInteraction(player);
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

    this.onMessage('guard_killed', (client, data: { guardId: string }) => {
      const { guardId } = data;

      // Check if guard exists
      if (this.state.guards.has(guardId)) {
        console.log(`Guard ${guardId} was killed by player ${client.sessionId}`);

        // Remove guard from state
        this.state.guards.delete(guardId);
        this.guardPatrolPatterns.delete(guardId);

        console.log(`Guard ${guardId} removed. Remaining guards: ${this.state.guards.size}`);
      }
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

        // Clear existing guards and their patrol patterns
        this.state.guards.clear();
        this.guardPatrolPatterns.clear();
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

  private getRoomCenter(gridX: number, gridY: number): { x: number; y: number } {
    return {
      x: gridX * GAME_CONFIG.ROOM_SIZE + GAME_CONFIG.ROOM_SIZE / 2,
      y: gridY * GAME_CONFIG.ROOM_SIZE + GAME_CONFIG.ROOM_SIZE / 2,
    };
  }

  private generateRoomPatrolPattern(roomGridX: number, roomGridY: number, patternType: number): PatrolPattern {
    // Generate patrol patterns that span 3-4 nearby rooms
    const numRooms = 3 + Math.floor(Math.random() * 2); // 3 or 4 rooms
    const visitedRooms: { x: number; y: number }[] = [];
    const pattern: PatrolPattern = [];

    // Start with the spawn room
    let currentX = roomGridX;
    let currentY = roomGridY;
    visitedRooms.push({ x: currentX, y: currentY });

    // Build a path through nearby rooms
    for (let i = 0; i < numRooms - 1; i++) {
      // Get possible adjacent rooms (up, down, left, right)
      const possibleMoves: { x: number; y: number }[] = [];

      // Check all four directions
      if (currentX > 0) possibleMoves.push({ x: currentX - 1, y: currentY }); // Left
      if (currentX < GAME_CONFIG.ROOMS_GRID - 1) possibleMoves.push({ x: currentX + 1, y: currentY }); // Right
      if (currentY > 0) possibleMoves.push({ x: currentX, y: currentY - 1 }); // Up
      if (currentY < GAME_CONFIG.ROOMS_GRID - 1) possibleMoves.push({ x: currentX, y: currentY + 1 }); // Down

      // Filter out already visited rooms (unless we're on the last room, then we can return to start)
      const availableMoves = possibleMoves.filter(move =>
        !visitedRooms.some(visited => visited.x === move.x && visited.y === move.y)
      );

      // If no unvisited rooms available, use any adjacent room
      const moves = availableMoves.length > 0 ? availableMoves : possibleMoves;

      if (moves.length > 0) {
        // Pick a random adjacent room
        const nextRoom = moves[Math.floor(Math.random() * moves.length)];
        currentX = nextRoom.x;
        currentY = nextRoom.y;
        visitedRooms.push({ x: currentX, y: currentY });
      }
    }

    // Create waypoints at the center of each visited room
    visitedRooms.forEach(room => {
      pattern.push(this.getRoomCenter(room.x, room.y));
    });

    // Add a return path to the first room to complete the loop
    if (visitedRooms.length > 1) {
      pattern.push(this.getRoomCenter(visitedRooms[0].x, visitedRooms[0].y));
    }

    return pattern;
  }

  private initializeGuards() {
    // Get all rooms
    const allRooms = Array.from(this.state.rooms.values());

    let totalGuards = 0;
    let guardIndex = 0;
    let roomsWithGuards = 0;

    // For each room, spawn 1-4 guards
    allRooms.forEach(room => {
      // 2 in 3 chance (66.67%) that this room has no guards
      if (Math.random() < 2/3) {
        return; // Skip this room
      }

      roomsWithGuards++;

      // Randomly decide how many guards to spawn in this room (1-4)
      const numGuardsInRoom = Math.floor(Math.random() * 4) + 1;

      // Spawn guards at random positions within this room
      for (let i = 0; i < numGuardsInRoom; i++) {
        const guard = new Guard();
        guard.id = `guard_${guardIndex}`;

        // Assign random speed (0.8 to 2.5, with average around 1.5)
        guard.speed = 0.8 + Math.random() * 1.7;

        // Generate a room-relative patrol pattern
        const patternType = guardIndex % 4; // 4 different pattern types
        const customPattern = this.generateRoomPatrolPattern(room.gridX, room.gridY, patternType);
        this.guardPatrolPatterns.set(guard.id, customPattern);

        guard.patrolPattern = patternType; // Store pattern type for reference

        // Spawn guard at first patrol point
        guard.x = customPattern[0].x;
        guard.y = customPattern[0].y;
        guard.patrolIndex = 0;

        this.state.guards.set(guard.id, guard);
        guardIndex++;
        totalGuards++;
      }
    });

    console.log(`Spawned ${totalGuards} guards in ${roomsWithGuards} of ${allRooms.length} rooms (${(totalGuards / roomsWithGuards).toFixed(1)} guards per occupied room on average)`);
  }

  private initializeCrown() {
    // Find the crown room
    const crownRoom = Array.from(this.state.rooms.values()).find(
      room => room.roomType === ROOM_TYPES.CROWN_ROOM
    );

    if (!crownRoom) {
      console.error('Crown room not found!');
      return;
    }

    // Calculate random position within the crown room
    // Room is ROOM_SIZE x ROOM_SIZE tiles, place crown randomly within it
    const roomCenterX = crownRoom.gridX * GAME_CONFIG.ROOM_SIZE + GAME_CONFIG.ROOM_SIZE / 2;
    const roomCenterY = crownRoom.gridY * GAME_CONFIG.ROOM_SIZE + GAME_CONFIG.ROOM_SIZE / 2;

    // Add some randomness within the room (±2 tiles from center)
    const randomOffsetX = (Math.random() - 0.5) * 4;
    const randomOffsetY = (Math.random() - 0.5) * 4;

    const crown = new Crown();
    crown.x = roomCenterX + randomOffsetX;
    crown.y = roomCenterY + randomOffsetY;
    crown.pickedUp = false;
    crown.ownerId = '';

    this.state.crown = crown;

    console.log(`Crown spawned at (${crown.x.toFixed(2)}, ${crown.y.toFixed(2)}) in room (${crownRoom.gridX}, ${crownRoom.gridY})`);
  }

  private initializePostIt() {
    // Find all guard rooms
    const guardRooms = Array.from(this.state.rooms.values()).filter(
      room => room.roomType === ROOM_TYPES.GUARD_ROOM
    );

    if (guardRooms.length === 0) {
      console.error('No guard rooms found!');
      return;
    }

    // Pick a random guard room
    const randomGuardRoom = guardRooms[Math.floor(Math.random() * guardRooms.length)];

    // Calculate random position within the guard room
    const roomCenterX = randomGuardRoom.gridX * GAME_CONFIG.ROOM_SIZE + GAME_CONFIG.ROOM_SIZE / 2;
    const roomCenterY = randomGuardRoom.gridY * GAME_CONFIG.ROOM_SIZE + GAME_CONFIG.ROOM_SIZE / 2;

    // Add some randomness within the room (±2 tiles from center)
    const randomOffsetX = (Math.random() - 0.5) * 4;
    const randomOffsetY = (Math.random() - 0.5) * 4;

    const postit = new PostIt();
    postit.x = roomCenterX + randomOffsetX;
    postit.y = roomCenterY + randomOffsetY;
    postit.pickedUp = false;
    postit.password = 'Louvre';

    this.state.postit = postit;

    console.log(`Post-it spawned at (${postit.x.toFixed(2)}, ${postit.y.toFixed(2)}) in guard room (${randomGuardRoom.gridX}, ${randomGuardRoom.gridY})`);
  }

  private initializeExitDoor() {
    // Place exit door on a random outside wall
    const exitDoor = new ExitDoor();

    // Choose a random wall: 0=top, 1=right, 2=bottom, 3=left
    const wall = Math.floor(Math.random() * 4);
    const mapSize = GAME_CONFIG.MAP_WIDTH;

    switch (wall) {
      case 0: // Top wall
        exitDoor.x = Math.floor(Math.random() * mapSize);
        exitDoor.y = 0;
        break;
      case 1: // Right wall
        exitDoor.x = mapSize - 1;
        exitDoor.y = Math.floor(Math.random() * mapSize);
        break;
      case 2: // Bottom wall
        exitDoor.x = Math.floor(Math.random() * mapSize);
        exitDoor.y = mapSize - 1;
        break;
      case 3: // Left wall
        exitDoor.x = 0;
        exitDoor.y = Math.floor(Math.random() * mapSize);
        break;
    }

    exitDoor.unlocked = false;
    this.state.exitDoor = exitDoor;

    console.log(`Exit door spawned at (${exitDoor.x}, ${exitDoor.y})`);
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
      // Get the custom patrol pattern for this guard
      const pattern = this.guardPatrolPatterns.get(guard.id);
      if (!pattern || pattern.length === 0) return;

      const targetPoint = pattern[guard.patrolIndex];

      // Move guard towards target
      const dx = targetPoint.x - guard.x;
      const dy = targetPoint.y - guard.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Use a larger threshold to ensure guards don't overshoot and get stuck
      // Threshold should be larger than guard speed to reliably detect arrival
      if (distance < guard.speed * 2) {
        // Reached patrol point, move to next
        guard.patrolIndex = (guard.patrolIndex + 1) % pattern.length;

        // Get the new target and start moving towards it immediately
        const newTarget = pattern[guard.patrolIndex];
        const newDx = newTarget.x - guard.x;
        const newDy = newTarget.y - guard.y;
        const newDistance = Math.sqrt(newDx * newDx + newDy * newDy);

        if (newDistance > guard.speed) {
          guard.x += (newDx / newDistance) * guard.speed;
          guard.y += (newDy / newDistance) * guard.speed;
        }
      } else {
        // Move towards target
        guard.x += (dx / distance) * guard.speed;
        guard.y += (dy / distance) * guard.speed;
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

  private checkCrownPickup(player: Player) {
    // Check if crown exists and hasn't been picked up
    if (!this.state.crown || this.state.crown.pickedUp) return;

    // Check distance to crown
    const distance = Math.sqrt(
      Math.pow(player.x - this.state.crown.x, 2) +
      Math.pow(player.y - this.state.crown.y, 2)
    );

    // If player is close enough to crown (within 5 tiles), pick it up
    if (distance < 5) {
      this.state.crown.pickedUp = true;
      this.state.crown.ownerId = player.id;

      console.log(`Player ${player.name} picked up the crown!`);
      this.broadcast('crown_picked_up', { playerId: player.id, playerName: player.name });
    }
  }

  private checkPostItPickup(player: Player) {
    // Check if post-it exists and hasn't been picked up
    if (!this.state.postit || this.state.postit.pickedUp) return;

    // Check distance to post-it
    const distance = Math.sqrt(
      Math.pow(player.x - this.state.postit.x, 2) +
      Math.pow(player.y - this.state.postit.y, 2)
    );

    // If player is close enough to post-it (within 5 tiles), pick it up
    if (distance < 5) {
      this.state.postit.pickedUp = true;

      console.log(`Player ${player.name} picked up the post-it with password!`);
      // Broadcast to all players so everyone can see the password
      this.broadcast('postit_picked_up', {
        playerId: player.id,
        playerName: player.name,
        password: this.state.postit.password
      });
    }
  }

  private checkSecurityRoomInteraction(player: Player) {
    // Check if password has been picked up
    if (!this.state.postit || !this.state.postit.pickedUp) return;

    // Find the security room
    const securityRoom = Array.from(this.state.rooms.values()).find(
      room => room.roomType === ROOM_TYPES.SECURITY_ROOM
    );

    if (!securityRoom) return;

    // Calculate the center of the security room (where the control room computer is)
    const roomCenterX = securityRoom.gridX * GAME_CONFIG.ROOM_SIZE + GAME_CONFIG.ROOM_SIZE / 2;
    const roomCenterY = securityRoom.gridY * GAME_CONFIG.ROOM_SIZE + GAME_CONFIG.ROOM_SIZE / 2;

    // Check distance to control room computer
    const distance = Math.sqrt(
      Math.pow(player.x - roomCenterX, 2) +
      Math.pow(player.y - roomCenterY, 2)
    );

    // If player is close enough to the computer (within 5 tiles)
    if (distance < 5) {
      // Get the destroy footage objective
      const destroyFootageObjective = this.state.objectives.get('security');

      // Complete the destroy footage objective if not already completed
      if (destroyFootageObjective && !destroyFootageObjective.completed) {
        destroyFootageObjective.completed = true;
        console.log(`Player ${player.name} destroyed the security footage!`);
        this.broadcast('objective_completed', { type: OBJECTIVES.DESTROY_FOOTAGE });
      }

      // Unlock the exit door if not already unlocked
      if (this.state.exitDoor && !this.state.exitDoor.unlocked) {
        this.state.exitDoor.unlocked = true;
        console.log(`Player ${player.name} unlocked the exit door!`);
        this.broadcast('exit_unlocked', {
          playerId: player.id,
          playerName: player.name
        });
      }
    }
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

    // Check if the leaving player has the crown
    const player = this.state.players.get(client.sessionId);
    if (player && this.state.crown && this.state.crown.ownerId === client.sessionId) {
      // Drop the crown at the player's last position
      this.state.crown.x = player.x;
      this.state.crown.y = player.y;
      this.state.crown.pickedUp = false;
      this.state.crown.ownerId = '';
      console.log(`Crown dropped at (${player.x}, ${player.y}) due to player disconnect`);
    }

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
