# Project Map

## Purpose
boxmate: a website where two people "shadow box" each other live, without physical contact.

## Requirements
- Two users join the same live session. Updated by learner: no shared link; a user clicks a button and is queued/matched with another waiting user.
- Each user sees the other in real time via webcam.
- Game (learner-specified 2026-10-06): Shadow Boxing / "Ish" / Pointing Game. Turn-based: attacker points left/right/up/down; defender turns head at the same moment (no reacting). Same direction = "bite": attacker keeps attacking; 3 consecutive bites = kill shot = attacker wins, match ends (confirmed). Different direction = dodge: streak resets, roles swap.
- The site detects the attacker's pointing direction and the defender's head-turn direction.
- Possible feature: "kill shot" photo at the winning point (deferred post-MVP 2026-10-12).
- The site shows feedback or scoring based on the exchange.
- A session has a clear start and end (e.g., timed rounds).
- Post-MVP: users can rematch afterward (dropped for MVP 2026-10-06).
- No account or install required.
- Goal (2026-10-06): viable MVP quickly, tested with friends; scale later when needed.

## Components
Slice A (video only) implemented 2026-10-12; slices B (reliability) and C (deploy) not started.
- Media transport: WebRTC peer-to-peer between the two browsers; server-assigned initiator sends offer; Cloudflare public STUN (implemented: web/peer.ts)
- Signaling + matchmaking server: learner's own server code, single instance for MVP, deployed to Azure Container Apps (chosen; not implemented)
- Matchmaking queue: in-memory in the server process, accessed only through a queue interface (add/remove/find pair) so a Redis implementation can replace it later (implemented: server/queue.ts)
- Matchmaking loop: timer (~250ms) inside the server process; pairing rule kept in its own function for future rank/filter matching (implemented: server/matchmaker.ts, server/pairing.ts)
- Message delivery: send-to-player-by-ID function instead of direct socket writes, so Redis pub/sub can plug in when scaling (implemented: server/connections.ts)
- Queue disconnect detection: WebSocket close events remove immediately; protocol ping every 5s, remove after 10s without pong; browser shows "Connection lost" + Find match (chosen; not implemented)
- Opponent drop handling: match ends; "Opponent left" / "Couldn't connect to opponent" + button straight into queue; 15s browser setup timeout; heartbeats continue through setup; mid-match drop = WebRTC "failed" or "disconnected" >5s (chosen; not implemented)
- Match end: both browsers close peer connection + WebSocket, release webcam, return to lobby; no rematch in MVP (chosen; not implemented)
- Match judge: server owns attacker role, turn sequence, score, match start/end; browsers report timestamped direction events; clock sync to server time at match start; WS + heartbeats open through match; verdicts sent to both; state in memory (chosen; not implemented)
- Beat timing: server-set steady tempo (1 beat/s), browsers play beats from synced clock; ±150ms window (config); early/late = miss; late defender = bite, late attacker = dodge, both late = no change; first in-window move counts; server ~150ms grace then rules; one-time count-in; BITE n/3 / DODGED feedback (chosen; not implemented)
- Detection: each browser on its own camera; MediaPipe hand + face landmarkers running all match; neutral pose calibrated during count-in; config threshold; left/right compared in shared space (attacker's right = defender's left); one report per beat {beat number, direction, server-time timestamp} (chosen; not implemented)
- Match rules: server picks first attacker at random; 3rd consecutive bite ends match; leaver → "Opponent left: you win"; no results stored (chosen; not implemented)
- Stack: Node.js (current LTS) + TypeScript server using `ws`; one repo with server/, web/, shared/; same process serves lobby + WebSocket; Vitest tests (implemented for queue/pairing/signaling; judge not built yet)
- Frontend: plain TypeScript + Vite in web/; one screen controller (lobby → finding match → match → result); media/WebRTC/detection/beat-clock modules separate from screens, emitting events; HTML overlay on video (screens + media/signaling/peer modules implemented; detection/beat clock not built)
- Browser↔server transport: plain HTTP for lobby; WebSocket opened on "Find match" (opening it = joining queue) for matchmaking + WebRTC handshake (implemented)
- TURN relay: managed service (likely Cloudflare; ~1,000 GB/month free, then $0.05/GB); server fetches ~1h per-match credentials with API token from env var, sends them in "match found"; provider behind one credentials function; fetch failure → STUN only (chosen; not implemented)
- Deferred until scaling: multiple instances, Redis queue, Redis pub/sub, dedicated matchmaker worker process, load balancer

## Main Flow (chosen; implemented through P2P video in slice A)
Lobby page (HTTP) → click "Find match" → browser opens WebSocket to the server → server adds player to in-memory queue → matchmaking loop pairs first come, first served → server notifies both players over WebSocket → offer/answer/ICE relayed via server → WebRTC P2P video between browsers → server-judged turns (attacker points, defender turns head; steady beat + ±150ms window) → server declares winner → match end → back to lobby

## Data and Trust Boundaries
- Browsers untrusted: server validates WebSocket messages (server/messages.ts), 64 KB message cap; relays signaling only to the matched opponent.
- Static serving restricted to dist/web.

## Build and Deployment
npm scripts: dev (vite build --watch + tsx watch, one port), test, typecheck, build, start. .devcontainer uses Node 24 and forwards port 3000. Azure deploy not configured yet. Constraint: learner does not want to run anything on their laptop.
- Dev environment (chosen): GitHub Codespaces running a single server process.
- Prod environment (chosen): Azure Container Apps, min=max=1 replica, 0.25 vCPU / 0.5 GiB, single-revision mode; image in GitHub Container Registry; GitHub Actions builds + deploys on push to main; TURN API token as Container Apps secret → env var; Azure budget alert (~$10/month).
- Config: per-environment settings via environment variables (chosen).
- Known consequence: server restart drops all queued/handshaking players (their WebSockets close).
- Architecture visual: docs/architecture.pdf, built from docs/architecture.html via `sh docs/build-architecture-pdf.sh`; update on every design change (learner request 2026-10-10).

## Unknowns
- TURN provider final pick (leaning Cloudflare)
- Stranger-abuse risk with public URL: deferred post-MVP by learner (2026-10-12); site fully open, no access code
