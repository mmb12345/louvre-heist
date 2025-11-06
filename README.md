# Louvre Heist 🎮

A 3-player cooperative heist game built for a hackathon. Break into the Louvre, complete objectives, and escape before time runs out!

## Game Objectives

1. **Destroy Security Footage** - Find the security room (red square)
2. **Find the Crown** - Locate Princess Eugenie's crown (gold star)
3. **Get the Password** - Find the password on a post-it note (white paper)
4. **Escape** - Make it to the exit with all objectives complete (green door)

## Features

- **3-player cooperative multiplayer** - Work together to complete objectives
- **Guard AI** - 4 guards with different patrol patterns
- **Time limit** - Complete objectives and escape within 5 minutes
- **Real-time sync** - Built with Colyseus for smooth multiplayer

## Tech Stack

- **Frontend**: Vite + TypeScript + Phaser 3
- **Backend**: Node.js + Colyseus + Express
- **Shared**: TypeScript types and game constants

## Quick Start

### Install Dependencies
```bash
npm install
```

### Run Development Servers

**Option 1: Run both client and server together**
```bash
npm run dev
```

**Option 2: Run separately**
```bash
# Terminal 1 - Server
npm run dev:server

# Terminal 2 - Client
npm run dev:client
```

### Play the Game

1. Open `http://localhost:3000` in 3 different browser windows/tabs
2. Enter a player name when prompted
3. Enter the same room ID for all players (e.g., "room1")
4. Game starts automatically when all 3 players join
5. Use **Arrow Keys** to move, **SPACE** to interact with objectives

## Project Structure

```
louvre-heist/
├── packages/
│   ├── client/          # Phaser game (port 3000)
│   ├── server/          # Colyseus server (port 2567)
│   └── shared/          # Shared types and constants
```

## Game Rules

- Split up to find objectives faster
- Stay away from guards (red circles) or you'll get caught
- You need the password to unlock the exit
- All 3 objectives must be complete before anyone can escape
- If all players get caught or time runs out, it's game over

## Development

- **Monitor**: View room state at `http://localhost:2567/colyseus`
- **Hot Reload**: Both client and server support hot reloading

## Building for Production

```bash
npm run build
```

## Simplified Design

This is a streamlined version designed for a hackathon:
- **No database** - Game state lives in memory via Colyseus
- **Simple graphics** - Geometric shapes (circles, squares)
- **Fixed objectives** - Same map layout each game
- **4 patrol patterns** - Guards follow predictable routes

Perfect for rapid development and testing! 🚀