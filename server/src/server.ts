import express from 'express';
import http from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import type { ClientMessage } from '../../shared/types.ts';
import { RoomManager } from './roomManager.ts';
import { userStore } from './userStore.ts';
import { sliMetrics } from './sliMetrics.ts';
import { customMetrics } from './customMetrics.ts';
import { cpuProfiler } from './profiler.ts';

const app = express();
const server = http.createServer(app);

// ─── Anti-Slowloris & Connection Timeouts ─────────────────────
// Mitigates Slowloris attacks where malicious clients trickle HTTP headers slowly.
server.headersTimeout = 6000;   // Max 6s to receive complete HTTP headers (Node default: 60s)
server.requestTimeout = 15000;  // Max 15s for total HTTP request lifecycle (Node default: 300s)
server.keepAliveTimeout = 5000; // 5s idle keep-alive interval between requests

// Handle premature client disconnects and header timeouts cleanly
server.on('clientError', (err: any, socket) => {
  if (err.code === 'ECONNRESET' || !socket.writable) {
    return;
  }
  if (err.code === 'ERR_HTTP_REQUEST_TIMEOUT') {
    socket.end('HTTP/1.1 408 Request Timeout\r\nConnection: close\r\n\r\n');
    return;
  }
  socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 }); // 4 KB max per WS message

const roomManager = new RoomManager();

app.use(express.json({ limit: '10kb' })); // Reject oversized HTTP bodies
app.use(express.text({ type: ['text/plain', 'text/*'], limit: '10kb' }));

// ─── WebSocket Rate Limiting Helpers ──────────────────────────

interface WsRateState {
  msgCount: number;          // messages in current 1-second window
  windowStart: number;       // start of current window (ms)
  violations: number;        // consecutive over-limit windows
  actionTimestamps: Map<string, number>; // last timestamp per action type
}

const WS_GLOBAL_LIMIT = 20;  // max messages per second per connection
const WS_MAX_VIOLATIONS = 3; // terminate after this many consecutive violations

// Per-action minimum intervals (ms)
const ACTION_COOLDOWNS: Record<string, number> = {
  PLACE_PIECE: 500,    // no human places faster than 500ms
  PASS_TURN: 1000,
  CREATE_ROOM: 5000,
  JOIN_ROOM: 2000,
  START_GAME: 3000,
  ADD_BOT: 1000,
  REMOVE_BOT: 1000,
};

function checkWsRate(state: WsRateState): 'ok' | 'throttled' | 'terminate' {
  const now = Date.now();
  if (now - state.windowStart > 1000) {
    // New 1-second window
    if (state.msgCount > WS_GLOBAL_LIMIT) {
      state.violations++;
    } else {
      state.violations = 0;
    }
    state.msgCount = 1;
    state.windowStart = now;
  } else {
    state.msgCount++;
  }

  if (state.violations >= WS_MAX_VIOLATIONS) return 'terminate';
  if (state.msgCount > WS_GLOBAL_LIMIT) return 'throttled';
  return 'ok';
}

function checkActionCooldown(state: WsRateState, action: string): boolean {
  const cooldown = ACTION_COOLDOWNS[action];
  if (!cooldown) return true; // no cooldown for this action
  const now = Date.now();
  const last = state.actionTimestamps.get(action) || 0;
  if (now - last < cooldown) return false; // too fast
  state.actionTimestamps.set(action, now);
  return true;
}

// CORS — allow cross-origin from the Vite dev server (and LAN IPs)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ─── HTTP API ROUTES (Phase 2: §9.2) ────────────────────────

// Health Check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: Date.now()
  });
});

// ─── On-Demand V8 CPU Profiler Endpoints (for Load Testing) ───
app.post('/api/debug/profile/start', async (req, res) => {
  try {
    const result = await cpuProfiler.start();
    res.json(result);
  } catch (err: any) {
    console.error('[Profiler] Failed to start:', err);
    res.status(500).json({ error: err?.message || 'Failed to start profiler' });
  }
});

