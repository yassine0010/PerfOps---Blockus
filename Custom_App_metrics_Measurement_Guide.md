# 📈 Custom Application Metrics Measurement Guide

> **Scope Note:** This guide covers the **Internal Infrastructure, Runtime & Engine Observability Metrics** (Node.js runtime, WebSocket layer, and Game engine diagnostics). These metrics complement the authoritative player-facing **Service Level Indicators (SLIs)** documented in [SLIs.md](SLIs.md) and [SLOs.md](SLOs.md).

---

## 🧭 Architectural Separation of Concerns

To guarantee modularity and prevent pollution of authoritative SLA/SLO metrics:
- **Authoritative SLIs (1–6):** Managed strictly by [`server/src/sliMetrics.ts`](server/src/sliMetrics.ts) (O(1) cumulative bucket counters and monotonic counters for availability, join speed, move round-trip, move acceptance, stability, and page speed).
- **Custom Application Metrics:** Managed by [`server/src/customMetrics.ts`](server/src/customMetrics.ts) using `prom-client` (Node.js runtime gauges, socket close code counters, RAM buffer tracking, room states, and move rejection breakdown).
- **Client-Side Observation:** Tracked in [`client/src/utils/joinMetrics.ts`](client/src/utils/joinMetrics.ts) and [`client/src/hooks/useGameSocket.ts`](client/src/hooks/useGameSocket.ts), dispatched to `/api/metrics/client-events`.
- **k6 Load Testing:** Observed in [`load-test/k6/k6-blokus-workload.ts`](load-test/k6/k6-blokus-workload.ts) as informational metrics **without failing thresholds**, preserving load test stability.

---

## 4.3.1 Node.js Runtime Metrics

These metrics monitor the single-threaded Node.js event loop, garbage collector, memory footprint, and operating system descriptor limits. They are automatically sampled by `prom-client.collectDefaultMetrics()` in `server/src/customMetrics.ts`.

| Prometheus Metric | Metric Type | What it Measures | Why it Matters | PromQL Example |
| :--- | :--- | :--- | :--- | :--- |
| `nodejs_eventloop_lag_p99_seconds` | Gauge | How late the event loop is for the slowest 1% of tick executions | If event loop lag rises, every connected player experiences lag and delayed move validations. | `nodejs_eventloop_lag_p99_seconds > 0.05` |
| `rate(nodejs_gc_duration_seconds_sum[5m])` | Derived Counter | Seconds per second spent in V8 Garbage Collection | GC pauses JavaScript execution. High values indicate excessive memory allocations (e.g. repeated JSON parse/stringify or piece matrix clones). | `rate(nodejs_gc_duration_seconds_sum[5m]) > 0.1` |
| `nodejs_heap_size_used_bytes` / `nodejs_heap_size_total_bytes` | Gauge Ratio | V8 Heap memory utilization | If used heap climbs continuously without reclaiming memory after GC, a JavaScript object memory leak exists in game rooms or sessions. | `nodejs_heap_size_used_bytes / nodejs_heap_size_total_bytes > 0.85` |
| `process_resident_memory_bytes` (RSS) | Gauge | Total physical RAM allocated to the process by the OS | Catches slow native C++ leaks (SQLite native handles, unmanaged buffers) and socket buffer growth that V8 heap metrics miss. | `process_resident_memory_bytes > 512 * 1024 * 1024` |
| `process_cpu_seconds_total` | Counter | Total CPU time consumed in user and system mode | The Node.js event loop runs on 1 core. If `rate(process_cpu_seconds_total[1m])` approaches `1.0`, the main thread is CPU-saturated. | `rate(process_cpu_seconds_total[1m]) > 0.85` |
| `process_open_fds` | Gauge | Total file descriptors currently held open by the Node.js process | Every WebSocket client and SQLite connection consumes a file descriptor. If it approaches the OS limit (`ulimit -n`), new incoming connections fail. | `process_open_fds > 1024` |

---

## 4.3.2 WebSocket Layer (Custom Metrics)

The WebSocket layer handles real-time bidirectional communication. These custom metrics track connection density, disconnect pathology, network backpressure, and packet volume.

