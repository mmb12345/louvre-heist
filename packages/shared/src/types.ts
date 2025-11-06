export interface Position {
  x: number;
  y: number;
}

export interface PlayerInput {
  dx: number;
  dy: number;
}

export interface PatrolPoint {
  x: number;
  y: number;
}

export type PatrolPattern = PatrolPoint[];

export const PATROL_PATTERNS: PatrolPattern[] = [
  // Pattern 0: Top horizontal patrol
  [
    { x: 10, y: 10 },
    { x: 40, y: 10 },
  ],
  // Pattern 1: Left vertical patrol
  [
    { x: 10, y: 10 },
    { x: 10, y: 40 },
  ],
  // Pattern 2: Diagonal patrol
  [
    { x: 15, y: 15 },
    { x: 35, y: 35 },
  ],
  // Pattern 3: Square patrol
  [
    { x: 20, y: 20 },
    { x: 30, y: 20 },
    { x: 30, y: 30 },
    { x: 20, y: 30 },
  ],
];
