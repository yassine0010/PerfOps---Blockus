# Online Blokus — Technical Architecture & SRE Playbook

**Goal:** a real 2–4 player online Blokus-style game (room creation, join-by-code, live board sync) built specifically so the backend can be load tested and used as an SRE practice ground at **thousands of concurrent connections**.

This doc treats the game as a vehicle. Every decision is made twice: "does this make a good game" and "does this give me something interesting to break, measure, and scale."

---

## 1. What we're actually building

| Layer | Choice | Why |
|---|---|---|
| Transport | **WebSockets**, custom server | See §2 — this is the load-bearing decision |
| Server runtime | **Node.js (uWebSockets.js)** or **Go** | Both handle 10k+ sockets/box; pick based on which language you want to be fluent debugging under load |
| Room state | **In-memory per-process**, sharded by room ID | No DB round-trip per move; makes latency and scaling behavior legible |
| Persistence | **Redis** (room registry, pub/sub for scale-out) + **Postgres** (finished games, users, analytics) | Redis = ephemeral fast path, Postgres = durable slow path |
| Horizontal scaling | **Multiple stateful game-server pods + Redis pub/sub for cross-instance room routing** | This is the actual SRE exercise |
| Load balancer | L4/L7 LB with **sticky sessions** (or a routing layer, see §5) | WebSockets need connection affinity |
| Load testing | **k6** (or **Artillery**) with a custom WS scenario + a headless bot client that plays legal moves | Realistic traffic, not just connection floods |
| Observability | **Prometheus + Grafana**, **OpenTelemetry** traces, structured logs → Loki | Standard SRE stack, all self-hostable |

---

## 2. Why WebSockets (the recommendation you asked for)

You want to load test *your own infrastructure decisions* — connection handling, memory per connection, broadcast fan-out, backpressure, reconnect storms. A managed realtime service (Supabase/Firebase/Ably) hides exactly the mechanics you want to stress-test: you'd be load testing *their* service, not learning how to run one.

