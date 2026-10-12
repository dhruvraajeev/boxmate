import type { WebSocket } from "ws";

export interface HeartbeatOptions {
  intervalMs: number;
  timeoutMs: number;
}

/**
 * A closed laptop lid or a dead network sends nothing, not even a close, so silence is the only signal.
 * Sends a WebSocket ping every intervalMs (browsers answer pongs automatically). If no pong arrives for
 * timeoutMs, terminates the socket, which fires its "close" handler like any other disconnect.
 * Returns a stop function.
 */
export function startHeartbeat(socket: WebSocket, { intervalMs, timeoutMs }: HeartbeatOptions): () => void {
  let deadline = setTimeout(() => socket.terminate(), timeoutMs);
  const pinger = setInterval(() => socket.ping(), intervalMs);

  socket.on("pong", () => {
    clearTimeout(deadline);
    deadline = setTimeout(() => socket.terminate(), timeoutMs);
  });

  return () => {
    clearInterval(pinger);
    clearTimeout(deadline);
  };
}
