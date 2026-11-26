// Client-side measurement for SLI-1 (App Overall Availability).
//
// Measures key player actions: Host/Join room, login, register, profile, leaderboard.
//
// Mechanism:
// 1. When an action starts (Host/Join click, login submit, profile/leaderboard load),
//    an "attempt started" report is sent immediately using navigator.sendBeacon.
// 2. If a response arrives:
//    - success: action succeeded -> sent to backend via attempt-finish
//    - excluded: user typo (wrong room code, bad password, 404 profile) -> sent as excluded
//    - failure: server 5xx or network error -> sent as failure
//    Closing the tab AFTER a response was received is not counted (attempt already completed).
// 3. If the user closes the tab with no response at all (or network drops):
//    No matching result arrives for that attempt. The backend's 15s watchdog timer
//    expires and automatically counts it as a failure.

import { getApiBase } from './apiConfig';

const API_BASE = () => getApiBase();
const JOIN_TIMEOUT_MS = 15000;

export type Outcome = 'success' | 'failure';
export type ActionOutcome = 'success' | 'failure' | 'excluded';
export type Kind = 'host' | 'join';

let currentJoinAttemptId: string | null = null;
let currentJoinTimeoutId: ReturnType<typeof setTimeout> | null = null;
let joinStartedAt: number = 0; // SLI-2: timestamp when join was initiated
let initialized = false;

const OFFLINE_QUEUE_KEY = 'blokus_offline_beacons_queue';
const MAX_OFFLINE_QUEUE_SIZE = 50;

interface QueuedBeacon {
  endpoint: string;
  data: Record<string, any>;
  timestamp: number;
}

function getOfflineQueue(): QueuedBeacon[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveOfflineQueue(queue: QueuedBeacon[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const trimmed = queue.slice(-MAX_OFFLINE_QUEUE_SIZE);
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(trimmed));
  } catch {
    // Ignore quota or security errors
  }
}

function enqueueOfflineBeacon(endpoint: string, data: Record<string, any>): void {
  const queue = getOfflineQueue();
  queue.push({ endpoint, data, timestamp: Date.now() });
  saveOfflineQueue(queue);
}

let isFlushingQueue = false;

async function flushOfflineQueue(): Promise<void> {
  if (isFlushingQueue) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

  const queue = getOfflineQueue();
  if (queue.length === 0) return;

  isFlushingQueue = true;
  try {
    while (queue.length > 0) {
      const item = queue[0];
      const url = `${API_BASE()}${item.endpoint}`;
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.data),
          keepalive: true,
        });
        if (response.ok || response.status === 204 || (response.status >= 400 && response.status < 500)) {
          queue.shift();
          saveOfflineQueue(queue);
        } else {
          // 5xx error: pause retrying until next trigger
          break;
        }
      } catch {
        // Network still down: retain items in localStorage
        break;
      }
    }
  } finally {
    isFlushingQueue = false;
  }
}

function generateAttemptId(prefix: string = 'att'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function sendBeaconReport(endpoint: string, data: Record<string, any>): void {
  // If the browser is definitely offline, queue directly into localStorage
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    enqueueOfflineBeacon(endpoint, data);
    return;
  }

  const url = `${API_BASE()}${endpoint}`;
  const jsonStr = JSON.stringify(data);

  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    try {
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const sent = navigator.sendBeacon(url, blob);
      if (sent) {
        flushOfflineQueue().catch(() => {});
        return;
      }
    } catch {
      // Fall through to fetch
    }
  }

  // Fallback to fetch with keepalive if sendBeacon is unavailable or failed
  if (typeof fetch === 'function') {
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: jsonStr,
      keepalive: true,
    })
      .then((res) => {
        if (res.ok || res.status === 204) {
          flushOfflineQueue().catch(() => {});
        } else if (res.status >= 500) {
          enqueueOfflineBeacon(endpoint, data);
        }
      })
      .catch(() => {
        // Network failure (offline, DNS error, network drop) -> enqueue in localStorage
        enqueueOfflineBeacon(endpoint, data);
      });
  } else {
    enqueueOfflineBeacon(endpoint, data);
  }
}

function finishJoin(outcome: ActionOutcome) {
  if (!currentJoinAttemptId) return;
  const attemptId = currentJoinAttemptId;
  currentJoinAttemptId = null;

  if (currentJoinTimeoutId) {
    clearTimeout(currentJoinTimeoutId);
    currentJoinTimeoutId = null;
  }

  sendBeaconReport('/api/metrics/attempt-finish', {
    attemptId,
    outcome,
    timestamp: Date.now(),
  });
}

