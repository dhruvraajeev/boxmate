import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getIceServers, STUN_ONLY } from "./turn";

const keys = { keyId: "key-id", apiToken: "secret-token" };

function respond(status: number, body: unknown) {
  return vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status }));
}

describe("getIceServers", () => {
  // The fallback logs a warning on purpose; keep test output clean.
  beforeEach(() => vi.spyOn(console, "warn").mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  it("asks Cloudflare for 1-hour credentials and drops port-53 URLs", async () => {
    const fetchFn = respond(201, {
      iceServers: [
        { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.cloudflare.com:53"] },
        {
          urls: ["turn:turn.cloudflare.com:3478?transport=udp", "turn:turn.cloudflare.com:53?transport=udp", "turns:turn.cloudflare.com:443?transport=tcp"],
          username: "u",
          credential: "c",
        },
      ],
    });

    expect(await getIceServers(keys, fetchFn)).toEqual([
      { urls: ["stun:stun.cloudflare.com:3478"] },
      { urls: ["turn:turn.cloudflare.com:3478?transport=udp", "turns:turn.cloudflare.com:443?transport=tcp"], username: "u", credential: "c" },
    ]);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe("https://rtc.live.cloudflare.com/v1/turn/keys/key-id/credentials/generate-ice-servers");
    expect(init?.headers).toMatchObject({ authorization: "Bearer secret-token" });
    expect(JSON.parse(String(init?.body))).toEqual({ ttl: 3600 });
  });

  it("falls back to STUN when Cloudflare fails", async () => {
    expect(await getIceServers(keys, respond(500, { error: "boom" }))).toEqual(STUN_ONLY);
    expect(await getIceServers(keys, vi.fn<typeof fetch>(async () => Promise.reject(new Error("offline"))))).toEqual(STUN_ONLY);
    expect(await getIceServers(keys, respond(201, { iceServers: [{ urls: 42 }] }))).toEqual(STUN_ONLY);
  });

  it("falls back to STUN when Cloudflare is too slow", async () => {
    const hang = vi.fn<typeof fetch>(
      (_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason))),
    );
    expect(await getIceServers({ ...keys, timeoutMs: 20 }, hang)).toEqual(STUN_ONLY);
  });

  it("uses STUN without calling Cloudflare when no key is configured", async () => {
    const fetchFn = respond(201, {});
    expect(await getIceServers({}, fetchFn)).toEqual(STUN_ONLY);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
