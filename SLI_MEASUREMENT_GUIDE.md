# 📐 SLI Measurement & Prometheus Metrics Specification

This document details how each **Service Level Indicator (SLI)** is measured across the codebase, the exact source files responsible, the runtime logic, what values are exposed to Prometheus on `GET /metrics`, and how k6 load testing observes each SLI.

---

## 🧭 Executive Summary Table

| SLI | Metric Name | Metric Type | Measurement Point | Source Files |
| :--- | :--- | :--- | :--- | :--- |
| **SLI-1** Availability | `blokus_app_actions_total`<br>`blokus_app_actions_success_total` | Counter<br>Counter | Client Beacons (`navigator.sendBeacon`) + Backend 15s Watchdog | • `client/src/utils/joinMetrics.ts` (Beacon dispatch)<br>• `client/src/hooks/useAuth.ts` (Login/register actions)<br>• `client/src/hooks/useGameSocket.ts` (Host/join actions)<br>• `server/src/server.ts` (Watchdog & metrics endpoint) |
| **SLI-2** Join Speed | `blokus_join_duration_ms` | Histogram | Client start-to-room elapsed time + k6 trend | • `client/src/utils/joinMetrics.ts` (Timing calculation)<br>• `server/src/server.ts` (`/api/metrics/join-duration`)<br>• `server/src/sliMetrics.ts` (Histogram bucketing)<br>• `load-test/k6/k6-blokus-workload.ts` (k6 load test) |
| **SLI-3** Move Speed | `blokus_move_duration_ms` | Histogram | Client start-to-confirmation round trip | • `client/src/hooks/useGameSocket.ts` (Timing calculation)<br>• `client/src/utils/joinMetrics.ts` (Beacon dispatch)<br>• `server/src/server.ts` (`/api/metrics/move-duration`)<br>• `server/src/sliMetrics.ts` (Histogram bucketing)<br>• `load-test/k6/k6-blokus-workload.ts` (k6 RTT trend) |
| **SLI-4** Move Accepted | `blokus_moves_accepted_total`<br>`blokus_moves_rejected_total` | Counter<br>Counter | Placement validation outcome check | • `server/src/gameRoom.ts` (`isValidPlacement()` result)<br>• `server/src/sliMetrics.ts` (Counter tracking)<br>• `load-test/k6/k6-blokus-workload.ts` (Rejection counter) |
| **SLI-5** Connection Stability | `blokus_players_entered_match_total`<br>`blokus_unexpected_disconnects_total` | Counter<br>Counter | Match entrants vs unexpected WS drops | • `server/src/gameRoom.ts` (`startGame()` & `removePlayer()`)<br>• `server/src/sliMetrics.ts` (Counter tracking)<br>• `load-test/k6/k6-blokus-workload.ts` (WS error rate) |
| **SLI-6** Pages Speed | `blokus_page_response_ms` | Histogram | Client action timing (`joinMetrics.startAction()`) + beacon | • `client/src/utils/joinMetrics.ts` (Timing & beacon dispatch)<br>• `client/src/hooks/useAuth.ts`, `ProfileScreen.tsx`, `LeaderboardScreen.tsx`<br>• `server/src/server.ts` (`POST /api/metrics/page-duration`)<br>• `server/src/sliMetrics.ts` (Histogram bucketing)<br>• `load-test/k6/k6-blokus-workload.ts` (k6 HTTP trend) |

---

## 1. SLI-1 — App Overall Availability

### What it Measures
The percentage of primary player actions (Host Room, Join Room, Login, Register, Profile Load, Leaderboard Load) that successfully complete without server errors (5xx), network timeouts, or tab abandonments.

### Source Files
- `client/src/utils/joinMetrics.ts` — Client beacon sender and action lifecycle tracker.
- `client/src/hooks/useAuth.ts` — Triggers `startAction('login')` and `startAction('register')`.
- `client/src/hooks/useGameSocket.ts` — Triggers `joinMetrics.start('host')` and `joinMetrics.start('join')`.
- `client/src/components/LeaderboardScreen.tsx` — Triggers `startAction('leaderboard')`.
- `client/src/components/ProfileScreen.tsx` — Triggers `startAction('profile')`.
- `server/src/server.ts` — Endpoints `POST /api/metrics/attempt-start` and `POST /api/metrics/attempt-finish`, armed with a 15-second watchdog timer.

