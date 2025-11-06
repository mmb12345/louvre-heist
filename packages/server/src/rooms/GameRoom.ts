import { Room, Client } from '@colyseus/core';
import { GameState, Player, Guard, Objective } from '@louvre-heist/shared';
import {
  GAME_CONFIG,
  OBJECTIVES,
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

    this.setupMessageHandlers();
    this.initializeObjectives();
    this.initializeGuards();
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
    // Create 4 guards with different patrol patterns
    for (let i = 0; i < 4; i++) {
      const guard = new Guard();
      guard.id = `guard_${i}`;
      guard.patrolPattern = i;

      const pattern = PATROL_PATTERNS[i];
      guard.x = pattern[0].x;
      guard.y = pattern[0].y;
      guard.patrolIndex = 0;

      this.state.guards.set(guard.id, guard);
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
