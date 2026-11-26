# SLIs — PerfOps Blokus

Each SLI measures something the player notices directly.
Authoritative 30-day targets and error budgets are documented in [SLOs.md](SLOs.md).

---

## Player Journey → SLI & SLO Map

| When | Player asks | SLI | 30-Day SLO Target |
| :--- | :--- | :--- | :--- |
| Key actions (Host/Join, login, menus) | "Is the app working?" | SLI-1 App Overall Availability | $\ge 99.0\%$ |
| Clicks Host / Join | "How long did it take?" | SLI-2 Join Speed | $\ge 95.0\%$ under $1\text{ s}$ |
| Places a piece | "Is the game fast?" | SLI-3 Move Speed | $\ge 95.0\%$ under $200\text{ ms}$ |
| Places a legal piece | "Was my move accepted?" | SLI-4 Move Accepted | $\ge 99.9\%$ |
| During a match | "Did I get disconnected?" | SLI-5 Connection Stability | $\ge 99.0\%$ |
| Login / profile / leaderboard | "How fast do pages load?" | SLI-6 Pages Speed | $\ge 95.0\%$ under $1\text{ s}$ |

---

## SLI-1 — App Overall Availability

**% of key player actions that succeed (entering rooms, login/register, loading profile & leaderboard).**

| Question | Answer |
| :--- | :--- |
| Time window | Last 15 minutes |
| Which machines | All servers combined, measured from the client |
| How often | Every 10 s |
| What counts as success? | Host/Join shows the room; login/register succeeds; profile & leaderboard load |
| What counts as failure? | Server error (5xx), network/connection error, no response within 15 s, or closing the tab with no response at all |
| What requests are not counted? | User typos (wrong room code, bad password, 404 profile), or closing the tab after a response was received |
| Where measured | Client (browser / k6) with backend tracking |
| Definition | `successful actions / total actions` |

**How tab closing and abandonments are tracked:**
When the player clicks Host/Join (or starts login/register, profile, or leaderboard):
1. **Immediate beacon on start:** The client immediately sends an "attempt started" report via `navigator.sendBeacon` to `/api/metrics/attempt-start` with a unique `attemptId`.
2. **Backend watchdog:** The backend places the attempt in a pending map and arms a 15-second watchdog timer.
3. **Closing the tab after a response was received:** Not counted. Once a response arrives, the client sends `attempt-finish` with the outcome (`success`, `failure`, or `excluded` for user typos). The backend disarms the timer and records the result. Closing the tab afterwards has no effect because the attempt has already concluded.
4. **Closing the tab with no response at all:** Counts as a failure. If the user gives up and closes the tab while waiting, or the network hangs with no response at all, no matching result ever arrives. When the backend's 15-second watchdog timer expires, the backend automatically counts the attempt as a **failure** (`attempts++`).

**Why measure on the client?** The server can only count requests that reach it. If a request fails before that (Nginx down, DNS, TLS, network), the server has no record of it. It would show 100% while players can't join or login.

*Example:* Nginx crashes for 10 minutes. 200 players click Join or Login and all fail. The server sees 0 attempts and 0 failures, so it still shows 100%. The browsers know about all 200 failures.

**The "Arrival Skew" Drawback :**
The failures happened around 10:06, but the server only learns about them at 10:11. So the drop appears at 10:11, not 10:06. With a 15-minute window, both times fall in the same window, so the result is still correct. With a very short window (like 1 minute), the timing error would matter more.

---

## SLI-2 — Join Speed

**% of successful joins that show the room in under 1 s.**

| Question | Answer |
| :--- | :--- |
| Time window | Last 15 minutes |
| Which machines | All game servers |
| How often | Every 10 s |
| What counts as success? | Room appears in under 1 s after a Host/Join click |
| What counts as failure? | Room takes 1 s or longer to appear |
| What requests are not counted? | Failed or timed-out joins, wrong room codes, tabs closed before the room appears |
| Where measured | Client (browser / k6) |
| Definition | `joins that show the room in under 1 s / successful joins` |