### Code Logic & Measurement Flow
1. **Action Start (Client):**
   - In `joinMetrics.ts`, `generateAttemptId()` generates a unique ID (e.g. `host_1791234_abc123`).
   - The browser immediately sends an asynchronous beacon to `POST /api/metrics/attempt-start` using `navigator.sendBeacon` (fallback: `fetch` with `keepalive: true`).
2. **Watchdog Timer (Server):**
   - `server.ts` stores the attempt in an in-memory `pendingAttempts` map and starts a **15-second watchdog timer**.
3. **Action Completion (Client):**
   - **Success:** When the room appears or API returns HTTP 200, the client calls `attempt-finish` with `{ outcome: 'success' }`. The server clears the watchdog and increments `appCounters.attempts++` and `appCounters.success++`.
   - **Failure:** On 5xx errors or network socket close, the client sends `{ outcome: 'failure' }`. The server clears the watchdog and increments `appCounters.attempts++` only.
   - **Excluded (User Typos):** If the user enters a bad password, non-existent room code, or 404 profile, the client sends `{ outcome: 'excluded' }`. The server clears the watchdog without incrementing attempts or successes.
   - **Tab Closed / Frozen:** If the user closes the tab before receiving a response, or the connection freezes, no completion beacon arrives. The server's 15s watchdog timer expires and automatically records a **failure** (`appCounters.attempts++`).
5. **Offline Beacon Queueing (`client/src/utils/joinMetrics.ts`):**
   - If the browser is offline (`!navigator.onLine`) or `sendBeacon`/`fetch` fails due to network outage, beacons are buffered into a persistent `localStorage` FIFO queue (`blokus_offline_beacons_queue`, capped at 50 entries).
   - Upon reconnection (window `online` event or subsequent app activity), `flushOfflineQueue()` replays the queued beacons in order to `/api/metrics/attempt-start` and `/api/metrics/attempt-finish`, ensuring network-severed attempts and failures are reliably accounted for.

### Prometheus Output (`GET /metrics`)
```prometheus
# HELP blokus_app_actions_total Key user actions across the app (Host/Join, login, menus).
# TYPE blokus_app_actions_total counter
blokus_app_actions_total 142

# HELP blokus_app_actions_success_total Successful key user actions.
# TYPE blokus_app_actions_success_total counter
blokus_app_actions_success_total 139
```

### PromQL Calculation (15m window)
```promql
sum(rate(blokus_app_actions_success_total[15m]))
  /
sum(rate(blokus_app_actions_total[15m]))
```

---

## 2. SLI-2 — Join Speed

### What it Measures
The percentage of successful joins that show the room screen in under 1 second (`joins that show the room in under 1 s / successful joins`).

### Source Files
- `client/src/utils/joinMetrics.ts` — Records start timestamp and computes total join duration upon room arrival.
- `server/src/server.ts` — Exposes `POST /api/metrics/join-duration`.
- `server/src/sliMetrics.ts` — Ingests join durations into O(1) cumulative Prometheus histogram bucket counters.
- `load-test/k6/k6-blokus-workload.ts` — Measures `blokus_join_duration_ms` trend and `blokus_join_success` rate during load testing.

### Code Logic & Measurement Flow
1. **Client Timing (`client/src/utils/joinMetrics.ts`):**
   - On Host/Join click: sets `joinStartedAt = Date.now()`.
   - When room state arrives in `joinMetrics.success()`:
     ```typescript
     const durationMs = Date.now() - joinStartedAt;
     sendBeaconReport('/api/metrics/join-duration', { durationMs });
     ```
2. **Server Ingest (`server/src/server.ts` & `server/src/sliMetrics.ts`):**
   - `POST /api/metrics/join-duration` validates the payload and calls `sliMetrics.recordJoinDuration(durationMs)`.
   - Increments cumulative histogram bucket counters (`O(1)` memory, no raw sample buffer): `[100, 250, 500, 1000, 2000, 5000, 10000, 15000]` ms, along with monotonic `_sum` and `_count`.
3. **k6 Load Testing (`load-test/k6/k6-blokus-workload.ts`):**
   - Records timestamp right before sending `CREATE_ROOM`.
   - Upon receiving `ROOM_CREATED`, records duration in the `blokus_join_duration_ms` trend.