app.post('/api/debug/profile/stop', async (req, res) => {
  try {
    const filename = req.body?.filename || 'load-test.cpuprofile';
    const result = await cpuProfiler.stop(filename);
    res.json(result);
  } catch (err: any) {
    console.error('[Profiler] Failed to stop:', err);
    res.status(500).json({ error: err?.message || 'Failed to stop profiler' });
  }
});

app.get('/api/debug/profile/status', (req, res) => {
  res.json(cpuProfiler.getStatus());
});

// POST /api/register
app.post('/api/register', (req, res) => {
  const { username, password, displayName } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Username and password are required' });
  }
  const result = userStore.register(username, password, displayName);
  res.json(result);
});

// POST /api/login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Username and password are required' });
  }
  const result = userStore.login(username, password);
  res.json(result);
});

// POST /api/logout
app.post('/api/logout', (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (token) userStore.logout(token);
  res.json({ success: true });
});

// GET /api/me — current authenticated user
app.get('/api/me', (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const user = userStore.getUserByToken(token);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  res.json({ user });
});

// GET /api/profile/:id
app.get('/api/profile/:id', (req, res) => {
  const profile = userStore.getProfile(req.params.id);
  if (!profile) return res.status(404).json({ error: 'User not found' });
  res.json(profile);
});

// GET /api/leaderboard
app.get('/api/leaderboard', (req, res) => {
  const players = userStore.getLeaderboard(25);
  res.json({ players });
});

// ─── SLI-1 App Overall Availability (reported by the client) ───
// The client sends "attempt started" immediately via navigator.sendBeacon when an action starts.
// If a matching response arrives, the client sends "attempt-finish" (success / failure / excluded).
// If the tab is closed with no response at all, the watchdog timer fires and counts it as a failure.
const appCounters = { attempts: 0, success: 0 };
const MAX_JOIN_BATCH = 50;

interface PendingAttempt {
  action: string;
  startedAt: number;
  timer: NodeJS.Timeout;
}

const pendingAttempts = new Map<string, PendingAttempt>();
const recentlyTimedOut = new Set<string>();
const ATTEMPT_TIMEOUT_MS = 15000;
const MAX_PENDING_ATTEMPTS = 10000;

function parseMetricBody(req: express.Request): any {
  if (typeof req.body === 'object' && req.body !== null) return req.body;
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
}

// POST /api/metrics/attempt-start
app.post('/api/metrics/attempt-start', (req, res) => {
  const body = parseMetricBody(req);
  const { attemptId, action } = body;
  if (!attemptId || typeof attemptId !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid attemptId' });
  }

  // Prevent memory exhaustion
  if (pendingAttempts.size >= MAX_PENDING_ATTEMPTS) {
    const firstKey = pendingAttempts.keys().next().value;
    if (firstKey) {
      const old = pendingAttempts.get(firstKey);
      if (old) clearTimeout(old.timer);
      pendingAttempts.delete(firstKey);
    }
  }

  const existing = pendingAttempts.get(attemptId);
  if (existing) {
    clearTimeout(existing.timer);
  }

  const timer = setTimeout(() => {
    pendingAttempts.delete(attemptId);
    recentlyTimedOut.add(attemptId);
    if (recentlyTimedOut.size > 1000) {
      const first = recentlyTimedOut.values().next().value;
      if (first) recentlyTimedOut.delete(first);
    }

    // No response arrived before timeout: tab closed with no response, network dropped, etc.
    // Counts as a failure:
    appCounters.attempts++;
  }, ATTEMPT_TIMEOUT_MS);

  if (timer.unref) timer.unref();

  pendingAttempts.set(attemptId, {
    action: String(action || 'unknown'),
    startedAt: Date.now(),
    timer,
  });

  res.sendStatus(204);
});