---

## SLI-3 — Move Speed ⭐

**% of confirmed moves that are confirmed in under 200 ms.**

| Question | Answer |
| :--- | :--- |
| Time window | Last 15 minutes |
| Which machines | All game servers |
| How often | Every 10 s |
| What counts as success? | A real player's move confirmed by the server in under 200 ms (client round-trip) |
| What counts as failure? | A real player's move taking 200 ms or longer to be confirmed |
| What requests are not counted? | Bot moves, rejected moves |
| Where measured | Client (browser beacon & k6) via `blokus_move_duration_ms` |
| Definition | `moves confirmed in under 200 ms / confirmed moves` |

---

## SLI-4 — Move Accepted

**% of legal moves the server accepts.** Client and server use the same rules, so a legal move should never be refused. If it is, there's a bug.

| Question | Answer |
| :--- | :--- |
| Time window | Last 15 minutes |
| Which machines | All game servers |
| How often | Every 10 s |
| What counts as success? | A move sent by a human player during `placePiece()` that is accepted |
| What counts as failure? | A move sent by a human player during `placePiece()` that is rejected (including rule violations, `not_your_turn`, `not_in_progress`, `piece_already_placed`, `unknown_piece_id`, `anti_replay` `< 200 ms`, and `not_in_room`) |
| What requests are not counted? | Bot moves (except `not_in_room` rejections before player lookup) |
| Where measured | Server (`sliMetrics.ts`: `blokus_moves_accepted_total`, `blokus_moves_rejected_total`) & k6 (`blokus_moves_rejected`) |
| Definition | `accepted moves / (accepted moves + rejected moves)` |

---

## SLI-5 — Connection Stability

**% of players in a match who don't get disconnected by an error.**

| Question | Answer |
| :--- | :--- |
| Time window | Last 15 minutes |
| Which machines | All game servers |
| How often | Every 10 s |
| What counts as success? | A player in a running match who stays connected |
| What counts as failure? | An unexpected disconnect (socket error, server crash, heartbeat timeout) |
| What requests are not counted? | Player leaves on purpose, or is kicked for spamming / rate limits |
| Where measured | Server (`sliMetrics.ts`: `blokus_players_entered_match_total`, `blokus_unexpected_disconnects_total`) & k6 (`blokus_ws_errors`) |
| Definition | `1 − (unexpected disconnects / players in matches)` |

---

## SLI-6 — Pages Speed

**% of successful page actions (login, register, profile, leaderboard) that complete on the client in under 1 s.**

| Question | Answer |
| :--- | :--- |
| Time window | Last 15 minutes |
| Which machines | All game servers, measured from the client |
| How often | Every 10 s |
| What counts as success? | A successful (`outcome === 'success'`) login, register, profile, or leaderboard action completing from trigger until JSON response is parsed in under 1 s |
| What counts as failure? | A successful page action taking 1 s or longer to complete |
| What requests are not counted? | Failed requests (5xx, network errors), excluded user typos (`4xx` / `404`), WebSocket (`/ws`), static assets, and other endpoints |
| Where measured | Client (`joinMetrics.startAction()` → `POST /api/metrics/page-duration` → `blokus_page_response_ms`) & k6 (`blokus_page_response_ms`) |
| Definition | `successful page actions under 1 s / successful page actions` |

---

## To Do

- [x] Add join success and join speed to the k6 test
- [x] Add server-side metrics (`sliMetrics.ts` + `GET /metrics`)
- [x] Measure full client-experienced page duration via `joinMetrics.startAction()` → `POST /api/metrics/page-duration` (`blokus_page_response_ms`) and log Nginx `$request_time` for Loki (`nginx_layer_Dashboard.json`)
- [x] Add HTTP pages speed coverage to k6 load test
- [x] Implement client-side offline beacon queueing in `localStorage` for SLI-1
- [x] Set targets after the first load tests (see [SLOs.md](SLOs.md))
