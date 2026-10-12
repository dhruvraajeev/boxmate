import { fileURLToPath } from "node:url";
import { createApp } from "./app";
import { getIceServers } from "./turn";

const port = Number(process.env.PORT ?? 3000);
const staticDir = fileURLToPath(new URL("../dist/web", import.meta.url));

// The token never leaves the server: browsers only get the short-lived credentials Cloudflare generates from it.
const turn = { keyId: process.env.TURN_KEY_ID, apiToken: process.env.TURN_KEY_API_TOKEN };
if (!turn.keyId || !turn.apiToken) console.warn("TURN_KEY_ID / TURN_KEY_API_TOKEN not set: STUN only, strict networks won't connect");

const app = createApp({ staticDir, getIceServers: () => getIceServers(turn) });
app.http.listen(port, () => {
  console.log(`boxmate listening on http://localhost:${port}`);
});