// POST /api/metrics/attempt-finish
app.post('/api/metrics/attempt-finish', (req, res) => {
  const body = parseMetricBody(req);
  const { attemptId, outcome } = body;
  if (!attemptId || typeof attemptId !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid attemptId' });
  }
  if (outcome !== 'success' && outcome !== 'failure' && outcome !== 'excluded') {
    return res.status(400).json({ error: 'Invalid outcome' });
  }

  const pending = pendingAttempts.get(attemptId);
  if (pending) {
    clearTimeout(pending.timer);
    pendingAttempts.delete(attemptId);

    if (outcome === 'success') {
      appCounters.attempts++;
      appCounters.success++;
    } else if (outcome === 'failure') {
      appCounters.attempts++;
    }
    // 'excluded' (user typos, wrong room code, bad password): do not increment attempts or success
  } else if (!recentlyTimedOut.has(attemptId)) {
    // Finished directly without prior pending start
    if (outcome === 'success') {
      appCounters.attempts++;
      appCounters.success++;
    } else if (outcome === 'failure') {
      appCounters.attempts++;
    }
  } else {
    // Already timed out and counted as failure; clean up tracking set
    recentlyTimedOut.delete(attemptId);
  }

  res.sendStatus(204);
});

// POST /api/metrics/join-duration (SLI-2: client reports how long the join took)
app.post('/api/metrics/join-duration', (req, res) => {
  const body = parseMetricBody(req);
  const durationMs = Number(body.durationMs);
  if (!isFinite(durationMs) || durationMs < 0 || durationMs > 60000) {
    return res.status(400).json({ error: 'Invalid durationMs' });
  }
  sliMetrics.recordJoinDuration(durationMs);
  res.sendStatus(204);
});

// POST /api/metrics/move-duration (SLI-3: client reports round-trip time from send to confirmation)
app.post('/api/metrics/move-duration', (req, res) => {
  const body = parseMetricBody(req);
  const durationMs = Number(body.durationMs);
  if (!isFinite(durationMs) || durationMs < 0 || durationMs > 60000) {
    return res.status(400).json({ error: 'Invalid durationMs' });
  }
  sliMetrics.recordMoveDuration(durationMs);
  res.sendStatus(204);
});

// POST /api/metrics/page-duration (SLI-6: client reports full page action duration)
app.post('/api/metrics/page-duration', (req, res) => {
  const body = parseMetricBody(req);
  const durationMs = Number(body.durationMs);
  if (!isFinite(durationMs) || durationMs < 0 || durationMs > 60000) {
    return res.status(400).json({ error: 'Invalid durationMs' });
  }
  sliMetrics.recordPageDuration(durationMs);
  res.sendStatus(204);
});

// POST /api/metrics/join (batch endpoint for backward compatibility)
app.post('/api/metrics/join', (req, res) => {
  const outcomes = req.body?.outcomes;
  if (!Array.isArray(outcomes) || outcomes.length === 0 || outcomes.length > MAX_JOIN_BATCH) {
    return res.status(400).json({ error: 'Invalid outcomes' });
  }
  for (const outcome of outcomes) {
    if (outcome !== 'success' && outcome !== 'failure') {
      return res.status(400).json({ error: 'Invalid outcome' });
    }
  }

  for (const outcome of outcomes) {
    appCounters.attempts++;
    if (outcome === 'success') appCounters.success++;
  }

  res.sendStatus(204);
});

// POST /api/metrics/client-events (client-observed events: ws_disconnect, move_rejected, messages_received)
app.post('/api/metrics/client-events', (req, res) => {
  const body = parseMetricBody(req);
  if (Array.isArray(body?.events)) {
    for (const ev of body.events) {
      customMetrics.recordClientEvent(ev);
    }
  } else if (body && body.type) {
    customMetrics.recordClientEvent(body);
  }
  res.sendStatus(204);
});

