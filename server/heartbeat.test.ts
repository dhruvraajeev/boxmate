import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WebSocket } from "ws";
import { startHeartbeat } from "./heartbeat";

/** Just enough of a ws socket to count pings and see when it gets terminated. */
function fakeSocket() {
  const socket = Object.assign(new EventEmitter(), { ping: vi.fn(), terminate: vi.fn() });
  return { socket, ws: socket as unknown as WebSocket };
}

describe("startHeartbeat", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("pings every 5s and terminates a socket that has been silent for 10s", () => {
    const { socket, ws } = fakeSocket();
    startHeartbeat(ws, { intervalMs: 5000, timeoutMs: 10_000 });

    vi.advanceTimersByTime(9999);
    expect(socket.ping).toHaveBeenCalledTimes(1);
    expect(socket.terminate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(socket.terminate).toHaveBeenCalledTimes(1);
  });

  it("keeps a socket that answers with pongs", () => {
    const { socket, ws } = fakeSocket();
    startHeartbeat(ws, { intervalMs: 5000, timeoutMs: 10_000 });

    for (let i = 0; i < 10; i++) {
      vi.advanceTimersByTime(5000);
      socket.emit("pong");
    }
    expect(socket.terminate).not.toHaveBeenCalled();
  });

  it("does nothing after it is stopped", () => {
    const { socket, ws } = fakeSocket();
    const stop = startHeartbeat(ws, { intervalMs: 5000, timeoutMs: 10_000 });
    stop();

    vi.advanceTimersByTime(60_000);
    expect(socket.ping).not.toHaveBeenCalled();
    expect(socket.terminate).not.toHaveBeenCalled();
  });
});
