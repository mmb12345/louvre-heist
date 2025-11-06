export const GAME_CONFIG = {
  TILE_SIZE: 32,
  PLAYER_SIZE: 32, // Player sprite size in pixels
  ROOM_SIZE: 40, // Room is 40x40 tiles
  ROOMS_GRID: 10, // 10x10 grid of rooms
  MAP_WIDTH: 400, // 10 rooms * 40 tiles = 400 tiles
  MAP_HEIGHT: 400,
  PLAYER_SPEED: 7.5, // Movement speed in pixels per frame
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