### Prometheus Output (`GET /metrics`)
```prometheus
# HELP blokus_join_duration_ms Time from Host/Join click to room appearing (ms).
# TYPE blokus_join_duration_ms histogram
blokus_join_duration_ms_bucket{le="100"} 12
blokus_join_duration_ms_bucket{le="250"} 45
blokus_join_duration_ms_bucket{le="500"} 78
blokus_join_duration_ms_bucket{le="1000"} 92
blokus_join_duration_ms_bucket{le="2000"} 99
blokus_join_duration_ms_bucket{le="5000"} 100
blokus_join_duration_ms_bucket{le="10000"} 100
blokus_join_duration_ms_bucket{le="15000"} 100
blokus_join_duration_ms_bucket{le="+Inf"} 100
blokus_join_duration_ms_sum 31450
blokus_join_duration_ms_count 100
```

### PromQL Calculation (15m window)
```promql
# Ratio of joins showing the room in under 1 s (1000 ms) over total successful joins
sum(rate(blokus_join_duration_ms_bucket{le="1000"}[15m]))
  /
sum(rate(blokus_join_duration_ms_count[15m]))
```

*(Note: Supplementary latency percentiles can still be checked via `histogram_quantile(0.95, sum(rate(blokus_join_duration_ms_bucket[15m])) by (le))`)*

---

## 3. SLI-3 — Move Speed ⭐

### What it Measures
The percentage of confirmed moves that complete the full client round trip (from sending the move until the confirmation message is received by the browser) in under 200 milliseconds (`moves confirmed in under 200 ms / confirmed moves`).

### Source Files
- `client/src/hooks/useGameSocket.ts` — Records send timestamp on `placePiece()` and measures duration when `MOVE_ACCEPTED` arrives for the player.
- `client/src/utils/joinMetrics.ts` — Dispatches beacon `POST /api/metrics/move-duration`.
- `server/src/server.ts` — Receives `POST /api/metrics/move-duration` and ingests into `sliMetrics.recordMoveDuration(durationMs)`.
- `server/src/sliMetrics.ts` — Cumulative histogram bucketing for round-trip latency (`blokus_move_duration_ms`).
- `load-test/k6/k6-blokus-workload.ts` — Tracks client round-trip latency trend and threshold (`blokus_move_duration_ms`).

### Code Logic & Measurement Flow
1. **Client Send Timing (`client/src/hooks/useGameSocket.ts`):**
   - When the user places a piece:
     ```typescript
     moveSentAtRef.current = Date.now();
     send({ type: 'PLACE_PIECE', roomId, pieceId, rotation, flip, originX, originY });
     ```
2. **Client Confirmation & Beacon (`client/src/hooks/useGameSocket.ts` & `joinMetrics.ts`):**
   - When `MOVE_ACCEPTED` arrives for this player:
     ```typescript
     if (msg.move.playerId === myCurrentId && moveSentAtRef.current !== null) {
       const durationMs = Date.now() - moveSentAtRef.current;
       moveSentAtRef.current = null;
       joinMetrics.recordMoveDuration(durationMs);
     }
     ```
   - Dispatches `navigator.sendBeacon` to `/api/metrics/move-duration` (fallback: `fetch`).
   - If move is rejected (`MOVE_REJECTED`), the timer is discarded (rejected moves are tracked in SLI-4).
3. **Server Ingestion & Histogram Bucketing (`server/src/server.ts` & `server/src/sliMetrics.ts`):**
   - `POST /api/metrics/move-duration` receives `durationMs` and updates `blokus_move_duration_ms`.
   - Buckets tailored for network round trips: `[10, 25, 50, 100, 150, 200, 250, 300, 500, 1000]` ms.
4. **k6 Load Testing (`load-test/k6/k6-blokus-workload.ts`):**
   - Measures round trip from `PLACE_PIECE` send to `MOVE_ACCEPTED` receipt, evaluated against `p(95) < 200ms`.

### Prometheus Output (`GET /metrics`)
```prometheus
# HELP blokus_move_duration_ms Time from sending move until confirmation comes back (ms).
# TYPE blokus_move_duration_ms histogram
blokus_move_duration_ms_bucket{le="10"} 15
blokus_move_duration_ms_bucket{le="25"} 65
blokus_move_duration_ms_bucket{le="50"} 140
blokus_move_duration_ms_bucket{le="100"} 220
blokus_move_duration_ms_bucket{le="150"} 242
blokus_move_duration_ms_bucket{le="200"} 248
blokus_move_duration_ms_bucket{le="250"} 250
blokus_move_duration_ms_bucket{le="300"} 250
blokus_move_duration_ms_bucket{le="500"} 250
blokus_move_duration_ms_bucket{le="1000"} 250
blokus_move_duration_ms_bucket{le="+Inf"} 250
blokus_move_duration_ms_sum 12850
blokus_move_duration_ms_count 250
```

