# Louvre Heist - Project Context

## Project Overview

Louvre Heist is a 3-player cooperative multiplayer heist game. Players must work together to break into the Louvre museum, complete objectives, and escape before time runs out while avoiding patrolling guards.

## Tech Stack

- **Frontend**: Vite + TypeScript + Phaser 3 (port 3000)
- **Backend**: Node.js + Colyseus + Express (port 2567)
- **Shared**: TypeScript types and game constants
- **Architecture**: Monorepo with npm workspaces

## Git Workflow - IMPORTANT

### Branch Strategy

**ALWAYS work on a separate branch - NEVER commit directly to main:**

```bash
# Create a new feature branch
git checkout -b feature/your-feature-name

# Or for fixes
git checkout -b fix/bug-description
```

### Branch Naming Convention

- `feature/*` - New features
- `fix/*` - Bug fixes
- `docs/*` - Documentation updates
- `refactor/*` - Code refactoring
- `test/*` - Test additions or modifications

### Committing Changes

1. **Work on a feature branch**
2. **Make commits with clear messages**
3. **Push your branch to remote**
4. **Create a Pull Request for review**
5. **Merge via PR after review**

### Critical Rules

🚫 **NEVER force push to main:**
```bash
# NEVER DO THIS
git push --force origin main
```

🚫 **NEVER commit directly to main:**
```bash
# ALWAYS create a branch first
git checkout -b feature/my-changes
```

✅ **ALWAYS use feature branches:**
```bash
# Correct workflow
git checkout -b feature/add-multiplayer
# Make changes
git add .
git commit -m "Add multiplayer support"
git push origin feature/add-multiplayer
# Create PR on GitHub
```

### Pull Request Workflow

1. Create a feature branch
2. Make your changes
3. Commit and push to your branch
4. Create a Pull Request on GitHub
5. Request review if needed
6. Merge via GitHub UI (NOT force push)
7. Delete the feature branch after merge

### Recovering from Mistakes

If you accidentally commit to main:
```bash
# Create a branch from current state
git checkout -b feature/save-my-work

# Reset main to remote
git checkout main
git reset --hard origin/main

# Continue work on feature branch
git checkout feature/save-my-work
```

## Project Structure

```
louvre-heist/
├── packages/
│   ├── client/               # Phaser 3 game frontend
│   │   ├── src/
│   │   │   ├── main.ts       # Entry point, Phaser config
│   │   │   ├── scenes/       # Phaser game scenes
│   │   │   │   ├── BootScene.ts    # Initial scene
│   │   │   │   └── GameScene.ts    # Main game scene
│   │   │   └── network/
│   │   │       └── ColyseusClient.ts  # Colyseus client connection
│   │   ├── public/assets/   # Game assets (sprites, etc.)
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
  MAP_WIDTH: 400,
  MAP_HEIGHT: 400,
  TILE_SIZE: 32,
  ROOM_SIZE: 40,
  ROOMS_GRID: 10,
  PLAYER_SPEED: 7.5,
}
```

Current map setup:
- 400x400 tiles (10x10 grid of rooms)
- Each room is 40x40 tiles
- Player speed: 7.5 pixels per frame

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

1. Open `http://localhost:3000` in your browser
2. Use WASD keys to move
3. Player sprite rotates based on movement direction
4. Walking animation plays when moving

### Building for Production

```bash
npm run build           # Build all packages
npm run build:client    # Build client only
npm run build:server    # Build server only
```

### Monitoring

- **Development server**: Client runs on `http://localhost:3000`
- **Hot Reload**: Both client and server support hot reloading

## Key Design Decisions

### Current Implementation

- **Single-player mode**: Currently no multiplayer (original Colyseus code exists but not active)
- **Simple graphics**: Geometric shapes and SVG sprites
- **Fixed map layout**: 10x10 grid of rooms (40x40 tiles each)
- **Walking animations**: Still sprite when stopped, animated walk cycle when moving
- **Diagonal movement**: 8-directional movement with proper rotation angles

### Game Balance

- Player speed: 7.5 pixels per frame
- Large map: 400x400 tiles for exploration
- Room-based layout with visual grid divisions

## Common Development Tasks

### Adding a New Asset

1. Place asset in `packages/client/public/assets/`
2. Preload in `BootScene.ts`:
   ```typescript
   this.load.image('assetName', '/assets/filename.svg');
   ```
3. Use in scene:
   ```typescript
   this.add.image(x, y, 'assetName');
   ```

### Modifying Game Config

Edit `packages/shared/src/constants.ts` GAME_CONFIG:
- Map size
- Room size
- Player speed
- Tile size

Changes are automatically shared between client and server.

### Adding Animations

In `GameScene.ts`:
```typescript
this.anims.create({
  key: 'animationName',
  frames: [
    { key: 'frame1' },
    { key: 'frame2' },
  ],
  frameRate: 8,
  repeat: -1,
});
```

## Important Notes

### Coordinate System

- Origin (0, 0) is top-left
- Map coordinates: 0-399 tiles (MAP_WIDTH/MAP_HEIGHT)
- Display coordinates: multiplied by TILE_SIZE (32) in client

### Player Movement

- WASD controls for movement
- 8-directional movement (4 cardinal + 4 diagonal)
- Rotation angles:
  - Down (S): 0°
  - Down-Left (S+A): 45°
  - Left (A): 90°
  - Up-Left (W+A): 135°
  - Up (W): 180°
  - Up-Right (W+D): 225°
  - Right (D): 270°
  - Down-Right (S+D): 315°

### Animation System

- `playerStill`: Shown when not moving
- `walk` animation: 2-frame walk cycle at 8fps
- Rotation angle maintained when stopping
- Animation automatically starts/stops based on movement

## Phaser 3 Integration

### Scene Structure

- **BootScene**: Initial scene, loads assets and creates textures
- **GameScene**: Main game scene with player movement

### Rendering

- Player: SVG sprite with rotation
- Tiles: Procedurally generated texture
- Room dividers: Graphics overlay every 40 tiles

### Input Handling

WASD keys for movement (processed in update loop)

## Package References

When working with this codebase:
- Shared types import from: `@louvre-heist/shared`
- Server package: `@louvre-heist/server`
- Client package: `@louvre-heist/client`

## Future Enhancement Ideas

Potential features to add:
- Multiplayer via Colyseus (code exists but needs integration)
- Guard AI with patrol patterns
- Objectives and collectibles
- Different player abilities/roles
- Procedurally generated maps
- Power-ups and items
