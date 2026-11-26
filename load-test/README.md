# ⚡ Blokus k6 WebSocket Workload Testing

A high-performance, real-time load testing suite for the **PerfOps Blokus** WebSocket backend, built for [Grafana k6](https://k6.io/).

---

## 📋 Overview

Each k6 Virtual User (VU) simulates an autonomous headless game player that:
1. **Connects** via WebSocket to `ws://<HOST>/ws`.
2. **Creates a Room** (`CREATE_ROOM`).
3. **Adds 3 Bots** (`ADD_BOT`) with proper pacing (respecting server action cooldowns) to form a full 4-player game.
4. **Starts the Match** (`START_GAME`).
5. **Plays Authoritative Moves**: Evaluates board state, checks starting corner constraints, calculates valid corner-to-corner placements with the shared game engine (`findFirstLegalMove`), and sends `PLACE_PIECE` or `PASS_TURN`.
6. **Measures Latency & SRE Metrics**: Tracks move round-trip acknowledgment latency, match durations, pass rates, and WebSocket error rates.

---

## 🛠️ Prerequisites

### 1. Install k6 (if not already installed)

- **macOS (Homebrew):**
  ```bash
  brew install k6
  ```
- **Linux (Debian/Ubuntu):**
  ```bash
  sudo gpg -k
  sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
  echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
  sudo apt-get update && sudo apt-get install k6
  ```
- **Docker:**
  ```bash
  docker pull grafana/k6
  ```

---

## 🚀 Quick Start

### Step 1: Ensure the Backend Game Server is Running
```bash
# In the project root (Terminal 1)
npm run dev:server
```
*(Server listens on `ws://localhost:3001/ws`)*

### Step 2: Build the k6 Bundle
The test is written in TypeScript and imports the shared game rules. Run the builder to bundle it into a standalone ES6 file:
```bash
npm run build:k6
```
> Outputs: `load-test/dist/k6-blokus-workload.js` (~14 KB, zero runtime dependencies)

### Step 3: Run the Load Test

#### 💨 Quick Smoke Test (1 VU, 30 seconds)
```bash
npm run k6:smoke
```

#### 📈 Standard Load Test (Ramping up to 10 VUs / 40 concurrent players)
```bash
npm run k6:run
```

#### 🔥 High-Concurrency Stress Test (25 VUs / 100 concurrent players, 2 minutes)
```bash
npm run k6:stress
```

---

## ⚙️ Environment Variables & Customization

You can override runtime parameters using the `-e` flag in k6:

| Variable | Default | Description |
| :--- | :--- | :--- |
| `WS_HOST` | `localhost:3001` | Server host and port |
| `TARGET_VUS` | `10` | Peak number of concurrent game rooms |
| `THINK_DELAY_SEC` | `0.6` | Think time before submitting move (seconds, min 0.55s) |
| `RAMP_UP` | `20s` | Ramp-up stage duration |
| `HOLD` | `40s` | Steady-state soak duration |
| `RAMP_DOWN` | `15s` | Drain stage duration |

### Example Custom Runs:

```bash
# Test against a remote staging server with 50 rooms (200 players)
k6 run -e WS_HOST=192.168.1.50:3001 -e TARGET_VUS=50 load-test/dist/k6-blokus-workload.js

# Fast-paced test with 550ms think delay
k6 run -e THINK_DELAY_SEC=0.55 load-test/dist/k6-blokus-workload.js
```

---

## 📊 SRE Metrics Collected

| Metric Name | Type | Description | SRE Target / Threshold |
| :--- | :--- | :--- | :--- |
| `blokus_move_duration_ms` | Trend (Histogram) | Turn RTT (from `PLACE_PIECE` sent to `MOVE_ACCEPTED` received) | `p(95) < 200ms` |
| `blokus_join_duration_ms` | Trend (Histogram) | Room creation latency (from `CREATE_ROOM` sent to `ROOM_CREATED` received) | `p(95) < 500ms`, `p(99) < 1000ms` |
| `blokus_join_success` | Rate | Share of room joins/creations succeeding | `rate > 0.98` |
| `blokus_page_response_ms` | Trend (Histogram) | HTTP latency for `/api/leaderboard` and `/api/profile/:id` | `p(95) < 1000ms` |
| `blokus_page_success_rate` | Rate | Share of HTTP page API requests returning non-5xx (`200` / `< 500`) | `rate > 0.98` |
| `blokus_game_duration_s` | Trend | Total duration of completed matches | Expected ~30s to 90s |
| `blokus_moves_total` | Counter | Total legal moves successfully processed | Throughput counter |
| `blokus_passes_total` | Counter | Total passes when players ran out of moves | Game logic progression |
| `blokus_games_completed` | Counter | Full 4-player games completed | Throughput counter |
| `blokus_moves_rejected` | Counter | Moves rejected by server validation | Target: 0 |
| `blokus_ws_errors` | Rate | Rate of WebSocket errors or disconnections | `rate < 0.02` |

---

## 📂 Source Code Structure

- **`k6/k6-blokus-workload.ts`**: Main k6 scenario source using `k6/ws` and the shared game engine validator.
- **`build-k6.ts`**: Bundler script that uses local `esbuild` to compile TypeScript and shared rules into `dist/`.
- **`dist/k6-blokus-workload.js`**: Pre-compiled, zero-dependency bundle ready for the `k6` CLI.
