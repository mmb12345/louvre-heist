import { Schema, type, MapSchema } from '@colyseus/schema';

export class Player extends Schema {
  @type('string') id!: string;
  @type('string') name!: string;
  @type('number') x!: number;
  @type('number') y!: number;
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

export class GameState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: Guard }) guards = new MapSchema<Guard>();
  @type({ map: Objective }) objectives = new MapSchema<Objective>();
  @type('number') timeRemaining!: number;
  @type('boolean') gameStarted: boolean = false;
  @type('boolean') gameOver: boolean = false;
  @type('boolean') victory: boolean = false;
}
