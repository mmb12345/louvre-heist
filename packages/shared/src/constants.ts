export const GAME_CONFIG = {
  TILE_SIZE: 32,
  PLAYER_SIZE: 32, // Player sprite size in pixels
  ROOM_SIZE: 40, // Room is 40x40 tiles
  ROOMS_GRID: 10, // 10x10 grid of rooms
  MAP_WIDTH: 400, // 10 rooms * 40 tiles = 400 tiles
  MAP_HEIGHT: 400,
  PLAYER_SPEED: 7.5, // Movement speed in pixels per frame
  MAX_PLAYERS: 3, // Maximum number of players
  GAME_DURATION: 300, // Game duration in seconds (5 minutes)
  GUARD_SPEED: 1.5, // Guard movement speed
  GUARD_CATCH_RANGE: 1, // Distance at which guard catches player
  GUARD_SIZE: 24, // Guard sprite size in pixels (converted to tiles for logic)
  GUARD_SHOOT_RANGE: 3, // Distance at which guard shoots player (in tiles, 3x guard size)
};

export const OBJECTIVES = {
  DESTROY_FOOTAGE: 'destroy_footage',
  FIND_CROWN: 'find_crown',
  FIND_PASSWORD: 'find_password',
  FIND_EXIT: 'find_exit',
} as const;

export const ROOM_TYPES = {
  GUARD_ROOM: 'guard_room',
  SECURITY_ROOM: 'security_room',
  CROWN_ROOM: 'crown_room',
  LOOT_ROOM: 'loot_room',
  EXIT: 'exit',
  HALLWAY: 'hallway',
} as const;

export type ObjectiveType = typeof OBJECTIVES[keyof typeof OBJECTIVES];
export type RoomType = typeof ROOM_TYPES[keyof typeof ROOM_TYPES];
