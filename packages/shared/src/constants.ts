export const GAME_CONFIG = {
  MAP_WIDTH: 50,
  MAP_HEIGHT: 50,
  TILE_SIZE: 32,
  MAX_PLAYERS: 3,
  GAME_DURATION: 300, // 5 minutes in seconds
  PLAYER_SPEED: 2,
  GUARD_SPEED: 1.5,
  GUARD_VISION_RANGE: 5,
  GUARD_CATCH_RANGE: 1,
};

export const OBJECTIVES = {
  DESTROY_FOOTAGE: 'destroy_footage',
  FIND_CROWN: 'find_crown',
  FIND_PASSWORD: 'find_password',
  FIND_EXIT: 'find_exit',
} as const;

export const ROOM_TYPES = {
  SECURITY_ROOM: 'security_room',
  CROWN_ROOM: 'crown_room',
  PASSWORD_ROOM: 'password_room',
  EXIT: 'exit',
  HALLWAY: 'hallway',
} as const;

export type ObjectiveType = typeof OBJECTIVES[keyof typeof OBJECTIVES];
export type RoomType = typeof ROOM_TYPES[keyof typeof ROOM_TYPES];
