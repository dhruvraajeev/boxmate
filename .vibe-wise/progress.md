# Learning Progress

## Architecture overview
- Introduced (Claude explained): system decomposed into four decisions: connection/video, detection location, game-state authority, hit/scoring definition; they constrain each other.
- Learner asked for options and tradeoffs before designing; prefers being shown the landscape, then choosing.

## Connection and video
- Introduced (Claude explained): WebRTC peer-to-peer, signaling, TURN relay fallback.
- Options presented: A) WebRTC P2P + own signaling server, B) WebRTC P2P + hosted signaling, C) hosted media platform.
- Learner chose WebRTC P2P for media (rationale not stated beyond "obviously").
- Learner leaned toward cloud/out-of-the-box signaling because they have no hardware to run a server.
- Needs reinforcement: conflated "own server" with "own hardware". Claude explained PaaS/cloud hosting of own code, and that A vs B is about having a place for own logic (ties to game-state authority).
- Risk flagged by Claude: P2P failures on restrictive networks need TURN relay; deferred.

- Learner chose A (own signaling code on a cloud host). Rationale: wants customizability and hands-on experience with cloud providers such as Azure.
- Introduced (Claude explained): signaling payload (SDP offer/answer, ICE candidates), server relays between peers; WebSockets needed for server-initiated push.
- Claude mentioned Azure hosting options (App Service, Container Apps, Web PubSub) as a later deployment decision; not discussed further.

- Product change (learner): no shared link; users click a button and are queued/matched with someone.
- Risk flagged by Claude: random stranger webcam pairing has abuse potential; no accounts means no bans. Unresolved.

## Matchmaking
- Introduced (Claude explained, options + tradeoffs): queue state location (in-memory / shared store like Redis / database), single vs multi-instance scaling; pairing policy (FIFO / region-latency); disconnect detection (close events vs heartbeats) and mid-match leave behavior; rematch semantics (same opponent / requeue / both).

- Learner chose shared store (Redis-style) for queue state; rationale so far: "looks like a nice way". 
- Claude explained: Azure Cache for Redis cost (paid smallest tier) vs self-hosted container; cross-instance message routing needs pub/sub since WebSockets are pinned to an instance.

- Demonstrated understanding: learner reasoned that a shared store lets any server instance reference the queue and find users to match (multi-instance rationale).

- Learner asked how players "live" on instances (guessed lobby page). Claude explained: load balancer, stateless HTTP vs pinned long-lived WebSocket, cross-instance delivery via pub/sub. When the WebSocket opens (page load vs "Find match") is an open design choice.

- Learner proposed: request/response initially instead of WebSocket from page load, then P2P. Correct that WS isn't needed for the lobby.
- Needs reinforcement: learner suggested P2P "during matchmaking"; Claude clarified P2P only exists after server-side matching + relayed handshake.
- Introduced (Claude explained): polling vs WebSocket push for matchmaking/handshake; polling avoids instance pinning and pub/sub; WS is low-latency but needs pub/sub across instances. Whether server connection closes after P2P depends on game-state authority decision.

- Learner proposed a server-side worker handling messaging to the browser. Claude explained servers cannot initiate connections to browsers (NAT/firewall); push requires browser-opened channel (WebSocket, SSE) or polling. Separated "who produces the message" from "how it's delivered".
- Learner idea saved for pairing decision: dedicated matchmaker worker scanning the Redis queue and pairing players (learner-originated concept, refined by Claude; not yet decided).

- Learner asked if WebSocket is best; Claude recommended WebSocket (chatty bidirectional ICE handshake, Redis pub/sub already available, standard for WebRTC signaling), noted polling suits simplest/stateless v1.

- Learner asked why WS over request/response before the match connection. Claude explained: only server→browser direction is the problem; sequential handshake steps stack polling delays (~1.5–3s extra); idle polling load while queued; polling still viable.

- Learner asked what "transport decision" meant; Claude clarified (how server delivers messages to browser during matchmaking/handshake).
- DECIDED (learner): WebSocket opened on "Find match" for matchmaking + handshake; lobby plain HTTP; Redis pub/sub for cross-instance routing (accepted as part of this choice).
- Queue storage = shared store (Redis-style) settled. TTL/expiring queue entries (Claude proposal) deferred to disconnect-handling decision.

- DECIDED (learner): pairing = first come, first served. Rationale: very few users initially; handle the rest when scaling.
- Claude flagged inconsistency: Redis/pub/sub chosen for multi-instance scale vs "few users, scale later" rationale. Offered: keep Redis (learning/Azure experience, scale-ready) vs single instance + in-memory queue behind a swappable interface.

