export const GAME_CONFIG = {
  TILE_SIZE: 32,
  PLAYER_SIZE: 32, // Player sprite size in pixels
  ROOM_SIZE: 20, // Room is 20x20 tiles
  ROOMS_GRID: 10, // 10x10 grid of rooms
  MAP_WIDTH: 200, // 10 rooms * 20 tiles = 200 tiles
  MAP_HEIGHT: 200,
  PLAYER_SPEED: 5, // Movement speed in pixels per frame
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
