import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { PlayerConnections } from "./connections";
import { startMatchmaking } from "./matchmaker";
import { Matches } from "./matches";
import { parseClientMessage } from "./messages";
import { firstComeFirstServed } from "./pairing";
import { InMemoryQueue } from "./queue";
import { serveStatic } from "./static";

export interface AppOptions {
  staticDir: string;
  matchmakingIntervalMs?: number;
}

/** One process serves the web app over HTTP and runs matchmaking + signaling over WebSocket. */
export function createApp({ staticDir, matchmakingIntervalMs = 250 }: AppOptions) {
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

    socket.on("message", (data) => {
      const message = parseClientMessage(data.toString());
      if (message?.type === "signal") {
        const opponent = matches.opponentOf(playerId);
        if (opponent) connections.sendToPlayer(opponent, { type: "signal", payload: message.payload });
      }
    });

    socket.on("close", () => {
      queue.remove(playerId);
      // Slice B: tell the opponent ("Opponent left") instead of ending the match silently.
      matches.end(playerId);
      connections.remove(playerId);
    });
  });

  const stopMatchmaking = startMatchmaking({
    queue,
    rule: firstComeFirstServed,
    intervalMs: matchmakingIntervalMs,
    onPair: ([first, second]) => {
      matches.start(first, second);
      connections.sendToPlayer(first, { type: "matched", initiator: true });
      connections.sendToPlayer(second, { type: "matched", initiator: false });
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
