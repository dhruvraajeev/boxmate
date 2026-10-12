import { WebSocket } from "ws";
import type { ServerMessage } from "../shared/protocol";

/**
 * Tracks each player's WebSocket. Every server → browser message goes through sendToPlayer,
 * so cross-instance delivery (e.g. Redis pub/sub) can plug in here when scaling out.
 */
export class PlayerConnections {
  private sockets = new Map<string, WebSocket>();

  add(playerId: string, socket: WebSocket): void {
    this.sockets.set(playerId, socket);
  }

  remove(playerId: string): void {
    this.sockets.delete(playerId);
  }

  /** Returns false if the player isn't connected here. */
  sendToPlayer(playerId: string, message: ServerMessage): boolean {
    const socket = this.sockets.get(playerId);
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  }
}
