import Phaser from 'phaser';
import { ColyseusClient } from '../network/ColyseusClient';
import { GameState, Player, Guard, Objective } from '@louvre-heist/shared';
import { GAME_CONFIG, OBJECTIVES } from '@louvre-heist/shared';

export class GameScene extends Phaser.Scene {
  private network!: ColyseusClient;
  private playerSprites: Map<string, Phaser.GameObjects.Sprite> = new Map();
  private guardSprites: Map<string, Phaser.GameObjects.Sprite> = new Map();
  private objectiveSprites: Map<string, Phaser.GameObjects.Sprite> = new Map();
  private currentPlayerId: string = '';
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private lastMoveTime: number = 0;
  private moveDelay: number = 100; // ms between moves

  // UI elements
  private timerText!: Phaser.GameObjects.Text;
  private objectivesText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'GameScene' });
  }

  init(data: { playerName: string; roomId: string }) {
    this.network = new ColyseusClient();
    this.currentPlayerId = '';
  }

  async create(data: { playerName: string; roomId: string }) {
    // Create background grid
    this.createBackground();

    // Setup keyboard input
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.input.keyboard!.on('keydown-SPACE', () => {
      this.network.sendInteract();
    });

    // Create UI
    this.createUI();

    // Connect to server
    try {
      const room = await this.network.joinOrCreate(data.roomId, data.playerName);
      this.currentPlayerId = room.sessionId;

      this.setupNetworkListeners(room);

      this.statusText.setText('Waiting for players...');
    } catch (e) {
      console.error('Failed to join:', e);
      this.statusText.setText('Failed to connect to server!');
    }
  }

  private createBackground() {
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

  private createUI() {
    const uiY = GAME_CONFIG.MAP_HEIGHT * GAME_CONFIG.TILE_SIZE + 10;

    this.timerText = this.add.text(10, uiY, 'Time: 5:00', {
      fontSize: '24px',
      color: '#ffffff',
      fontFamily: 'Courier New',
    });

    this.objectivesText = this.add.text(300, uiY, 'Objectives: 0/3', {
      fontSize: '20px',
      color: '#ffffff',
      fontFamily: 'Courier New',
    });

    this.statusText = this.add.text(600, uiY, '', {
      fontSize: '20px',
      color: '#ffff00',
      fontFamily: 'Courier New',
    });

    const controlsText = this.add.text(10, uiY + 30, 'Arrow Keys: Move | SPACE: Interact', {
      fontSize: '16px',
      color: '#888888',
      fontFamily: 'Courier New',
    });
  }

  private setupNetworkListeners(room: any) {
    // Listen for state changes
    room.state.players.onAdd((player: Player, sessionId: string) => {
      const sprite = this.add.sprite(
        player.x * GAME_CONFIG.TILE_SIZE + GAME_CONFIG.TILE_SIZE / 2,
        player.y * GAME_CONFIG.TILE_SIZE + GAME_CONFIG.TILE_SIZE / 2,
        'player'
      );

      // Highlight current player
      if (sessionId === this.currentPlayerId) {
        sprite.setTint(0x00ffff);
      }

      // Add player name label
      const nameText = this.add.text(sprite.x, sprite.y - 25, player.name, {
        fontSize: '12px',
        color: '#ffffff',
        backgroundColor: '#000000',
        padding: { x: 4, y: 2 },
      });
      nameText.setOrigin(0.5);

      this.playerSprites.set(sessionId, sprite);

      // Listen for position changes
      player.onChange(() => {
        sprite.setPosition(
          player.x * GAME_CONFIG.TILE_SIZE + GAME_CONFIG.TILE_SIZE / 2,
          player.y * GAME_CONFIG.TILE_SIZE + GAME_CONFIG.TILE_SIZE / 2
        );
        nameText.setPosition(sprite.x, sprite.y - 25);

        // Visual feedback if caught
        if (player.caught) {
          sprite.setAlpha(0.3);
          sprite.setTint(0xff0000);
        }
      });
    });

    room.state.players.onRemove((player: Player, sessionId: string) => {
      const sprite = this.playerSprites.get(sessionId);
      if (sprite) {
        sprite.destroy();
        this.playerSprites.delete(sessionId);
      }
    });

    // Guards
    room.state.guards.onAdd((guard: Guard, guardId: string) => {
      const sprite = this.add.sprite(
        guard.x * GAME_CONFIG.TILE_SIZE + GAME_CONFIG.TILE_SIZE / 2,
        guard.y * GAME_CONFIG.TILE_SIZE + GAME_CONFIG.TILE_SIZE / 2,
        'guard'
      );
      this.guardSprites.set(guardId, sprite);

      guard.onChange(() => {
        sprite.setPosition(
          guard.x * GAME_CONFIG.TILE_SIZE + GAME_CONFIG.TILE_SIZE / 2,
          guard.y * GAME_CONFIG.TILE_SIZE + GAME_CONFIG.TILE_SIZE / 2
        );
      });
    });

    // Objectives
    room.state.objectives.onAdd((objective: Objective, objectiveId: string) => {
      const sprite = this.add.sprite(
        objective.x * GAME_CONFIG.TILE_SIZE + GAME_CONFIG.TILE_SIZE / 2,
        objective.y * GAME_CONFIG.TILE_SIZE + GAME_CONFIG.TILE_SIZE / 2,
        `objective_${objective.type}`
      );
      this.objectiveSprites.set(objectiveId, sprite);

      objective.onChange(() => {
        if (objective.completed) {
          sprite.setAlpha(0.3);
        }
      });
    });

    // Timer updates
    room.state.onChange(() => {
      const minutes = Math.floor(room.state.timeRemaining / 60);
      const seconds = room.state.timeRemaining % 60;
      this.timerText.setText(`Time: ${minutes}:${seconds.toString().padStart(2, '0')}`);

      // Update objectives counter
      const completed = Array.from(room.state.objectives.values()).filter(
        (obj: Objective) => obj.completed && obj.type !== OBJECTIVES.FIND_EXIT
      ).length;
      this.objectivesText.setText(`Objectives: ${completed}/3`);

      if (room.state.gameOver) {
        if (room.state.victory) {
          this.showGameOver('VICTORY! You escaped with the crown!', 0x00ff00);
        } else {
          this.showGameOver('GAME OVER! Mission failed.', 0xff0000);
        }
      }
    });

    // Server messages
    room.onMessage('game_started', () => {
      this.statusText.setText('Game Started! Complete objectives and escape!');
      setTimeout(() => this.statusText.setText(''), 3000);
    });

    room.onMessage('player_caught', (data: { playerId: string; playerName: string }) => {
      this.statusText.setText(`${data.playerName} was caught!`);
      setTimeout(() => this.statusText.setText(''), 3000);
    });

    room.onMessage('objective_completed', (data: { type: string }) => {
      const messages: Record<string, string> = {
        [OBJECTIVES.DESTROY_FOOTAGE]: 'Security footage destroyed!',
        [OBJECTIVES.FIND_CROWN]: 'Crown jewels found!',
        [OBJECTIVES.FIND_PASSWORD]: 'Password found!',
        [OBJECTIVES.FIND_EXIT]: 'Someone escaped!',
      };
      this.statusText.setText(messages[data.type] || 'Objective completed!');
      setTimeout(() => this.statusText.setText(''), 3000);
    });
  }

  private showGameOver(message: string, color: number) {
    const bg = this.add.rectangle(
      this.cameras.main.centerX,
      this.cameras.main.centerY,
      600,
      200,
      0x000000,
      0.8
    );

    const text = this.add.text(this.cameras.main.centerX, this.cameras.main.centerY, message, {
      fontSize: '32px',
      color: `#${color.toString(16).padStart(6, '0')}`,
      fontFamily: 'Courier New',
      align: 'center',
    });
    text.setOrigin(0.5);

    // Stop accepting input
    this.input.keyboard!.enabled = false;
  }

  update(time: number) {
    if (!this.network.room || !this.cursors) return;

    const player = this.network.room.state.players.get(this.currentPlayerId);
    if (!player || player.caught) return;

    // Handle movement with delay
    if (time - this.lastMoveTime > this.moveDelay) {
      let dx = 0;
      let dy = 0;

      if (this.cursors.left.isDown) dx = -1;
      else if (this.cursors.right.isDown) dx = 1;

      if (this.cursors.up.isDown) dy = -1;
      else if (this.cursors.down.isDown) dy = 1;

      if (dx !== 0 || dy !== 0) {
        this.network.sendMove(dx, dy);
        this.lastMoveTime = time;
      }
    }
  }
}