- Learner rationale for Redis: wants to practice scalability with real tools; asked Claude for a balanced offer.
- Claude proposed (not yet accepted): queue/pubsub interface; local Docker Compose with 2 instances + Redis + load balancer to actually exercise cross-instance paths; containerized Redis in Azure initially instead of paid managed tier.

- Constraint (learner): does not want to run anything locally; only has a laptop. Local Docker Compose proposal rejected.
- Claude presented alternatives: A) test multi-instance directly in Azure (scale to 2 when testing), B) cloud dev env (e.g., GitHub Codespaces), C) skip multi-instance testing for now.

- Learner asked for deeper tradeoffs. Claude explained inner loop vs outer loop; compared A/B/C on speed, realism, debugging, cost, learning.
- Demonstrated reasoning: learner independently proposed separate environments (one for fast development, one production-grade for users), based on goal of iterating quickly and shipping to real users.
- CONFIRMED (Design checkpoint): Redis queue + pub/sub; dev env = GitHub Codespaces (2 instances + Redis + simple LB); prod = Azure with containerized Redis initially (Azure service TBD); queue interface; per-environment config via env vars. (Last four were Claude proposals, accepted by learner.)

- Introduced (Claude explained): race conditions, atomic operations, single point of failure.
- Learner briefly re-answered the environment question ("approach B"); Claude clarified it was already confirmed and that pairing has its own A/B.
- Learner asked for details; Claude walked through inline (atomic script, check-then-act gap, crash-after-pop → client timeout/requeue) vs worker (timer/notify, SPOF, redundant workers need lock/leader election, sees whole queue for smarter rules).
- CONFIRMED (learner): dedicated matchmaker worker. Rationale: extensible for rank-based/custom matchmaking and filters. Claude additions accepted: single worker with platform auto-restart (no backup yet); ~250ms timer wake-up.
- Risk flagged by Claude: rank-based matching needs persistent identity; conflicts with no-accounts requirement. Unresolved.

## Disconnect handling
- Introduced (Claude explained): ghost players, heartbeats, timeout-based failure detection ("gone vs slow"), expiring entries covering instance crashes.

- Learner asked which server detects disconnects; Claude clarified: server instances (hold WebSockets) detect and remove from Redis; worker only reads Redis; expiring entries cover instance crashes.

- Learner asked how servers communicate with the queue. Claude explained (per confirmed design, nothing implemented): instances and worker hold network connections to Redis, address via env var, all ops through queue interface; listed each component's operations. Open details: queue entry contents, pub/sub channel addressing (per player vs per instance).

- Learner asked what indicators exist when a laptop lid closes. Claude explained: browser may fire visibilitychange/freeze but JS is suspended and can't reliably notify; no WebSocket close frame/TCP FIN is sent; server sees only silence; TCP keepalive/retransmission timeouts are minutes to hours; proxy/LB idle timeouts may close it eventually; contrast with tab close (immediate close event).

- Learner asked for overview of Azure architecture. Claude summarized from notes: Azure service, prod instance count, load balancer, TURN all undecided.

## Goal change (2026-10-06)
- Learner changed goal: viable MVP out quickly, scale later when needed.
- Claude explained impact: multi-instance is the root decision; Redis, pub/sub, separate worker process, 2-instance Codespaces, and option C's crash coverage all follow from it. Unaffected: WebRTC P2P, WebSocket signaling, FIFO, env-var config. MVP launch risks raised in priority: TURN, stranger abuse.
- No decisions changed yet; learner to decide whether to revisit multi-instance first.
- Learner context: no users yet; MVP will be tested with friends; speed is the priority. Claude explained: signaling load is tiny because video is P2P, so one instance handles far more than a friends test; TURN still matters for some friends' networks; abuse risk lower for friends-only but a public URL is reachable by anyone. Options presented: A) keep multi-instance, B) single instance + in-memory queue behind interface + in-process matchmaking loop, C) same as B without interface.

- DECIDED (learner): option B, single instance + in-memory queue behind interface + in-process matchmaking loop. Rationale not stated beyond goal (MVP fast, scale later).
- CONFIRMED (Design checkpoint): above, plus Claude additions accepted: pairing rule in its own function; send-to-player-by-ID delivery function. Supersedes earlier Redis/pub/sub/worker/2-instance Codespaces decisions (deferred until scaling).

- Learner proposed: A + liveness check right before pairing. Claude evaluated as viable; explained socket state stays "open" after silent drop, so check = ping/pong round trip with timeout (on-demand heartbeat); tradeoffs vs periodic heartbeats (match delayed by timeout on ghost, ghosts linger in queue); drop-after-check needs handling regardless. Asked how to handle players during in-flight check.
- Learner chose B (periodic heartbeats) instead; rationale not stated.