export const joinMetrics = {
  /** Call once when the app starts. Registers online listener & flushes offline queue. */
  init() {
    if (initialized) return;
    initialized = true;

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        flushOfflineQueue().catch(() => {});
      });
      // Drain any beacons stored while previously offline
      flushOfflineQueue().catch(() => {});
    }
  },

  /** Host/Join click. Sends 'attempt started' immediately via navigator.sendBeacon. */
  start(kind: Kind) {
    if (currentJoinAttemptId) return;
    const attemptId = generateAttemptId(kind);
    currentJoinAttemptId = attemptId;
    joinStartedAt = Date.now(); // SLI-2: record start time for duration calculation

    sendBeaconReport('/api/metrics/attempt-start', {
      attemptId,
      action: kind,
      timestamp: Date.now(),
    });

    // Client-side fallback timer if window stays open without server response
    currentJoinTimeoutId = setTimeout(() => {
      finishJoin('failure');
    }, JOIN_TIMEOUT_MS);
  },

  /** Room state received successfully. */
  success() {
    // SLI-2: Report join duration to the server (only on success)
    if (joinStartedAt > 0) {
      const durationMs = Date.now() - joinStartedAt;
      joinStartedAt = 0;
      sendBeaconReport('/api/metrics/join-duration', { durationMs });
    }
    finishJoin('success');
  },

  /** SLI-3: Report move round-trip duration (from send to confirmation) to the server */
  recordMoveDuration(durationMs: number) {
    if (durationMs >= 0 && Number.isFinite(durationMs)) {
      sendBeaconReport('/api/metrics/move-duration', { durationMs });
    }
  },

  /** Network or connection error while waiting for room. */
  networkError() {
    finishJoin('failure');
  },

  /** Discard attempt (e.g. user navigation or cancel). Excluded from metrics. */
  cancel() {
    finishJoin('excluded');
  },

  /** Wrong room code: player typo, excluded from availability metrics. */
  wrongCode() {
    finishJoin('excluded');
  },

  /**
   * Starts tracking an arbitrary primary user action (login, register, profile, leaderboard).
   * Immediately sends 'attempt started' via navigator.sendBeacon.
   * Returns a finish function to be called when the response arrives.
   */
  startAction(action: string): (outcome: ActionOutcome) => void {
    const attemptId = generateAttemptId(action);
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const isPageAction =
      action === 'login' ||
      action === 'register' ||
      action === 'leaderboard' ||
      action === 'profile';

    sendBeaconReport('/api/metrics/attempt-start', {
      attemptId,
      action,
      timestamp: Date.now(),
    });

    let completed = false;
    return (outcome: ActionOutcome) => {
      if (completed) return;
      completed = true;

      // SLI-6: Report full client-experienced page duration only on successful outcomes
      if (outcome === 'success' && isPageAction) {
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const durationMs = Math.max(0, Math.round(now - startedAt));
        sendBeaconReport('/api/metrics/page-duration', { durationMs });
      }

      sendBeaconReport('/api/metrics/attempt-finish', {
        attemptId,
        outcome,
        timestamp: Date.now(),
      });
    };
  },

  /** Direct action outcome recorder for compatibility. */
  recordAction(outcome: Outcome) {
    const attemptId = generateAttemptId('direct');
    sendBeaconReport('/api/metrics/attempt-start', { attemptId, action: 'direct' });
    sendBeaconReport('/api/metrics/attempt-finish', { attemptId, outcome, timestamp: Date.now() });
  },

  /** Report client-observed WebSocket disconnect code (e.g. 1000, 1006, 1008) */
  recordClientWsDisconnect(code: number) {
    sendBeaconReport('/api/metrics/client-events', {
      type: 'ws_disconnect',
      code: code || 1006,
      timestamp: Date.now(),
    });
  },

  /** Report client-observed move rejection and reason */
  recordClientMoveRejected(reason: string) {
    sendBeaconReport('/api/metrics/client-events', {
      type: 'move_rejected',
      reason: reason || 'unknown',
      timestamp: Date.now(),
    });
  },

  /** Report client-observed incoming messages received count */
  recordClientMessagesReceived(count: number) {
    if (count > 0) {
      sendBeaconReport('/api/metrics/client-events', {
        type: 'messages_received',
        count,
        timestamp: Date.now(),
      });
    }
  },
};