### PromQL Calculation (15m window)
```promql
# Ratio of moves confirmed in under 200 ms over total confirmed moves
sum(rate(blokus_move_duration_ms_bucket{le="200"}[15m]))
  /
sum(rate(blokus_move_duration_ms_count[15m]))
```

*(Note: Supplementary latency percentiles can still be checked via `histogram_quantile(0.95, sum(rate(blokus_move_duration_ms_bucket[15m])) by (le))`)*

---

## 4. SLI-4 — Move Accepted

### What it Measures
The ratio of human moves accepted by the server (`GameRoom.placePiece()`). Because the client and server use the isomorphic rules engine (`shared/validator.ts`), a legal move submitted on the player's turn should never be rejected unless there is a synchronization desync, race condition, rapid-submission anti-replay trigger, or tampered payload.

### Source Files
- `server/src/gameRoom.ts` — Evaluates every `PLACE_PIECE` submission inside `placePiece()`.
- `server/src/sliMetrics.ts` — Increments `movesAccepted` and `movesRejected` counters.
- `load-test/k6/k6-blokus-workload.ts` — Tracks `blokus_moves_rejected` counter under high concurrency.

### Code Logic & Measurement Flow
1. **Server Validation (`server/src/gameRoom.ts`):**
   - In `placePiece(...)`, every rejected non-bot submission increments `sliMetrics.recordMoveRejected()` (covers `not_in_progress`, `not_your_turn`, `piece_already_placed`, `unknown_piece_id`, `anti_replay` `< 200 ms`, and `isValidPlacement()` failures, plus `not_in_room` before player lookup):
     ```typescript
     if (!validation.valid) {
       if (!player.isBot) {
         // ...
         sliMetrics.recordMoveRejected();
         customMetrics.recordMoveRejectedReason(reasonTag);
       }
       return { success: false, reason: validation.reason || 'Illegal placement' };
     }
     // ...
     if (!player.isBot) sliMetrics.recordMoveAccepted();
     ```
   - Bot moves (`player.isBot === true`) are excluded (except `not_in_room`, where no player object exists).

### Prometheus Output (`GET /metrics`)
```prometheus
# HELP blokus_moves_accepted_total Moves accepted by the server.
# TYPE blokus_moves_accepted_total counter
blokus_moves_accepted_total 842

# HELP blokus_moves_rejected_total Moves rejected by the server.
# TYPE blokus_moves_rejected_total counter
blokus_moves_rejected_total 1
```

### PromQL Calculation (15m window)
```promql
sum(rate(blokus_moves_accepted_total[15m]))
  /
(sum(rate(blokus_moves_accepted_total[15m])) + sum(rate(blokus_moves_rejected_total[15m])))
```

---

## 5. SLI-5 — Connection Stability

### What it Measures
The percentage of human players in a running match who do not experience an unexpected connection disconnect.

### Source Files
- `server/src/gameRoom.ts` — Tracks entrants in `startGame()` and unexpected drops in `removePlayer()`.
- `server/src/sliMetrics.ts` — Counters for `playersEnteredMatch` and `unexpectedDisconnects`.
- `load-test/k6/k6-blokus-workload.ts` — Observes `blokus_ws_errors` rate under load.

### Code Logic & Measurement Flow
1. **Match Entrants (`server/src/gameRoom.ts`):**
   - When a match transitions to `IN_PROGRESS` in `startGame()`:
     ```typescript
     for (const p of this.players.values()) {
       if (!p.isBot) sliMetrics.recordPlayerEnteredMatch();
     }
     ```
2. **Unexpected Disconnect Detection (`server/src/gameRoom.ts`):**
   - In `removePlayer(playerId, isExplicitLeave)` during an `IN_PROGRESS` match:
     - **Intentional Leave:** If `isExplicitLeave === true` (player clicked Leave/Surrender), this is intentional and not counted as a stability error.
     - **Unexpected Drop:** If `!isExplicitLeave` (network blip, socket close, browser crash), the server records:
       ```typescript
       sliMetrics.recordUnexpectedDisconnect();
       ```

### Prometheus Output (`GET /metrics`)
```prometheus
# HELP blokus_players_entered_match_total Players who entered a running match.
# TYPE blokus_players_entered_match_total counter
blokus_players_entered_match_total 120

# HELP blokus_unexpected_disconnects_total Unexpected disconnects during matches.
# TYPE blokus_unexpected_disconnects_total counter
blokus_unexpected_disconnects_total 2
```

