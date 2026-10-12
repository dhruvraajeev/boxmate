import type { IceServer } from "../shared/protocol";

/** Used alone when relay credentials are unavailable: direct video still works on most networks. */
export const STUN_ONLY: IceServer[] = [{ urls: "stun:stun.cloudflare.com:3478" }];

export interface TurnConfig {
  keyId?: string;
  apiToken?: string;
  // 1 hour: matches have no time limit, and credentials that expire mid-match can drop a relayed call.
  ttlSeconds?: number;
  timeoutMs?: number;
}

/**
 * Gets short-lived TURN relay credentials from Cloudflare for one match. The API token stays on the server;
 * only the generated credentials reach the browser. Never throws: any failure means STUN only, and the
 * browser's setup timeout catches players who then can't connect. Switching relay provider means replacing this.
 */
export async function getIceServers(
  { keyId, apiToken, ttlSeconds = 3600, timeoutMs = 3000 }: TurnConfig,
  fetchFn: typeof fetch = fetch,
): Promise<IceServer[]> {
  if (!keyId || !apiToken) return STUN_ONLY;
  try {
    const url = `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`;
    const response = await fetchFn(url, {
      method: "POST",
      headers: { authorization: `Bearer ${apiToken}`, "content-type": "application/json" },
      body: JSON.stringify({ ttl: ttlSeconds }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`Cloudflare responded ${response.status}`);
    const servers = parseIceServers(await response.json());
    if (servers.length === 0) throw new Error("Cloudflare returned no usable ICE servers");
    return servers;
  } catch (error) {
    console.warn("TURN credentials unavailable, using STUN only:", error instanceof Error ? error.message : error);
    return STUN_ONLY;
  }
}

// Browsers block port 53, so those URLs only add failed connection attempts.
const PORT_53 = /:53(?:[/?]|$)/;

/** Keeps only well-formed entries from Cloudflare's response ({ iceServers: [...] }, or a single object). */
function parseIceServers(body: unknown): IceServer[] {
  const raw = (body as { iceServers?: unknown } | null)?.iceServers;
  const entries: unknown[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const servers: IceServer[] = [];
  for (const entry of entries) {
    if (typeof entry !== "object" || entry === null) continue;
    const { urls, username, credential } = entry as Record<string, unknown>;
    const list = (Array.isArray(urls) ? urls : [urls]).filter(
      (u): u is string => typeof u === "string" && !PORT_53.test(u),
    );
    if (list.length === 0) continue;
    servers.push({
      urls: list,
      ...(typeof username === "string" ? { username } : {}),
      ...(typeof credential === "string" ? { credential } : {}),
    });
  }
  return servers;
}