// GET /metrics (Prometheus text format)
app.get('/metrics', async (req, res) => {
  try {
    // Refresh dynamic gauges before returning Prometheus scrape
    customMetrics.setActiveRooms(roomManager.getRoomStatusCounts());
    let totalBuffered = 0;
    wss.clients.forEach((c) => {
      totalBuffered += (c as any).bufferedAmount || 0;
    });
    customMetrics.setWsBufferedAmount(totalBuffered);

    const customText = await customMetrics.toPrometheusText();
    const sliText = [
      '# HELP blokus_app_actions_total Key user actions across the app (Host/Join, login, menus).',
      '# TYPE blokus_app_actions_total counter',
      `blokus_app_actions_total ${appCounters.attempts}`,
      '# HELP blokus_app_actions_success_total Successful key user actions.',
      '# TYPE blokus_app_actions_success_total counter',
      `blokus_app_actions_success_total ${appCounters.success}`,
      '# HELP blokus_join_attempts_total Alias for compatibility with join queries.',
      '# TYPE blokus_join_attempts_total counter',
      `blokus_join_attempts_total ${appCounters.attempts}`,
      '# HELP blokus_join_success_total Alias for compatibility with join queries.',
      '# TYPE blokus_join_success_total counter',
      `blokus_join_success_total ${appCounters.success}`,
      '',
      // SLI 2–6 metrics
      sliMetrics.toPrometheusText(),
      '',
      // 4.3 Custom Application Metrics (Runtime, WS Layer, Engine)
      customText,
      ''
    ].join('\n');

    res.type('text/plain; version=0.0.4').send(sliText);
  } catch (err) {
    console.error('[Metrics] Error generating metrics:', err);
    res.status(500).send('# Error collecting metrics\n');
  }
});