### PromQL Calculation (15m window)
```promql
1 - (
  sum(rate(blokus_unexpected_disconnects_total[15m]))
    /
  sum(rate(blokus_players_entered_match_total[15m]))
)
```

---

## 6. SLI-6 — Pages Speed

### What it Measures
The percentage of successful client-side page actions (`login`, `register`, `profile`, `leaderboard`) that complete end-to-end (from action trigger until response JSON is parsed) in under 1 second (`successful page actions under 1 s / successful page actions`). Failed requests (`5xx`/network errors) and excluded `4xx` user typos/404s are not recorded in this latency histogram.

### Source Files
- `client/src/utils/joinMetrics.ts` — Measures elapsed duration inside `startAction()` and beacons `/api/metrics/page-duration` on `outcome === 'success'`.
- `client/src/hooks/useAuth.ts`, `ProfileScreen.tsx`, `LeaderboardScreen.tsx` — Trigger `startAction('login' | 'register' | 'profile' | 'leaderboard')`.
- `server/src/server.ts` — Exposes `POST /api/metrics/page-duration`.
- `server/src/sliMetrics.ts` — Page duration histogram bins (`blokus_page_response_ms`).
- `load-test/k6/k6-blokus-workload.ts` — k6 HTTP page trend and threshold.

### Code Logic & Measurement Flow
1. **Client Action Timing (`client/src/utils/joinMetrics.ts`):**
   ```typescript
   const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
   // ...
   if (outcome === 'success' && isPageAction) {
     const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
     const durationMs = Math.max(0, Math.round(now - startedAt));
     sendBeaconReport('/api/metrics/page-duration', { durationMs });
   }
   ```
2. **Server Ingestion & Histogram Bucketing (`server/src/server.ts` & `server/src/sliMetrics.ts`):**
   - `POST /api/metrics/page-duration` validates `0 <= durationMs <= 60000` and calls `sliMetrics.recordPageDuration(durationMs)`.
   - Buckets tailored for full client-observed RTT: `[25, 50, 100, 250, 500, 1000, 2000, 5000, 10000, 15000]` ms (plus `le="+Inf"`).
3. **k6 HTTP Testing (`load-test/k6/k6-blokus-workload.ts`):**
   - Headless VUs concurrently query `/api/leaderboard` and `/api/profile/:id` under load.
   - Observes `blokus_page_response_ms` trend (threshold: `p(95) < 1000ms`) and `blokus_page_success_rate` (threshold: `> 0.98`).
4. **Relationship to Nginx (`Dashboards/nginx_layer_Dashboard.json`):**
   - `blokus_page_response_ms` is **not** parsed from Nginx logs. Nginx access-log `$request_time` is queried separately via Loki on the Nginx Layer dashboard (excluding `status == "101"` WebSocket upgrades).

### Prometheus Output (`GET /metrics`)
```prometheus
# HELP blokus_page_response_ms Client-observed duration for login, register, profile, leaderboard actions (ms).
# TYPE blokus_page_response_ms histogram
blokus_page_response_ms_bucket{le="25"} 42
blokus_page_response_ms_bucket{le="50"} 65
blokus_page_response_ms_bucket{le="100"} 88
blokus_page_response_ms_bucket{le="250"} 96
blokus_page_response_ms_bucket{le="500"} 99
blokus_page_response_ms_bucket{le="1000"} 100
blokus_page_response_ms_bucket{le="2000"} 100
blokus_page_response_ms_bucket{le="5000"} 100
blokus_page_response_ms_bucket{le="10000"} 100
blokus_page_response_ms_bucket{le="15000"} 100
blokus_page_response_ms_bucket{le="+Inf"} 100
blokus_page_response_ms_sum 6240
blokus_page_response_ms_count 100
```

### PromQL Calculation (15m window)
```promql
# Ratio of successful page actions completing in under 1 s (1000 ms) over total successful page actions
sum(rate(blokus_page_response_ms_bucket{le="1000"}[15m]))
  /
sum(rate(blokus_page_response_ms_count[15m]))
```

*(Note: Supplementary latency percentiles can still be checked via `histogram_quantile(0.95, sum(rate(blokus_page_response_ms_bucket[15m])) by (le))`)*

---

## 🔄 Live Scraping Verification

To view all active Prometheus metrics from the running server at any time:
```bash
curl -s http://localhost:3001/metrics
```
