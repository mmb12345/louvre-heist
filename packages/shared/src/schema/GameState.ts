import { Schema, type, MapSchema } from '@colyseus/schema';

export class Player extends Schema {
  @type('string') id!: string;
  @type('string') name!: string;
  @type('string') color!: string; // 'pink', 'green', or 'blue'
  @type('number') x!: number;
  @type('number') y!: number;
  @type('number') angle: number = 0; // Player facing direction
  @type('boolean') isMoving: boolean = false;
  @type('boolean') caught: boolean = false;
  @type('boolean') hasPassword: boolean = false;
}

export class Guard extends Schema {
  @type('string') id!: string;
  @type('number') x!: number;
  @type('number') y!: number;
  @type('number') patrolPattern!: number; // 0-3 for different patterns
  @type('number') patrolIndex: number = 0;
}

export class Objective extends Schema {
  @type('string') id!: string;
  @type('string') type!: string;
  @type('number') x!: number;
  @type('number') y!: number;
  @type('boolean') completed: boolean = false;
}

export class Room extends Schema {
  @type('number') gridX!: number; // Grid position (0-9)
  @type('number') gridY!: number; // Grid position (0-9)
  @type('string') roomType!: string; // 'guard_room', 'security_room', etc.
}

export class GameState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: Guard }) guards = new MapSchema<Guard>();
  @type({ map: Objective }) objectives = new MapSchema<Objective>();
  @type({ map: Room }) rooms = new MapSchema<Room>();
  @type('number') timeRemaining!: number;
  @type('boolean') gameStarted: boolean = false;
  @type('boolean') gameOver: boolean = false;
  @type('boolean') victory: boolean = false;
}
