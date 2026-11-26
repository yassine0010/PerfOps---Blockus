# 🎯 Service Level Objectives (SLOs) — PerfOps Blokus

This document defines the authoritative **Service Level Objectives (SLOs)** for PerfOps Blokus. Each SLO establishes a target percentage, a specific performance threshold, an error budget, and a rolling 30-day compliance window evaluated against the corresponding Service Level Indicator (SLI).

---

## 🧭 Executive Summary Table

| SLO | Target | Performance Threshold | SLI Metric | Compliance Window | 30-Day Error Budget |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **SLO-1 Availability** | **$\ge 99.0\%$** | N/A (success vs. 5xx/timeout) | `blokus_app_actions_total`<br>`blokus_app_actions_success_total` | Rolling 30 Days | **$1.0\%$** failed player actions |
| **SLO-2 Join Speed** | **$\ge 95.0\%$** | Room visible in **$< 1\text{ s}$** ($1000\text{ ms}$) | `blokus_join_duration_ms` | Rolling 30 Days | **$5.0\%$** joins taking $\ge 1\text{ s}$ |
| **SLO-3 Move Speed** | **$\ge 95.0\%$** | Move confirmed in **$< 200\text{ ms}$** | `blokus_move_duration_ms` | Rolling 30 Days | **$5.0\%$** moves taking $\ge 200\text{ ms}$ |
| **SLO-4 Move Accepted** | **$\ge 99.9\%$** | Valid move accepted by server | `blokus_moves_accepted_total`<br>`blokus_moves_rejected_total` | Rolling 30 Days | **$0.1\%$** legal move rejections |
| **SLO-5 Stability** | **$\ge 99.0\%$** | No unexpected socket drop | `blokus_players_entered_match_total`<br>`blokus_unexpected_disconnects_total` | Rolling 30 Days | **$1.0\%$** unexpected in-match disconnects |
| **SLO-6 Pages Speed** | **$\ge 95.0\%$** | Completed in **$< 1\text{ s}$** ($1000\text{ ms}$) | `blokus_page_response_ms` | Rolling 30 Days | **$5.0\%$** page actions taking $\ge 1\text{ s}$ |

---

## 1. SLO-1 — App Overall Availability

> **99% of key player actions (host/join, login/register, profile, leaderboard) should succeed over a rolling 30 days.**

### Mathematical Definition
$$\text{SLO-1} = \frac{\sum_{30\text{d}} \text{Successful Key Actions}}{\sum_{30\text{d}} \text{Total Key Actions Initiated}} \ge 99.0\%$$

* **Good Events:** Host room created, room joined, login succeeded, registration succeeded, profile loaded, leaderboard loaded (HTTP 200 / WebSocket room state received).
* **Total Valid Events:** All attempts initiated via client `navigator.sendBeacon` to `/api/metrics/attempt-start`.
* **Excluded Events:** User input typos (wrong room codes, incorrect passwords, 404 profile lookups).
* **30-Day Error Budget:** $1.0\%$ (1 in 100 player actions may fail due to network blips or unexpected server errors).

---

## 2. SLO-2 — Join Speed

> **95% of successful joins should show the room in under 1 s over a rolling 30 days.**

### Mathematical Definition
$$\text{SLO-2} = \frac{\sum_{30\text{d}} \text{Successful Joins with Latency } < 1000\text{ ms}}{\sum_{30\text{d}} \text{Total Successful Joins}} \ge 95.0\%$$

* **Good Events:** Elapsed time from clicking Host / Join until the room screen and player list appear is strictly under $1000\text{ ms}$.
* **Total Valid Events:** All successful room entrances reported to `/api/metrics/join-duration`.
* **Excluded Events:** Failed joins, aborted attempts, or invalid room codes (tracked in SLI-1).
* **30-Day Error Budget:** $5.0\%$ of joins may take $1\text{ s}$ or longer (accommodating mobile TLS and initial WebSocket handshakes).

---

## 3. SLO-3 — Move Speed ⭐

> **95% of confirmed moves should be confirmed in under 200 ms over a rolling 30 days.**

### Mathematical Definition
$$\text{SLO-3} = \frac{\sum_{30\text{d}} \text{Moves Confirmed in } < 200\text{ ms}}{\sum_{30\text{d}} \text{Total Confirmed Human Moves}} \ge 95.0\%$$

