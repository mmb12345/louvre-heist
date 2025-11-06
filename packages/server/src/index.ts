import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import { monitor } from '@colyseus/monitor';
import { GameRoom } from './rooms/GameRoom';

const port = Number(process.env.PORT) || 2567;
const app = express();

app.use(cors());
app.use(express.json());

const httpServer = createServer(app);

const gameServer = new Server({
  transport: new WebSocketTransport({
    server: httpServer,
  }),
});

// Register game room
gameServer.define('game', GameRoom).filterBy(['roomId']);

// Monitor panel for development
if (process.env.NODE_ENV !== 'production') {
  app.use('/colyseus', monitor());
}

gameServer.listen(port);
console.log(`🎮 Louvre Heist server listening on ws://localhost:${port}`);
