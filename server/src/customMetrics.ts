// ─── Custom Application Metrics (Non-SLI Infrastructure & Engine Observability) ───
// These metrics complement the authoritative SLIs (which live in sliMetrics.ts).
// Powered by prom-client to expose:
//   4.3.1 Node.js Runtime metrics
//   4.3.2 WebSocket Layer metrics
//   4.3.3 Game Engine metrics
//   Client-reported connection events

import client from 'prom-client';

export const customRegister = new client.Registry();

// ─── 4.3.1 Node.js Runtime ────────────────────────────────────
// Metrics:
// - nodejs_eventloop_lag_p99_seconds
// - rate(nodejs_gc_duration_seconds_sum[5m])
// - nodejs_heap_size_used_bytes / nodejs_heap_size_total_bytes
// - process_resident_memory_bytes (RSS)
// - process_cpu_seconds_total
// - process_open_fds
client.collectDefaultMetrics({
  register: customRegister,
  eventLoopMonitoringPrecision: 10,
});

// ─── 4.3.2 WebSocket Layer (Custom) ───────────────────────────
// blokus_active_ws_connections (gauge)
const activeWsGauge = new client.Gauge({
  name: 'blokus_active_ws_connections',
  help: 'Current open WebSocket connections.',
  registers: [customRegister],
});

// blokus_ws_disconnects_total{code} (counter)
const wsDisconnectsCounter = new client.Counter({
  name: 'blokus_ws_disconnects_total',
  help: 'WebSocket disconnects by close code (1006=abrupt, 1008=kicked/violation, 1000=normal).',
  labelNames: ['code'] as const,
  registers: [customRegister],
});

// blokus_ws_buffered_amount_bytes (gauge)
const wsBufferedAmountGauge = new client.Gauge({
  name: 'blokus_ws_buffered_amount_bytes',
  help: 'Sum of ws.bufferedAmount across sockets (queued data in RAM for slow clients).',
  registers: [customRegister],
});

// blokus_messages_received_total (counter)
const messagesReceivedCounter = new client.Counter({
  name: 'blokus_messages_received_total',
  help: 'Incoming WebSocket messages received by the server.',
  registers: [customRegister],
});

// ─── 4.3.3 Game Engine (Custom) ───────────────────────────────
// blokus_active_rooms{status} (gauge)
const activeRoomsGauge = new client.Gauge({
  name: 'blokus_active_rooms',
  help: 'Active rooms by status (WAITING, IN_PROGRESS, FINISHED).',
  labelNames: ['status'] as const,
  registers: [customRegister],
});

// blokus_moves_rejected_total{reason} (counter)
const movesRejectedByReasonCounter = new client.Counter({
  name: 'blokus_moves_rejected_by_reason_total',
  help: 'Rejected moves broken down by reason (anti_replay, not_your_turn, illegal_placement, etc.).',
  labelNames: ['reason'] as const,
  registers: [customRegister],
});

// ─── Client-Observed Connection Events (from /api/metrics/client-events) ──
const clientWsDisconnectsCounter = new client.Counter({
  name: 'blokus_client_ws_disconnects_total',
  help: 'Client-observed WebSocket disconnects by close code.',
  labelNames: ['code'] as const,
  registers: [customRegister],
});

const clientMovesRejectedCounter = new client.Counter({
  name: 'blokus_client_moves_rejected_total',
  help: 'Client-observed move rejections by reason.',
  labelNames: ['reason'] as const,
  registers: [customRegister],
});

const clientMessagesReceivedCounter = new client.Counter({
  name: 'blokus_client_messages_received_total',
  help: 'Client-observed incoming messages received count.',
  registers: [customRegister],
});

// ─── Public API ───────────────────────────────────────────────
export const customMetrics = {
  // 4.3.2 WebSocket Layer
  recordWsConnection() {
    activeWsGauge.inc();
  },

  recordWsDisconnection() {
    activeWsGauge.dec();
  },

  recordWsDisconnect(code: number | string) {
    const codeStr = String(code || '1000');
    wsDisconnectsCounter.inc({ code: codeStr });
  },

  setWsBufferedAmount(bytes: number) {
    wsBufferedAmountGauge.set(Math.max(0, bytes));
  },

  recordWsMessage() {
    messagesReceivedCounter.inc();
  },

  // 4.3.3 Game Engine
  setActiveRooms(counts: { WAITING: number; IN_PROGRESS: number; FINISHED: number }) {
    activeRoomsGauge.set({ status: 'WAITING' }, counts.WAITING || 0);
    activeRoomsGauge.set({ status: 'IN_PROGRESS' }, counts.IN_PROGRESS || 0);
    activeRoomsGauge.set({ status: 'FINISHED' }, counts.FINISHED || 0);
  },

  recordMoveRejectedReason(reason: string) {
    movesRejectedByReasonCounter.inc({ reason: reason || 'unknown' });
  },

  // Client events
  recordClientEvent(event: { type: string; code?: number | string; reason?: string; count?: number }) {
    if (!event || !event.type) return;

    if (event.type === 'ws_disconnect') {
      const codeStr = String(event.code || '1006');
      clientWsDisconnectsCounter.inc({ code: codeStr });
    } else if (event.type === 'move_rejected') {
      const reasonStr = String(event.reason || 'unknown');
      clientMovesRejectedCounter.inc({ reason: reasonStr });
    } else if (event.type === 'messages_received') {
      const count = Number(event.count) || 1;
      clientMessagesReceivedCounter.inc(count);
    }
  },

  // Prometheus text format
  async toPrometheusText(): Promise<string> {
    return customRegister.metrics();
  },
};