* **Good Events:** A move submitted by a player is processed, validated, applied to the grid, and confirmed in under $200\text{ ms}$.
* **Total Valid Events:** All valid human moves recorded into `blokus_move_duration_ms` (via client beacon from send to confirmation).
* **Excluded Events:** Automated bot moves and illegal/rejected moves.
* **30-Day Error Budget:** $5.0\%$ of moves may take $200\text{ ms}$ or longer.

---

## 4. SLO-4 — Move Accepted

> **99.9% of legal moves sent on the player’s turn should be accepted by the server over a rolling 30 days.**

### Mathematical Definition
$$\text{SLO-4} = \frac{\sum_{30\text{d}} \text{Accepted Moves}}{\sum_{30\text{d}} (\text{Accepted Moves} + \text{Rejected Moves})} \ge 99.9\%$$

* **Good Events:** Human move submitted and accepted by `GameRoom.placePiece()` (`isValidPlacement()` succeeds).
* **Total Valid Events:** All human `PLACE_PIECE` attempts evaluated by `GameRoom.placePiece()` (note: `not_in_room` rejections before player lookup are also counted).
* **Excluded Events:** Bot moves (`player.isBot === true`).
* **30-Day Error Budget:** $0.1\%$ (1 in 1,000 moves) reserved for sub-millisecond turn timer race conditions or validation desyncs.

---

## 5. SLO-5 — Connection Stability

> **99% of player match sessions should end without an unexpected disconnect over a rolling 30 days.**

### Mathematical Definition
$$\text{SLO-5} = 1 - \frac{\sum_{30\text{d}} \text{Unexpected In-Match Disconnects}}{\sum_{30\text{d}} \text{Human Players Entering Active Matches}} \ge 99.0\%$$

* **Good Events:** A player remains connected to the WebSocket server for the entire duration of an active match.
* **Bad Events:** A WebSocket drops unexpectedly (`ws.on('close')`) while game status is `IN_PROGRESS`.
* **Excluded Events:** Intentional quits (player clicked "Leave Match" or surrendered).
* **30-Day Error Budget:** $1.0\%$ unexpected drops allowed for client device sleep, Wi-Fi handovers, or cellular loss.

---

## 6. SLO-6 — Pages Speed

> **95% of successful login, register, profile and leaderboard actions should complete on the client in under 1 s over a rolling 30 days.**

### Mathematical Definition
$$\text{SLO-6} = \frac{\sum_{30\text{d}} \text{Successful Page Actions Completing in } < 1000\text{ ms}}{\sum_{30\text{d}} \text{Total Successful Page Actions}} \ge 95.0\%$$

* **Good Events:** Client-observed `login`, `register`, `profile`, or `leaderboard` action succeeding (`outcome === 'success'`) with end-to-end duration under $1000\text{ ms}$.
* **Total Valid Events:** All successful page actions reported by the browser to `POST /api/metrics/page-duration` and recorded into `blokus_page_response_ms`. *(Nginx `$request_time` is separately queried in Loki on the Nginx Layer dashboard and does not feed `blokus_page_response_ms`.)*
* **Excluded Events:** HTTP `5xx` errors, network failure timeouts (captured in SLO-1), excluded `4xx` user typos/404s, WebSocket (`/ws`) upgrades, static frontend assets, and other endpoints.
* **30-Day Error Budget:** $5.0\%$ of successful page actions taking $1000\text{ ms}$ or longer.

---

## ⚙️ Operational Alerting vs. 30-Day Compliance

While compliance is reported over a **rolling 30-day window**, operations and alerts use short-term Prometheus burn-rate windows:

| Alert Tier | Lookback Window | Trigger Condition | Action Required |
| :--- | :--- | :--- | :--- |
| **Critical Page** | 15 minutes | Burn rate $> 14.4\times$ ($2\%$ budget consumed in 1 hour) | Immediate on-call escalation |
| **Warning** | 1 hour | Burn rate $> 6\times$ ($5\%$ budget consumed in 6 hours) | Investigate service health & queue depth |
| **Weekly Review** | 30 days | Remaining budget $< 10\%$ | Halt non-critical feature work; prioritize stability |