- CONFIRMED (Design checkpoint): heartbeats for queued players. Close events remove immediately. Claude additions accepted: WebSocket protocol ping every 5s, remove after 10s without pong (close socket + remove from queue); browser shows "Connection lost" + Find match on close; scope = queued players only. Known gap: ghost matchable within ~10s window → handshake failure handling needed.

## Mid-match leave
- Introduced (Claude explained): remaining peer detects via WebRTC connection state mid-match; during setup only a timeout reveals failure.
- Learner chose: A + option to requeue (end match, "Opponent left", button to requeue). Rationale not stated.
- CONFIRMED (Design checkpoint): match ends on drop; "Opponent left" + button straight into queue. Claude additions accepted: 15s browser setup timeout ("Couldn't connect to opponent" + requeue); heartbeats continue through setup phase so server notifies remaining player immediately; mid-match drop = WebRTC "failed" or "disconnected" >5s; leaver penalty deferred to scoring.

## Rematch
- Introduced (Claude explained): same-opponent rematch can reuse the existing WebRTC connection; options A) mutual rematch + new opponent, B) new opponent only, C) auto-rematch.
- Learner chose: no rematch for MVP; after a normal match end, players go back to the lobby. Rationale not stated. Drops the "users can rematch" requirement for MVP.

- CONFIRMED (Design checkpoint): no rematch for MVP; normal match end returns both players to lobby. Claude additions accepted: both browsers close peer connection + WebSocket; release webcam; rematch kept as post-MVP requirement.

- CONFIRMED (Design checkpoint, revised for real rules): server is match judge; owns attacker role, turn sequence, score, match start/end; browsers report timestamped direction events. Claude additions accepted: WS + heartbeats open through match; clock sync to server time at match start; server sends turn verdicts to both; match state in server memory; server declares match end → existing cleanup. Tampering caveat acknowledged in summary.

## Simultaneity and turn rules
- Options presented (Claude): A) server beat + timing window, B) hide opponent video around move, C) beat + brief hide, D) no enforcement.
- Learner clarified rule: both players alternate attacker/defender; attacker keeps attacking ("swiping") as long as the defender keeps "biting" (looking the same way); first dodge swaps roles. Claude asked what a bite earns (point vs progress to kill shot) since pasted rules said a bite wins the round.
- Learner clarified: attacker keeps attacking until 3 consecutive bites. Claude assumption stated (unconfirmed): 3rd consecutive bite = kill shot = match win; dodge resets streak and swaps roles.
- Demonstrated reasoning (learner): timing leeway should exist but be smaller than the time needed to see the attacker's move and react. Claude explained window bounds: upper ≈ video delay + reaction (~350ms), lower = detection lag + clock sync error + human timing variance. Options re-shown; learner's constraint matches A's mechanism.
- Learner requirement: fast-paced, no pauses between turns or swings. Claude explained: continuous tempo (server schedules beats ahead, browsers play from synced clock) instead of per-turn countdown; verdict deadline: window close + event→server + verdict→browsers (~400ms) must finish before next beat since roles may swap, bounding tempo to roughly ≥~1s; B/C's video cover and replays add pauses.
- Learner chose: A on a steady tempo; late move loses the beat. Rationale: fast-paced, no pauses.
- CONFIRMED (Design checkpoint): 1 beat/s, ±150ms window (max 300ms gap), both tunable via config; late defender = bite, late attacker = dodge, both late = no change; first in-window move counts; server waits ~150ms grace for in-window events then rules; one-time count-in at match start; verdict display (BITE n/3, DODGED → you attack). Claude additions accepted; early moves also miss.

## Detection
- Introduced (Claude explained): in-browser landmark detection (MediaPipe), landmarks → direction rules. Options: A) own camera, B) opponent's received video, C) server.
- Learner chose A (each browser detects on its own camera). Rationale not stated.

- CONFIRMED (Design checkpoint): Claude additions accepted: MediaPipe hand + face landmarkers in browser, both running all match; neutral pose calibrated during count-in; config threshold from neutral; left/right compared in shared space (attacker's right = defender's left); one report per beat {beat number, direction, server-time timestamp}.

## Match rules
- Learner confirmed: 3rd consecutive bite (kill shot) ends the match; that attacker wins.

- CONFIRMED (Design checkpoint): Claude additions accepted: server picks first attacker at random; leaver → remaining player sees "Opponent left: you win"; no results stored.

## Stack
- Options presented: A) Node.js + TypeScript, B) Python, C) Go. Learner chose A. Rationale not stated; language familiarity not stated.

