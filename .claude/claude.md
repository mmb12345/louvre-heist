# Louvre Heist - Project Context

## Project Overview

Louvre Heist is a 3-player cooperative multiplayer heist game built for a hackathon. Players must work together to break into the Louvre museum, complete objectives, and escape before time runs out while avoiding patrolling guards.

## Tech Stack

- **Frontend**: Vite + TypeScript + Phaser 3 (port 3000)
- **Backend**: Node.js + Colyseus + Express (port 2567)
- **Shared**: TypeScript types and game constants
- **Architecture**: Monorepo with npm workspaces

## Project Structure

```
louvre-heist/
├── packages/
│   ├── client/               # Phaser 3 game frontend
│   │   ├── src/
│   │   │   ├── main.ts       # Entry point, Phaser config
│   │   │   ├── scenes/       # Phaser game scenes
│   │   │   │   ├── BootScene.ts    # Initial scene (name entry, room join)
│   │   │   │   └── GameScene.ts    # Main game scene
│   │   │   └── network/
│   │   │       └── ColyseusClient.ts  # Colyseus client connection
│   │   └── vite.config.ts
│   │
│   ├── server/               # Colyseus game server
│   │   └── src/
│   │       ├── index.ts      # Server entry point, Express + Colyseus setup
│   │       └── rooms/
│   │           └── GameRoom.ts      # Main game room logic
│   │
│   └── shared/               # Shared code between client and server
│       └── src/
│           ├── index.ts      # Package exports
│           ├── types.ts      # TypeScript interfaces, patrol patterns
│           ├── constants.ts  # Game config, objectives, room types
│           └── schema/
│               └── GameState.ts    # Colyseus schema definitions
```

## Game Architecture

### Core Game Loop

1. **Room Creation**: Players join a room by entering a room ID
2. **Game Start**: Game starts when exactly 3 players join
3. **Objective Completion**: Players must complete 3 objectives:
   - Destroy security footage (security room)
   - Find Princess Eugenie's crown (crown room)
   - Get the password (password room)
4. **Escape**: Players must reach the exit with all objectives complete
5. **Win/Lose Conditions**:
   - **Win**: At least one player reaches exit with all objectives complete
   - **Lose**: Time runs out (5 minutes) OR all players get caught by guards

### State Management (Colyseus Schema)

All game state lives in `packages/shared/src/schema/GameState.ts`:

- **GameState**: Root state containing players, guards, objectives, game status
- **Player**: Position, name, caught status, password ownership
- **Guard**: Position, patrol pattern index, patrol point index
- **Objective**: Type, position, completion status

State is synchronized automatically by Colyseus between server and all clients.

### Network Messages

**Client → Server**:
- `move`: Player movement with dx/dy input
- `interact`: Player interaction with nearby objectives

**Server → Client** (broadcasts):
- `game_started`: Game begins when 3 players join
- `objective_completed`: An objective was completed
- `player_caught`: A guard caught a player
- `game_over`: Game ended with victory/defeat status

### Guard AI System

- **4 Guards** with predefined patrol patterns (defined in `shared/src/types.ts`)
- **Patrol Patterns**:
  - Pattern 0: Horizontal patrol (top of map)
  - Pattern 1: Vertical patrol (left side)
  - Pattern 2: Diagonal patrol
  - Pattern 3: Square patrol (center area)
- Guards move at `GUARD_SPEED` (1.5 units/tick)
- Catch range: 1 unit from player
- Guards update every 500ms

### Game Constants

Key constants in `packages/shared/src/constants.ts`:

```typescript
GAME_CONFIG = {
  MAP_WIDTH: 50,
  MAP_HEIGHT: 50,
  TILE_SIZE: 32,
  MAX_PLAYERS: 3,
  GAME_DURATION: 300,     // 5 minutes
  PLAYER_SPEED: 2,
  GUARD_SPEED: 1.5,
  GUARD_VISION_RANGE: 5,
  GUARD_CATCH_RANGE: 1,
}
```

Objectives are defined at fixed positions:
- Security room: (10, 10)
- Crown room: (40, 10)
- Password room: (10, 40)
- Exit: (40, 40)

## Development Workflow

### Running the Game