**WebSockets over a custom server gives you:**
- Full control of connection lifecycle → you can simulate slow clients, half-open connections, reconnect storms
- Real memory-per-connection cost to measure and tune
- A genuine horizontal-scaling problem (state doesn't live in one process anymore once you scale out) → forces you to build the Redis pub/sub layer, which is *the* interesting SRE problem here
- Full visibility into your own metrics, no black-box vendor dashboard

**Trade-off you're accepting:** you own reconnection logic, heartbeats, and scale-out routing yourself. That's the point.

**Why not raw TCP or gRPC streaming:** WebSockets are the natural fit for browser clients and are still complex enough to be a real engineering exercise (framing, ping/pong, backpressure) without needing a custom protocol.

---

## 3. Game domain model

### 3.1 Core entities

```
Room
  - id (6-char join code, e.g. "K3P9QX")
  - players: [Player] (2-4)
  - board: 20x20 grid, cell = null | PlayerColor
  - piecesRemaining: { [playerColor]: PieceId[] }  // 21 pieces per player
  - currentTurn: PlayerColor
  - status: WAITING | IN_PROGRESS | FINISHED
  - createdAt, lastActivityAt
  - hostId

Player
  - id (session-scoped, not necessarily authenticated)
  - color: RED | BLUE | GREEN | ORANGE
  - connectionId (maps to a live WS connection, or null if disconnected)
  - hasPassed: bool (for this game — no legal moves left)

Move
  - playerId, pieceId, rotation, flip, boardPosition (x,y)
  - serverTimestamp
  - sequenceNumber (monotonic per room — critical for replay/debugging under load)
```

### 3.2 Move validation (authoritative, server-side only)

Never trust the client for placement legality — this also matters for load testing, because invalid-move floods are a realistic attack/abuse pattern you'll want your server to reject cheaply.

Validation order (cheapest checks first, to minimize CPU per request under load):
1. Is it this player's turn? (O(1) — reject fast)
2. Does the player still have this piece? (O(1) set lookup)
3. Is placement in-bounds? (O(cells in piece), ~5 cells avg)
4. Are all target cells empty? (O(cells in piece))
5. First move only: does it touch the player's starting corner? (O(1))
6. Non-first move: does it touch ≥1 same-color corner and touch **zero** same-color edges? (O(cells in piece × 8 neighbors) — the most expensive check, still trivially cheap, <1µs)

This is intentionally cheap per-move (~microseconds) so that under load test, your bottleneck is *connection/broadcast handling*, not game logic — which is what you actually want to be measuring.

---

## 4. Real-time protocol

### 4.1 Message envelope

```json
{
  "type": "MOVE" | "JOIN_ROOM" | "STATE_SYNC" | "CHAT" | "PING" | ...,
  "seq": 1234,
  "payload": { ... },
  "ts": 1732800000000
}
```

`seq` is per-connection, monotonic, used for de-duplication and reconnect resume — important once you start testing reconnect storms and message replay.

### 4.2 Key message types

| Type | Direction | Purpose |
|---|---|---|
| `CREATE_ROOM` | C→S | Returns join code |
| `JOIN_ROOM` | C→S | Validates code, assigns color slot |
| `STATE_SYNC` | S→C | Full room state (sent on join/reconnect) |
| `MOVE` | C→S | Proposed move |
| `MOVE_ACCEPTED` / `MOVE_REJECTED` | S→C | Broadcast to room / unicast to sender |
| `TURN_CHANGED` | S→C (broadcast) | Whose turn it is now |
| `PLAYER_DISCONNECTED` / `RECONNECTED` | S→C (broadcast) | Presence |
| `GAME_OVER` | S→C (broadcast) | Final scores |
| `PING` / `PONG` | bidirectional | Liveness + latency measurement |

### 4.3 Reconnection

Room state lives server-side; a reconnecting client sends `JOIN_ROOM` with their existing player token and gets a full `STATE_SYNC`. No client-side state is authoritative. This is deliberately simple (full resync, not delta patching) — delta sync is a good "v2 optimization" you can load-test the *before/after* of.

---

## 5. Scaling architecture (the SRE core)

### 5.1 Single-instance ceiling

A single Node.js process with `uWebSockets.js` (or Go with `gorilla/websocket` / `nhooyr.io/websocket`) can realistically hold **10k–50k idle WebSocket connections** depending on box size, but your actual ceiling for *this workload* is dominated by:
- Broadcast fan-out cost (每 move in a 4-player room broadcasts to 3 others — cheap, O(players))
- Heartbeat/ping overhead at scale (10k connections × ping every 30s = real steady background load)
- Memory per connection (buffers, per-room state) — measure this, don't assume it

**Target for "thousands of concurrent connections":** this is comfortably single-box territory for raw connection count. The interesting exercise is proving that, then deliberately going past it.

### 5.2 Horizontal scale-out design

```
                    ┌─────────────┐
 Client ──WS──►     │   LB (L4)   │  sticky by room-id hash or connection
                    └──────┬──────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
   ┌───────────┐    ┌───────────┐    ┌───────────┐
   │ Game Node 1│    │ Game Node 2│    │ Game Node 3│   (stateful, holds room state in memory)
   └─────┬─────┘    └─────┬─────┘    └─────┬─────┘
         │                │                │
         └────────────────┼────────────────┘
                           ▼
                  ┌─────────────────┐
                  │  Redis Pub/Sub   │  cross-node room event relay
                  │  + Room Registry │  roomId -> which node owns it
                  └─────────────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │    Postgres      │  durable: finished games, users
                  └─────────────────┘
```

**Room ownership model:** each room is "owned" by exactly one game node (the node the host connected to). The LB doesn't need to be room-aware if you use a **routing layer**: on `JOIN_ROOM`, any node can receive the request, look up room ownership in Redis, and either handle it locally or proxy the WS frame to the owning node via Redis pub/sub (or a lightweight internal RPC). This avoids needing perfectly sticky LB routing and is a good "chaos test" target — kill the owning node and watch reconnect + room migration behavior.

**Simpler alternative (recommended to start):** sticky sessions at the LB (hash room-id or a cookie), so all players in a room always land on the same node. Add the Redis-relay layer *later* as a deliberate v2 exercise once you've measured the sticky-session-only ceiling.

### 5.3 What actually breaks first (things to load-test for)

| Failure mode | How to trigger it | What you'll learn |
|---|---|---|
| **Connection exhaustion** | Ramp WS connections past ulimit/file-descriptor limits | OS tuning (`ulimit -n`, ephemeral port range) |
| **Broadcast amplification** | Many rooms, all moving simultaneously | CPU spent in JSON serialization/fan-out |
| **Heartbeat storm** | 10k+ connections all pinging on the same interval | Stagger pings; measure GC pauses from timer churn |
| **Thundering herd reconnect** | Kill a node with 1000s of connections | Reconnect backoff/jitter design |
| **Redis pub/sub backpressure** | Flood cross-node moves | Redis as single point of contention |
| **Memory leak per room** | Long-running load test, rooms never cleaned up | Room TTL / reaper job correctness |
| **Head-of-line blocking** | One slow/malicious client in a room | Per-connection write buffering, timeouts |

This table **is** your load-test plan — each row becomes a k6/Artillery scenario.

---

## 6. Load testing design

### 6.1 Why generic HTTP load tools don't work here

k6/Artillery's HTTP mode won't exercise WS semantics (persistent connection, bidirectional messages, room-scoped broadcast). You need a **stateful bot client** that:
1. Opens a WS connection
2. Creates or joins a room
3. Plays legal (or intentionally illegal, for negative testing) moves at a realistic cadence
4. Holds the connection open for a realistic session length
5. Optionally disconnects/reconnects to simulate churn

### 6.2 Recommended tool: k6 with the `xk6-websockets` extension

```js
// simplified sketch — real version needs full move-generation logic
import ws from 'k6/x/websockets';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    ramp_rooms: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 1000 },   // ramp to 1000 concurrent players
        { duration: '5m', target: 4000 },   // push to thousands
        { duration: '3m', target: 4000 },   // soak
        { duration: '2m', target: 0 },      // drain
      ],
    },
  },
};

export default function () {
  const socket = ws.connect('wss://game.example.com/ws', {}, function (socket) {
    socket.on('open', () => {
      socket.send(JSON.stringify({ type: 'JOIN_OR_CREATE_ROOM' }));
    });
    socket.on('message', (data) => {
      const msg = JSON.parse(data);
      if (msg.type === 'YOUR_TURN') {
        sleep(randomThinkTime());       // simulate human pacing, not a tight loop
        socket.send(JSON.stringify(nextLegalMove(msg.state)));
      }
    });
  });
}
```

**Key design choices for the load generator:**
- **4 bots per room, not 1** — you want to generate real room-shaped traffic (broadcast fan-out included), not just raw connection count
- **Randomized think-time** between moves (1–8s) — a tight loop tests something closer to a DoS than realistic usage; run both as separate scenarios
- **A subset of bots deliberately disconnect/reconnect** mid-game — this is what actually breaks systems that only get tested against a clean ramp
- **Separate scenario for illegal-move flooding** — tests validation-layer cost under abuse, independent of legitimate game traffic

### 6.3 Metrics to capture during a run

| Metric | Source | What it tells you |
|---|---|---|
| Active WS connections | Server-side gauge | Are you actually reaching target scale |
| Move round-trip latency (send → broadcast received) | Client-side timestamp diff | Real player-facing responsiveness |
| Broadcast fan-out latency | Server-side, per-room | Cost of your broadcast implementation |
| CPU / memory per game-node pod | Prometheus node exporter | Where the ceiling actually is |
| Redis pub/sub latency | Redis `INFO`, custom histogram | Cross-node relay cost |
| GC pause time (Node) / GC stats (Go) | Runtime metrics | Whether connection churn causes GC pressure |
| Error rate (rejected moves, dropped connections) | Server logs / Prometheus counter | Correctness under load, not just throughput |
| Reconnect success rate after kill | Custom test harness | Resilience, not just performance |

---

## 7. Observability stack

```
Game Node ──(metrics)──► Prometheus ──► Grafana dashboards
Game Node ──(traces)───► OpenTelemetry Collector ──► Jaeger/Tempo
Game Node ──(logs)─────► Loki (structured JSON logs, room_id + seq in every line)
```

**Minimum dashboard panels for the load test:**
- Active connections (total, per node)
- Active rooms (total, per node)
- Move validation latency (p50/p95/p99)
- Broadcast latency (p50/p95/p99)
- WS connection error rate
- Node CPU / memory / GC
- Redis pub/sub throughput and latency

**Structured logging convention:** every log line includes `room_id`, `player_id`, `seq`, `node_id` — this is what makes debugging a failure *found during load testing* tractable instead of a grep nightmare across thousands of connections.

---

## 8. Suggested build order

1. **Single-node game server** — rooms, moves, validation, broadcast. No Redis, no scale-out. Get correctness right first.
2. **Bot client + k6 harness** — load test the single node to find its real ceiling (connections, CPU, memory).
3. **Add Prometheus/Grafana** — you can't do SRE work you can't measure.
4. **Horizontal scale-out** (Redis pub/sub + room registry) — only after you've proven and documented the single-node ceiling.
5. **Chaos exercises** — kill nodes mid-load-test, inject latency into Redis, saturate one node's connections — and see what actually happens vs. what you designed for.
6. **(Optional) frontend polish** — real board rendering, piece rotation UI — this can happen in parallel with 1–3 since it doesn't block the backend work.

---

## 9. Phase 2 — HTTP API, accounts, and caching

Everything above (§1–8) is **Phase 1**: a pure WebSocket game server, no accounts, no persistence beyond live room state. Build and load-test that first. Phase 2 below is what you add *after* Phase 1 is solid — it introduces normal HTTP request/response traffic alongside the WebSocket traffic, which is a genuinely different half of the system and should be treated as such.

### 9.1 Why this is a separate process, not bolted onto the game server

The WebSocket game server's whole job is holding many long-lived connections and broadcasting between them fast. An HTTP API server's job is answering normal request/response questions like "what's my win rate" or "log me in." These have different scaling behavior, different failure modes, and different load-testing needs — mixing them into one process makes both harder to reason about and harder to load test independently.

So: **run them as two separate processes** (can live on the same box initially, split onto separate machines later exactly the way the game server itself would scale out).

```
                    ┌─────────────────────────────┐
Client ──HTTP──►    │  nginx                       │
Client ──WS────►    │  - serves static frontend     │
                    │  - caches GET /leaderboard     │
                    │  - caches GET /profile/:id      │
                    │  - never caches POST /login      │
                    │  - rate-limits everything          │
                    └──────────┬──────────┬─────────┘
                               │          │
                    (HTTP)     ▼          ▼   (WS upgrade)
                    ┌──────────────┐  ┌──────────────┐
                    │  API server   │  │ Game server  │
                    │  - profiles   │  │ - rooms      │
                    │  - leaderboard│  │ - moves      │
                    │  - auth       │  │ - broadcast  │
                    └──────┬───────┘  └──────┬───────┘
                           │                  │
                           ▼                  ▼
                    ┌──────────────┐  ┌──────────────┐
                    │  Postgres     │  │  Redis        │
                    │  (durable:    │  │  (live room   │
                    │  users, stats,│  │  state)       │
                    │  finished     │  │              │
                    │  games)       │  │              │
                    └──────────────┘  └──────────────┘
```

### 9.2 New endpoints and how each is treated

| Endpoint | Method | Cacheable? | Notes |
|---|---|---|---|
| `/api/profile/:id` | GET | **Yes** | Player's stats/history — changes only when they finish a game, safe to cache briefly |
| `/api/leaderboard` | GET | **Yes** | Doesn't need to be accurate to the second; short cache window is fine |
| `/api/login` | POST | **Never** | A write/auth action — caching a login response would be a serious security bug (could serve one user's session to another) |

**General rule going forward, not just for these three:** any `GET` that returns data which is safe to be slightly stale is a caching candidate. Any `POST`/`PUT`/`DELETE` — anything that *changes* something or handles credentials — is never cached, full stop.

### 9.3 nginx caching config for the two GET endpoints

```nginx
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=api_cache:10m max_size=100m;

server {
    location /api/leaderboard {
        proxy_cache api_cache;
        proxy_cache_valid 200 30s;      # stale-for-30s is fine for a leaderboard
        proxy_pass http://api_backend;
    }

    location /api/profile/ {
        proxy_cache api_cache;
        proxy_cache_valid 200 60s;      # profile data changes less often than the leaderboard
        proxy_pass http://api_backend;
    }

    location /api/login {
        proxy_pass http://api_backend;  # no proxy_cache directive at all — never cached
    }
}
```

The first request in each cache window actually reaches the API server and Postgres; every request after that within the window is served straight from nginx's memory, with zero backend load. For read-heavy, rarely-changing data like this, that's a large amount of real backend load removed for free.

### 9.4 Where Postgres comes back in, and why it didn't belong in Phase 1

Postgres was deliberately cut from Phase 1 — there was nothing durable to store yet, and adding it would've meant setting up a database with no actual job. Phase 2 gives it a real, specific job:

| Table | Holds | Written when |
|---|---|---|
| `users` | Login credentials (hashed), display name | Account creation |
| `game_history` | Finished games — final board, winner, players | A game ends |
| `player_stats` | Aggregated wins/losses/games played | A game ends (updated) |

None of this touches live gameplay — a game in progress still lives entirely in Redis/memory exactly as in Phase 1. Postgres is only written to **after** a game finishes, and read from by the new API server for profile/leaderboard requests. This keeps the fast, latency-sensitive path (live moves) completely separate from the slower, durable path (stats and history) — a game move never waits on a database write.

### 9.5 Auth — kept intentionally simple

`/api/login` should do the minimum needed to identify a player across sessions: verify credentials against `users`, then issue a signed session token (e.g., a JWT or an opaque token stored server-side) that the client includes when it later opens its WebSocket connection, so the game server knows who's connecting without needing its own separate login system. Auth logic lives entirely in the API server — the game server only ever *validates* a token it's handed, it never issues one.

### 9.6 Build order for Phase 2

1. Stand up the API server as its own process, with just `/api/login` and a `users` table in Postgres — get accounts working end to end first.
2. Add `game_history` and `player_stats` writes, triggered when the game server reports a finished game (simplest: game server calls the API server, or both write to Postgres directly — either is fine at this scale).
3. Add `/api/profile/:id` and `/api/leaderboard` reading from those tables.
4. Add nginx caching on those two `GET` endpoints last, once they're working uncached — caching should be the final layer on top of already-correct behavior, not something you debug through.

---

## 10. Open decisions for you to make

- **Node.js vs Go for the game server** — Node is faster to iterate on for game logic; Go typically gives more predictable latency under connection load (no GC pause spikes the same way). Recommend: Go if the SRE/perf side is the priority, Node if you want to move faster on game logic first and revisit language later.
- **Sticky sessions vs. Redis-relay from day one** — recommend starting sticky, adding the relay layer deliberately later as its own milestone (see §5.2).
- **Where to run this** — a single beefy VM is enough to hit "thousands of connections"; you don't need Kubernetes to prove the SRE concepts, though a k8s deployment is a reasonable stretch goal once the core is stable, since pod kill/restart behavior is itself a good chaos scenario.
