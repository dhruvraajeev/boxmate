# boxmate

Shadow box someone live over webcam. Design: [`docs/architecture.pdf`](docs/architecture.pdf).

## Run it (GitHub Codespaces)

1. Open the repo in a Codespace. The dev container installs Node 24 and the dependencies.
2. `npm run dev`. This rebuilds the web app and restarts the server whenever code changes.
3. Open the forwarded port **3000** from the Ports tab.
4. To let a friend join, right-click port 3000 → **Port Visibility → Public** and send them the link.
   Webcams only work on HTTPS, which the Codespaces link provides.

Two tabs on the same machine also work for a quick test. Each tab is a separate player.

### TURN relay (optional in dev)

Some networks (mobile data, strict school/office Wi-Fi) block direct video. The server then hands out Cloudflare
TURN relay credentials, which needs two environment variables:

| Variable | What it is |
|---|---|
| `TURN_KEY_ID` | Cloudflare TURN key ID |
| `TURN_KEY_API_TOKEN` | That key's API token. Server only: never commit it or send it to the browser |

In Codespaces, add both as [Codespaces secrets](https://github.com/settings/codespaces) for this repo and restart the
Codespace. Without them the server logs a warning and uses STUN only.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Web app rebuild on change + server with auto-restart |
| `npm test` | Vitest tests (queue, pairing, matchmaking + signaling, heartbeats, TURN credentials) |
| `npm run typecheck` | TypeScript check for server, web, and shared code |
| `npm run build` / `npm start` | Build the web app once / run the server |

## Layout

- `server/`: HTTP + WebSocket server: matchmaking queue, pairing, signaling relay
- `web/`: browser app (plain TypeScript + Vite): screens, camera, WebRTC
- `shared/`: message types used by both