| Prometheus Metric | Metric Type | What it Measures | Why it Matters | Source File |
| :--- | :--- | :--- | :--- | :--- |
| `blokus_active_ws_connections` | Gauge | Number of active, open client WebSocket connections | The primary real-time traffic volume indicator. Correlated with CPU, heap, and event loop lag to gauge system capacity. | `server/src/server.ts`<br>`server/src/customMetrics.ts` |
| `blokus_ws_disconnects_total{code}` | Counter | Disconnect events broken down by WebSocket RFC close code:<ul><li>`1000`: Normal closure (user navigated away cleanly)</li><li>`1006`: Abnormal disconnect (network drop, crash, timeout)</li><li>`1008`: Policy violation (rate limit exceeded, kicked)</li></ul> | High `1006` indicates network instability; spikes in `1008` indicate clients violating action cooldowns or spamming messages. | `server/src/server.ts`<br>`server/src/customMetrics.ts` |
| `blokus_ws_buffered_amount_bytes` | Gauge | Sum of `ws.bufferedAmount` across all connected sockets | Measures data queued in Node.js RAM waiting to be transmitted to slow clients. If this grows, memory exhaustion will occur due to backpressure. | `server/src/server.ts`<br>`server/src/customMetrics.ts` |
| `blokus_messages_received_total` | Counter | Total count of incoming WebSocket JSON frames received by the server | Demonstrates message throughput and traffic surges, explaining sudden spikes in CPU utilization or GC pauses. | `server/src/server.ts`<br>`server/src/customMetrics.ts` |

---

## 4.3.3 Game Engine (Custom Metrics)

These metrics provide visibility into in-memory room lifecycle and move validation outcomes.

| Prometheus Metric | Metric Type | What it Measures | Why it Matters | Source File |
| :--- | :--- | :--- | :--- | :--- |
| `blokus_active_rooms{status}` | Gauge | Count of active game rooms categorized by lifecycle status:<ul><li>`WAITING` (in lobby)</li><li>`IN_PROGRESS` (active match)</li><li>`FINISHED` (completed, awaiting cleanup)</li></ul> | Reveals how much game state is retained in server RAM. A steady increase in `FINISHED` or `WAITING` without decay points to abandoned room leaks. | `server/src/roomManager.ts`<br>`server/src/customMetrics.ts` |
| `blokus_moves_rejected_by_reason_total{reason}` | Counter | Rejected moves labeled by rejection category:<ul><li>`anti_replay`: Move submitted $< 200\text{ ms}$ after prior move</li><li>`not_your_turn`: Move submitted out of player turn order</li><li>`touching_edge`: Piece touches same color orthogonally</li><li>`no_corner_contact`: Piece does not touch same color corner</li><li>`piece_already_placed`: Piece not in remaining inventory</li><li>`illegal_placement`: Other rule violation</li></ul> | Directly diagnoses game integrity and client synchronization bugs without failing load tests. | `server/src/gameRoom.ts`<br>`server/src/customMetrics.ts` |

---

## 4.3.4 Client-Side Measurement & Beacon Reporting

To ensure end-to-end observability, the frontend browser client measures connection events from the user's perspective and reports them to `POST /api/metrics/client-events`:

### 1. Client Event Tracking
- **Close Codes:** In [`client/src/hooks/useGameSocket.ts`](client/src/hooks/useGameSocket.ts), `ws.onclose = (event: CloseEvent)` captures `event.code` (e.g. `1000`, `1006`, `1008`) and invokes `joinMetrics.recordClientWsDisconnect(code)`.
- **Move Rejections:** In `ws.onmessage`, when a `MOVE_REJECTED` frame arrives, the client captures the reason string and invokes `joinMetrics.recordClientMoveRejected(msg.reason)`.
- **Message Volume:** The client counts incoming frames (`messagesCountRef.current++`) and flushes the total upon room exit or disconnect via `joinMetrics.recordClientMessagesReceived(count)`.

### 2. Transport (`joinMetrics.ts`)
Dispatches asynchronous JSON beacons using `navigator.sendBeacon` (fallback: `fetch` with `keepalive: true`):
```typescript
sendBeaconReport('/api/metrics/client-events', {
  type: 'ws_disconnect', // or 'move_rejected', 'messages_received'
  code: 1006,
  reason: 'anti_replay',
  count: 42,
  timestamp: Date.now()
});
```

### 3. Exposed Client-Reported Metrics
The server ingests these events and exposes:
- `blokus_client_ws_disconnects_total{code}`
- `blokus_client_moves_rejected_total{reason}`
- `blokus_client_messages_received_total`

---

## 4.3.5 k6 Load Test Implementation (Non-Failing)

In [`load-test/k6/k6-blokus-workload.ts`](load-test/k6/k6-blokus-workload.ts), custom metrics are registered as standalone k6 `Gauge` and `Counter` instances:

```typescript
// Custom WebSocket & Engine Observability Metrics (No failing thresholds configured)
export const k6ActiveWsConnections = new Gauge('blokus_active_ws_connections');
export const k6WsDisconnectsTotal = new Counter('blokus_ws_disconnects_total');
export const k6MessagesReceivedTotal = new Counter('blokus_messages_received_total');
export const k6MovesRejectedByReason = new Counter('blokus_moves_rejected_by_reason');
```

### Execution Behavior:
- **On Socket Open:** `k6ActiveWsConnections.add(1)`
- **On Message Arrived:** `k6MessagesReceivedTotal.add(1)`
- **On Move Rejected:** `k6MovesRejectedByReason.add(1, { reason: reasonTag })`
- **On Socket Close:** `k6ActiveWsConnections.add(-1)` and `k6WsDisconnectsTotal.add(1, { code: '1000' })`
- **On Socket Error:** `k6WsDisconnectsTotal.add(1, { code: '1006' })`

> **Safe Load Testing Policy:** No thresholds (`options.thresholds`) are placed on these metrics. They report cleanly in the k6 execution summary for observability without failing the test execution.

---

## 🛠️ Verification & Scraping Runbook

### 1. Scrape All Active Metrics
To view both the Authoritative SLIs and Custom Application Metrics from a running server:
```bash
curl -s http://localhost:3001/metrics
```

### 2. Verify Node.js Runtime Output
```bash
curl -s http://localhost:3001/metrics | grep -E "nodejs_eventloop|nodejs_gc|nodejs_heap|process_resident|process_cpu|process_open_fds"
```

### 3. Verify WebSocket Layer Output
```bash
curl -s http://localhost:3001/metrics | grep -E "blokus_active_ws|blokus_ws_disconnects|blokus_ws_buffered|blokus_messages_received"
```

### 4. Verify Game Engine Output
```bash
curl -s http://localhost:3001/metrics | grep -E "blokus_active_rooms|blokus_moves_rejected_by_reason"
```

### 5. Run the k6 Load Test
```bash
# Compile and run smoke test (1 VU)
npm run build:k6
npm run k6:smoke

# Run standard test (10 VUs / 40 players)
npm run k6:run
```
All custom metrics will display in the final k6 summary alongside the SLI latency percentiles without triggering a test failure.

---

## 4.4 On-Demand CPU Flamegraph Profiling During Load Tests

To analyze CPU bottlenecks (e.g. polyomino placement checks, board collision detection, JSON parsing, or garbage collector pauses) without recording cold server startup or idle waiting times, the system implements an **In-Process V8 CPU Profiler** using the native `node:inspector` module.

### 4.4.1 How It Works
1. **Zero Runtime Overhead While Inactive:** The V8 profiler remains disconnected during normal gameplay.
2. **Automated k6 Synchronization:**
   - In [`load-test/k6/k6-blokus-workload.ts`](load-test/k6/k6-blokus-workload.ts), `setup()` calls `POST /api/debug/profile/start` as the first VU connects.
   - The server begins sampling CPU call stacks at 1 kHz ($1\text{ ms}$ intervals).
   - Once all test stages complete, `teardown()` calls `POST /api/debug/profile/stop`.
   - The server captures the raw V8 profile and writes it to `load-test.cpuprofile` and `profiles/load-test.cpuprofile`.

### 4.4.2 Running a Profiled Load Test
Run the automated profiling workload:
```bash
# 1. Start the server (if not already running)
npm run dev:server

# 2. In another terminal, run the load test with profiling enabled
npm run k6:profile
```

### 4.4.3 Visualizing the Flamegraph

#### Option A: Interactive Standalone Viewer (Speedscope)
Run the speedscope viewer command directly from the project root:
```bash
npm run flamegraph
# Or: npx speedscope load-test.cpuprofile
```
Speedscope provides 3 specialized analysis views:
- **Left Heavy:** Aggregates time spent across identical function call stacks. Ideal for identifying the single biggest CPU hot path (e.g., `isValidPlacement` or `getPieceAbsoluteCoords`).
- **Time Order:** Chronological timeline showing how CPU load evolved across the ramp-up, steady-state soak, and drain phases of the test.
- **Sandwich:** Displays immediate callers and callees for any highlighted function.

#### Option B: Chrome DevTools (Native)
1. Open Google Chrome and press `F12` (or `Cmd + Option + I`).
2. Navigate to the **Performance** tab.
3. Click the **Load profile...** button (upward arrow in the toolbar).
4. Select `load-test.cpuprofile`.
5. Browse the interactive call stack flamegraph with native search (`Cmd + F`), zoom, and execution metrics.
