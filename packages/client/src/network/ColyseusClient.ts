import * as Colyseus from "colyseus.js"
import { GameState } from "@louvre-heist/shared"

export class ColyseusClient {
  private client: Colyseus.Client
  public room: Colyseus.Room<GameState> | null = null

  constructor() {
    const serverUrl = import.meta.env.VITE_SERVER_URL || "ws://localhost:2567"
    console.log("Server Url:", serverUrl)
    this.client = new Colyseus.Client(serverUrl)
  }

  async joinOrCreate(roomId: string, playerName: string, playerColor: string): Promise<Colyseus.Room<GameState>> {
    try {
      this.room = await this.client.joinOrCreate<GameState>("game", {
        roomId,
        name: playerName,
        color: playerColor,
      })
      console.log("Joined room:", this.room.id)
      return this.room
    } catch (e) {
      console.error("Failed to join room:", e)
      throw e
    }
  }

  sendMove(x: number, y: number, angle: number, isMoving: boolean) {
    if (this.room) {
      this.room.send("move", { x, y, angle, isMoving })
    }
  }

  sendInteract() {
    if (this.room) {
      this.room.send("interact")
    }
  }

  leave() {
    if (this.room) {
      this.room.leave()
      this.room = null
    }
  }
}
