import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import type { IceServer } from "../shared/protocol";
import { PlayerConnections } from "./connections";
import { startHeartbeat } from "./heartbeat";
import { startMatchmaking } from "./matchmaker";
import { Matches } from "./matches";
import { parseClientMessage } from "./messages";
import { firstComeFirstServed } from "./pairing";
import { InMemoryQueue } from "./queue";
import { serveStatic } from "./static";
import { STUN_ONLY } from "./turn";

export interface AppOptions {
  staticDir: string;
  matchmakingIntervalMs?: number;
  heartbeatIntervalMs?: number;
  /** A player who hasn't answered a ping for this long is treated as gone. */
  heartbeatTimeoutMs?: number;
  /** Called once per match; both players get the result. Must not throw (see turn.ts). */
  getIceServers?: () => Promise<IceServer[]>;
}

/** One process serves the web app over HTTP and runs matchmaking + signaling over WebSocket. */
export function createApp({
  staticDir,
  matchmakingIntervalMs = 250,
  heartbeatIntervalMs = 5000,
  heartbeatTimeoutMs = 10_000,
  getIceServers = async () => STUN_ONLY,
}: AppOptions) {
  const queue = new InMemoryQueue();
  const connections = new PlayerConnections();
  const matches = new Matches();

  const http = createServer(serveStatic(staticDir));
  // SDP offers are a few KB; the cap stops a client from sending huge messages.
  const wss = new WebSocketServer({ server: http, path: "/ws", maxPayload: 64 * 1024 });

  wss.on("connection", (socket) => {
    const playerId = randomUUID();
    connections.add(playerId, socket);
    queue.add(playerId);
    connections.sendToPlayer(playerId, { type: "queued" });
    // Runs the whole time the socket is open: queued, during setup, and during the match.
    const stopHeartbeat = startHeartbeat(socket, { intervalMs: heartbeatIntervalMs, timeoutMs: heartbeatTimeoutMs });

    socket.on("message", (data) => {
      const message = parseClientMessage(data.toString());
      if (message?.type === "signal") {
        const opponent = matches.opponentOf(playerId);
        if (opponent) connections.sendToPlayer(opponent, { type: "signal", payload: message.payload });
      }
    });

    // Fires for every way a player goes: Leave, closed tab, network drop, or a missed heartbeat.
    socket.on("close", () => {
      stopHeartbeat();
      queue.remove(playerId);
      const opponent = matches.end(playerId);
      if (opponent) connections.sendToPlayer(opponent, { type: "opponent-left" });
      connections.remove(playerId);
    });
  });

  const stopMatchmaking = startMatchmaking({
    queue,
    rule: firstComeFirstServed,
    intervalMs: matchmakingIntervalMs,
    onPair: ([first, second]) => {
      matches.start(first, second);
      void getIceServers().then((iceServers) => {
        // Known gap: if one player leaves while credentials load, the other gets opponent-left before ever
        // seeing matched and has to click Find match again. Requeue them silently if that shows up in playtests.
        if (matches.opponentOf(first) !== second) return;
        connections.sendToPlayer(first, { type: "matched", initiator: true, iceServers });
        connections.sendToPlayer(second, { type: "matched", initiator: false, iceServers });
      });
    },
  });

  return {
    http,
    close(): Promise<void> {
      stopMatchmaking();
      for (const client of wss.clients) client.terminate();
      wss.close();
      return new Promise((resolve) => http.close(() => resolve()));
    },
  };
}