```bash
# Install dependencies (if needed)
npm install

# Run both client and server together
npm run dev

# Or run separately
npm run dev:server  # Terminal 1 - Server on port 2567
npm run dev:client  # Terminal 2 - Client on port 3000
```

### Testing the Game

1. Open `http://localhost:3000` in 3 browser tabs/windows
2. Enter player names
3. Use same room ID for all players (e.g., "room1")
4. Game starts automatically when 3 players join
5. Controls: Arrow keys to move, SPACE to interact

### Building for Production

```bash
npm run build           # Build all packages
npm run build:client    # Build client only
npm run build:server    # Build server only
```

### Monitoring

- Colyseus monitor: `http://localhost:2567/colyseus`
- View active rooms, player counts, and state

## Key Design Decisions

### Hackathon Simplifications

- **No database**: All state in memory via Colyseus
- **Simple graphics**: Geometric shapes (circles, squares, stars)
- **Fixed map layout**: Same positions every game
- **Predictable guard patterns**: 4 fixed patrol routes
- **No authentication**: Players just enter names

### Multiplayer Design

- **Cooperative**: All players win/lose together
- **Real-time sync**: Colyseus handles state synchronization
- **Room-based**: Players create/join rooms with IDs
- **Auto-start**: Game begins when exactly 3 players join

### Game Balance

- Players slightly faster than guards (2.0 vs 1.5 speed)
- 5-minute time limit creates urgency
- Fixed objective locations encourage strategy
- Catch range (1 unit) allows close calls but requires alertness

## Common Development Tasks

### Adding a New Objective

1. Add objective type to `shared/src/constants.ts` OBJECTIVES
2. Create objective in `server/src/rooms/GameRoom.ts` initializeObjectives()
3. Add interaction logic in setupMessageHandlers() 'interact' handler
4. Update client rendering in `client/src/scenes/GameScene.ts`

### Modifying Game Config

Edit `packages/shared/src/constants.ts` GAME_CONFIG:
- Map size
- Player/guard speeds
- Game duration
- Catch ranges

Changes are automatically shared between client and server.

### Adding New Guard Patterns

Add to `packages/shared/src/types.ts` PATROL_PATTERNS array:

```typescript
// Example: Diamond pattern
{
  { x: 25, y: 15 },
  { x: 35, y: 25 },
  { x: 25, y: 35 },
  { x: 15, y: 25 },
}
```

### Debugging Multiplayer

- Use Colyseus monitor to inspect room state
- Check browser console for client-side errors
- Check server terminal for server-side logs
- Test with multiple browser windows/profiles

## Important Notes

### State Synchronization

- Never modify state directly on the client
- All state changes must go through server
- Client sends input messages, server updates state
- Colyseus automatically syncs state to all clients

### Coordinate System

- Origin (0, 0) is top-left
- Map coordinates: 0-49 (MAP_WIDTH/MAP_HEIGHT)
- Display coordinates: multiplied by TILE_SIZE (32) in client

### Player Lifecycle

1. Player joins → onJoin() creates Player entity
2. Player moves → 'move' message updates position
3. Player caught → `caught` flag set, can't move
4. Player leaves → onLeave() removes Player entity
5. If < 2 players remain during game → game ends

### Room Lifecycle

1. Room created when first player joins
2. Players join until MAX_PLAYERS (3) reached
3. Game starts automatically
4. Game ends on win/loss condition
5. Room auto-disconnects 10 seconds after game over

## Phaser 3 Integration

### Scene Structure

- **BootScene**: Initial menu for name/room entry
- **GameScene**: Main game rendering and input handling

### Rendering

- Players: Blue circles
- Guards: Red circles
- Objectives: Different shapes based on type
  - Security room: Red square
  - Crown: Gold star
  - Password: White rectangle (paper)
  - Exit: Green rectangle (door)

### Input Handling

Arrow keys for movement (processed locally, sent to server)
SPACE for interaction (sent to server)

## Package References

When working with this codebase:
- Shared types import from: `@louvre-heist/shared`
- Server package: `@louvre-heist/server`
- Client package: `@louvre-heist/client`

## Future Enhancement Ideas

If extending beyond hackathon scope:
- Procedurally generated maps
- More objective types
- Power-ups and items
- Different guard AI behaviors
- Player abilities/roles
- Difficulty levels
- Persistent player stats
- Multiple game modes
