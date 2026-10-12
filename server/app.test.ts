import { mkdtemp, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import type { IceServer, ServerMessage, SignalPayload } from "../shared/protocol";
import { createApp, type AppOptions } from "./app";
import { STUN_ONLY } from "./turn";

type App = ReturnType<typeof createApp>;

/** A fake browser: connects to the server and records what it receives. */
function connectClient(port: number, { answersPings = true } = {}) {
  // answersPings: false acts like a closed laptop lid: the socket stays open but nothing comes back.
  const socket = new WebSocket(`ws://localhost:${port}/ws`, { autoPong: answersPings });
  const received: ServerMessage[] = [];
  const waiters: Array<() => void> = [];
  socket.on("message", (data) => {
    received.push(JSON.parse(data.toString()) as ServerMessage);
    for (const wake of waiters.splice(0)) wake();
  });

  async function next(type: ServerMessage["type"]): Promise<ServerMessage> {
    for (;;) {
      const index = received.findIndex((m) => m.type === type);
      if (index !== -1) return received.splice(index, 1)[0]!;
      await new Promise<void>((resolve) => waiters.push(resolve));
    }
  }

  return {
    socket,
    received,
    next,
    opened: new Promise((resolve) => socket.once("open", resolve)),
    closed: new Promise((resolve) => socket.once("close", resolve)),
  };
}

describe("matchmaking and signaling", () => {
  let app: App;
  let port: number;
  let staticDir: string;

  /** Restarts the server with different options. */
  async function start(options: Omit<AppOptions, "staticDir"> = {}): Promise<void> {
    await app?.close();
    app = createApp({ staticDir, matchmakingIntervalMs: 10, ...options });
    await new Promise<void>((resolve) => app.http.listen(0, resolve));
    port = (app.http.address() as AddressInfo).port;
  }

  beforeEach(async () => {
    staticDir = await mkdtemp(path.join(tmpdir(), "boxmate-"));
    await writeFile(path.join(staticDir, "index.html"), "<h1>boxmate</h1>");
    await start();
  });

  afterEach(async () => {
    await app.close();
  });

  it("matches two players, makes exactly one the initiator, and relays signals between them", async () => {
    const a = connectClient(port);
    await a.next("queued");
    const b = connectClient(port);
    await b.next("queued");

    const matchedA = await a.next("matched");
    const matchedB = await b.next("matched");
    expect([matchedA, matchedB]).toEqual([
      { type: "matched", initiator: true, iceServers: STUN_ONLY },
      { type: "matched", initiator: false, iceServers: STUN_ONLY },
    ]);

    const offer: SignalPayload = { kind: "description", description: { type: "offer", sdp: "v=0 fake" } };
    a.socket.send(JSON.stringify({ type: "signal", payload: offer }));
    expect(await b.next("signal")).toEqual({ type: "signal", payload: offer });

    const candidate: SignalPayload = { kind: "candidate", candidate: { candidate: "candidate:1 fake", sdpMid: "0" } };
    b.socket.send(JSON.stringify({ type: "signal", payload: candidate }));
    expect(await a.next("signal")).toEqual({ type: "signal", payload: candidate });
  });

  it("doesn't match a player who disconnected while waiting", async () => {
    const leaver = connectClient(port);
    await leaver.next("queued");
    leaver.socket.close();
    await new Promise((resolve) => leaver.socket.once("close", resolve));
    await new Promise((resolve) => setTimeout(resolve, 30));

    const a = connectClient(port);
    const b = connectClient(port);
    expect((await a.next("matched")).type).toBe("matched");
    expect((await b.next("matched")).type).toBe("matched");
    expect(leaver.received.some((m) => m.type === "matched")).toBe(false);
  });

  it("drops messages that don't follow the protocol", async () => {
    const a = connectClient(port);
    const b = connectClient(port);
    await a.next("matched");
    await b.next("matched");

    a.socket.send("not json");
    a.socket.send(JSON.stringify({ type: "signal", payload: { kind: "description", description: { type: "offer" } } }));
    a.socket.send(JSON.stringify({ type: "signal", payload: { kind: "candidate", candidate: { candidate: "ok" } } }));

    const relayed = await b.next("signal");
    expect(relayed).toEqual({ type: "signal", payload: { kind: "candidate", candidate: { candidate: "ok" } } });
    expect(b.received.filter((m) => m.type === "signal")).toHaveLength(0);
  });

  it("gives both players the same ICE servers, fetched once per match", async () => {
    const turn: IceServer[] = [{ urls: ["turn:relay.example:3478"], username: "u", credential: "c" }];
    let fetches = 0;
    await start({ getIceServers: async () => (fetches++, turn) });

    const a = connectClient(port);
    const b = connectClient(port);
    expect(await a.next("matched")).toMatchObject({ iceServers: turn });
    expect(await b.next("matched")).toMatchObject({ iceServers: turn });
    expect(fetches).toBe(1);
  });

  it("tells the opponent when their match partner disconnects", async () => {
    const a = connectClient(port);
    const b = connectClient(port);
    await a.next("matched");
    await b.next("matched");

    a.socket.close();
    expect(await b.next("opponent-left")).toEqual({ type: "opponent-left" });

    // b is out of the match: anything it still sends goes nowhere.
    b.socket.send(JSON.stringify({ type: "signal", payload: { kind: "candidate", candidate: { candidate: "late" } } }));
  });

  it("removes a silent player from the queue so nobody gets matched with them", async () => {
    await start({ heartbeatIntervalMs: 10, heartbeatTimeoutMs: 40, matchmakingIntervalMs: 200 });
    const silent = connectClient(port, { answersPings: false });
    await silent.next("queued");
    await silent.closed;

    const a = connectClient(port);
    const b = connectClient(port);
    expect((await a.next("matched")).type).toBe("matched");
    expect((await b.next("matched")).type).toBe("matched");
    expect(silent.received.some((m) => m.type === "matched")).toBe(false);
  });

  it("tells the opponent when their match partner goes silent mid-match", async () => {
    await start({ heartbeatIntervalMs: 10, heartbeatTimeoutMs: 60 });
    const a = connectClient(port);
    const silent = connectClient(port, { answersPings: false });
    await a.next("matched");

    expect(await a.next("opponent-left")).toEqual({ type: "opponent-left" });
    await silent.closed;
  });

  it("keeps players who answer pings", async () => {
    await start({ heartbeatIntervalMs: 10, heartbeatTimeoutMs: 40 });
    const a = connectClient(port);
    await a.next("queued");
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(a.socket.readyState).toBe(WebSocket.OPEN);
  });

  it("serves the web app but nothing outside its folder", async () => {
    const home = await fetch(`http://localhost:${port}/`);
    expect(home.status).toBe(200);
    expect(await home.text()).toContain("boxmate");

    expect((await fetch(`http://localhost:${port}/%2e%2e/%2e%2e/etc/passwd`)).status).toBe(404);
    expect((await fetch(`http://localhost:${port}/missing.js`)).status).toBe(404);
  });
});
