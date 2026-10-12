import type { ClientMessage, ServerMessage } from "../shared/protocol";

export interface SignalingEvents {
  onMessage(message: ServerMessage): void;
  /** The connection dropped without us closing it. */
  onLost(): void;
}

export interface Signaling {
  send(message: ClientMessage): void;
  close(): void;
}

/** Opens the WebSocket to the server, which joins the matchmaking queue. */
export function connectSignaling(events: SignalingEvents): Signaling {
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  const socket = new WebSocket(`${scheme}://${location.host}/ws`);
  let closedByUs = false;

  socket.addEventListener("message", (event) => {
    events.onMessage(JSON.parse(String(event.data)) as ServerMessage);
  });
  socket.addEventListener("close", () => {
    if (!closedByUs) events.onLost();
  });

  return {
    send(message) {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    },
    close() {
      closedByUs = true;
      socket.close();
    },
  };
}