- CONFIRMED (Design checkpoint): Claude additions accepted: current Node LTS; `ws` library; one repo with server/, web/, shared/; same Node process serves lobby + WebSocket; Vitest, starting with judge logic.

## Frontend
- Learner deferred to Claude's recommendation. CONFIRMED (Design checkpoint): plain TypeScript + Vite in web/ using shared/; one screen controller (lobby → finding match → match → result); media/WebRTC/detection/beat-clock modules separate from screens, emitting events; HTML overlay on video.

- Learner chose: finish the design first (TURN, Azure hosting, stranger abuse, kill-shot photo) before building.

## TURN relay
- Learner asked why TURN is needed. Introduced (Claude explained): NAT, STUN discovering public address, hole punching, cases where it fails (address-per-destination NAT, UDP-blocking networks, carrier-grade NAT); TURN relays media via outbound connections; rough 10-20% estimate; relay carries real bandwidth (cost); extra hop adds latency relevant to the ±150ms window; without TURN failure surfaces as the 15s setup timeout.

- Learner chose B (managed TURN service). Provider leaning Cloudflare (not final); rationale: believes it has a good free tier.
- Claude verified (Cloudflare docs, 2026-10-12): $0.05/GB egress after 1,000 GB/month free (shared with SFU); STUN free. Claude explained: credentials must be short-lived and minted by the server since the API token can't ship to browsers.

- CONFIRMED (Design checkpoint): managed TURN service (provider leaning Cloudflare, not final). Claude additions accepted: server mints per-match credentials via provider API (token in env var), sent in "match found" message; ~1h TTL (matches have no time cap); provider call behind one credentials function; mint failure → STUN-only, 15s timeout handles the rest.

## Azure hosting
- Options presented (Claude): A) App Service, B) Container Apps, C) VM; shared constraints: exactly one instance, HTTPS for webcam, deploy drops players.
- Learner narrowed to App Service vs Container Apps; asked about App Service scope. Claude explained (correcting earlier implied framing): App Service can run custom containers; plan-based fixed billing; HTTP-only inbound; Always On from Basic; Redis needs a separate service; Container Apps = per-second billing, scale to zero, internal TCP.
- DECIDED (learner): Azure Container Apps. Rationale: flexibility + cheaper pricing.
- CONFIRMED (Design checkpoint): Claude additions accepted: min=max=1 replica; 0.25 vCPU / 0.5 GiB; GitHub Container Registry; GitHub Actions build+deploy on push to main; TURN API token as Container Apps secret → env var; single-revision mode (deploy overlap, old players dropped); Azure budget alert (~$10/month).

## Stranger abuse
- DECIDED (learner): defer abuse protection/banning until after MVP. Rationale: priority is shipping the MVP.
- Claude flagged residual risk: public URL + random webcam pairing reachable by anyone (not just friends). Offered optional non-banning mitigation: shared access code gating "Find match" during friends testing. Learner declined: keep the site fully open for MVP (risk acknowledged).

## Kill-shot photo
- DECIDED (learner): defer post-MVP. Design phase complete for MVP.

## Build plan
- Learner priority: first test the actual webcam connection; build game features on top afterward.
- Options presented (Claude) for first build slice: A) video only (lobby → queue → pair → signaling relay → P2P video, tested from Codespaces public port), B) A + TURN credentials + connection-failure handling, C) A + deploy to Azure Container Apps.

- DECIDED (learner): build in progression A → B → C.

- IMPLEMENTED slice A (2026-10-12): server/ (app, queue + interface, FIFO rule, matchmaker loop, PlayerConnections.sendToPlayer, Matches, message validation, static serving), web/ (screens, media, signaling, peer, main controller), shared/protocol.ts, .devcontainer, README. Added beyond agreed scope (reported): Cancel button on finding screen, Leave button in match (both run the agreed match-end cleanup); video-only, no audio (not a confirmed decision; flagged to learner).
- Verified: tsc clean; 9 Vitest tests pass (queue/pairing, two-client match + relay, disconnected player not matched, invalid messages dropped, static serving); headless Chrome e2e with fake cameras: two tabs matched, WebRTC connected, 640x480 remote video both ways, Leave returns to lobby + clears video, requeue matched with a third tab. Not verified: real webcams, different networks, Codespaces.
- Known gap (slice B scope): when a player leaves, the opponent's screen still says "Connected" (no Opponent left message).

## Pending decision
- Next: learner tests slice A in Codespaces; then slice B (TURN credentials, heartbeats, 15s setup timeout, Opponent left), then C (deploy).
- Open question raised: audio on/off (currently video only).
- Not committed/pushed yet; awaiting learner request.