// WebSocket Connection Lifecycle
wss.on('connection', (ws: WebSocket, req) => {
  customMetrics.recordWsConnection();
  let currentPlayerId: string | null = null;
  let currentRoomId: string | null = null;

  // 15-minute lobby inactivity timeout: disconnect if connection does not join or create a room
  const joinTimeout = setTimeout(() => {
    if (!currentRoomId && ws.readyState === WebSocket.OPEN) {
      console.log('[Security] Terminating idle socket: did not join a room within 15 minutes');
      ws.close(1008, 'Timed out: Did not join a room within 15 minutes');
    }
  }, 15 * 60 * 1000);

  // Per-connection rate state
  const rateState: WsRateState = {
    msgCount: 0,
    windowStart: Date.now(),
    violations: 0,
    actionTimestamps: new Map(),
  };

  (ws as any).isAlive = true;
  ws.on('pong', () => {
    (ws as any).isAlive = true;
  });

  const send = (msg: unknown) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  };

  ws.on('message', (data: string) => {
    customMetrics.recordWsMessage();
    try {
      const msg: ClientMessage = JSON.parse(data.toString());

      // ── Global rate check ──
      const rateResult = checkWsRate(rateState);
      if (rateResult === 'terminate') {
        console.warn(`[RateLimit] Terminating abusive connection`);
        ws.close(1008, 'Rate limit exceeded');
        return;
      }
      if (rateResult === 'throttled') {
        send({ type: 'ERROR', message: 'Slow down — too many messages' });
        return;
      }

      // ── Per-action cooldown check ──
      if (!checkActionCooldown(rateState, msg.type)) {
        send({ type: 'ERROR', message: 'Action too fast — please wait' });
        return;
      }

      switch (msg.type) {
        case 'CREATE_ROOM': {
          const room = roomManager.createRoom();

          // Resolve authenticated user from optional authToken
          let userId: string | undefined;
          if ((msg as any).authToken) {
            userId = userStore.getUserIdByToken((msg as any).authToken) || undefined;
          }

          const player = room.addPlayer(msg.playerName || 'Player', true, msg.avatarSeed, ws, userId);
          const token = 'tok_' + Math.random().toString(36).substring(2, 12);
          roomManager.registerSession(token, room.roomId, player.id);

          // Wire up game-end callback for stat recording
          room.onGameEnd = (roomId, results) => {
            userStore.recordGame(roomId, results);
          };

          currentPlayerId = player.id;
          currentRoomId = room.roomId;

          send({
            type: 'ROOM_CREATED',
            roomId: room.roomId,
            playerId: player.id,
            playerToken: token,
            state: room.getRoomState()
          });
          break;
        }

        case 'JOIN_ROOM': {
          const room = roomManager.getRoom(msg.roomId);
          if (!room) {
            send({ type: 'ERROR', message: `Room "${msg.roomId}" not found.`, code: 'ROOM_NOT_FOUND' });
            return;
          }

          // Resolve authenticated user from optional authToken
          let joinUserId: string | undefined;
          if ((msg as any).authToken) {
            joinUserId = userStore.getUserIdByToken((msg as any).authToken) || undefined;
          }

          // Ensure game-end callback is wired up
          if (!room.onGameEnd) {
            room.onGameEnd = (roomId, results) => {
              userStore.recordGame(roomId, results);
            };
          }

          // Check if player is reconnecting first (handles both WAITING and IN_PROGRESS)
          if (msg.existingPlayerId && room.players.has(msg.existingPlayerId)) {
            room.reconnectPlayer(msg.existingPlayerId, ws);
            currentPlayerId = msg.existingPlayerId;
            currentRoomId = room.roomId;
            send({
              type: 'ROOM_JOINED',
              roomId: room.roomId,
              playerId: msg.existingPlayerId,
              playerToken: 'reconnected',
              state: room.getRoomState()
            });
            return;
          }

          if (room.status !== 'WAITING') {
            send({ type: 'ERROR', message: 'Game has already started.' });
            return;
          }

          if (room.getPlayerCount() >= 4) {
            send({ type: 'ERROR', message: 'Room is already full (max 4 players).' });
            return;
          }

          const player = room.addPlayer(msg.playerName || 'Player', false, msg.avatarSeed, ws, joinUserId);
          const token = 'tok_' + Math.random().toString(36).substring(2, 12);
          roomManager.registerSession(token, room.roomId, player.id);

          currentPlayerId = player.id;
          currentRoomId = room.roomId;

          send({
            type: 'ROOM_JOINED',
            roomId: room.roomId,
            playerId: player.id,
            playerToken: token,
            state: room.getRoomState()
          });

          room.broadcastSync();
          break;
        }

        case 'LEAVE_ROOM': {
          const room = roomManager.getRoom(msg.roomId);
          if (room && currentPlayerId) {
            room.removePlayer(currentPlayerId, true);
            currentPlayerId = null;
            currentRoomId = null;
          }
          break;
        }

        case 'TOGGLE_READY': {
          const room = roomManager.getRoom(msg.roomId);
          if (room && currentPlayerId) {
            room.setPlayerReady(currentPlayerId);
          }
          break;
        }

        case 'CHANGE_COLOR': {
          const room = roomManager.getRoom(msg.roomId);
          if (room && currentPlayerId) {
            const success = room.changePlayerColor(currentPlayerId, msg.requestedColor);
            if (!success) {
              send({ type: 'ERROR', message: `Color ${msg.requestedColor} is already chosen.` });
            }
          }
          break;
        }

        case 'ADD_BOT': {
          const room = roomManager.getRoom(msg.roomId);
          if (room && room.hostId === currentPlayerId && room.status === 'WAITING') {
            room.addBot(msg.botName);
          }
          break;
        }

        case 'REMOVE_BOT': {
          const room = roomManager.getRoom(msg.roomId);
          if (room && room.hostId === currentPlayerId && room.status === 'WAITING') {
            room.removeBot(msg.botId);
          }
          break;
        }

        case 'START_GAME': {
          const room = roomManager.getRoom(msg.roomId);
          if (!room) return;
          if (room.hostId !== currentPlayerId) {
            send({ type: 'ERROR', message: 'Only the party host can start the game.' });
            return;
          }

          if (room.getPlayerCount() < 2) {
            send({ type: 'ERROR', message: 'Need at least 2 players to start a game (you can add bots or invite friends).' });
            return;
          }

          room.startGame();
          break;
        }

        case 'PLACE_PIECE': {
          const room = roomManager.getRoom(msg.roomId);
          if (!room || !currentPlayerId) return;

          // ── Input sanitization: clamp rotation, flip, origin to valid ranges ──
          const safeRotation = [0, 90, 180, 270].includes(msg.rotation) ? msg.rotation : 0;
          const safeFlip = msg.flip === true;
          const safeOriginX = Math.max(0, Math.min(19, Math.floor(Number(msg.originX) || 0)));
          const safeOriginY = Math.max(0, Math.min(19, Math.floor(Number(msg.originY) || 0)));
          const safePieceId = typeof msg.pieceId === 'string' ? msg.pieceId : '';

          const res = room.handleMove(
            currentPlayerId,
            safePieceId as any,
            safeRotation,
            safeFlip,
            safeOriginX,
            safeOriginY
          );

          if (!res.success) {
            send({ type: 'MOVE_REJECTED', reason: res.reason || 'Invalid move' });
          }
          break;
        }

        case 'PASS_TURN': {
          const room = roomManager.getRoom(msg.roomId);
          if (room && currentPlayerId) {
            room.handlePass(currentPlayerId);
          }
          break;
        }

        case 'CHAT': {
          const room = roomManager.getRoom(msg.roomId);
          if (room && currentPlayerId) {
            const sender = room.players.get(currentPlayerId);
            if (sender) {
              // ── Chat sanitization: trim, limit length, strip HTML ──
              let safeMessage = (typeof msg.message === 'string' ? msg.message : '').trim().substring(0, 200);
              safeMessage = safeMessage.replace(/<[^>]*>/g, ''); // strip HTML tags
              if (!safeMessage) break; // reject empty after sanitization

              room.broadcast({
                type: 'CHAT_MESSAGE',
                senderName: sender.name,
                color: sender.color,
                message: safeMessage,
                timestamp: Date.now()
              });
            }
          }
          break;
        }

        case 'PING': {
          (ws as any).isAlive = true;
          send({
            type: 'PONG',
            clientTs: msg.clientTs,
            serverTs: Date.now()
          });
          break;
        }

        default:
          break;
      }
    } catch (err) {
      console.error('[Server] Message error:', err);
    }
  });

  ws.on('close', (code: number) => {
    clearTimeout(joinTimeout);
    customMetrics.recordWsDisconnection();
    customMetrics.recordWsDisconnect(code || 1000);
    if ((ws as any).isReplaced) {
      console.log(`[Server] Socket replaced for player ${currentPlayerId}, skipping disconnect`);
      return;
    }
    if (currentRoomId && currentPlayerId) {
      const room = roomManager.getRoom(currentRoomId);
      if (room) {
        room.removePlayer(currentPlayerId, false);
      }
    }
  });

  ws.on('error', (err) => {
    console.error('[Server] WS error:', err);
  });
});

// Periodic heartbeat to actively detect dropped/suspended mobile connections
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((clientWs) => {
    const extWs = clientWs as any;
    if (extWs.isAlive === false) {
      console.log('[Heartbeat] Terminating inactive/hung socket');
      return clientWs.terminate();
    }
    extWs.isAlive = false;
    clientWs.ping();
  });
}, 5000);

wss.on('close', () => {
  clearInterval(heartbeatInterval);
});

const PORT = Number(process.env.PORT) || 3001;
// Listen on 0.0.0.0 so devices on local Wi-Fi can connect
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🎮 Blokus Game Server running on port ${PORT} (0.0.0.0)`);
  console.log(`🔌 WebSocket Endpoint: ws://0.0.0.0:${PORT}/ws`);
});
