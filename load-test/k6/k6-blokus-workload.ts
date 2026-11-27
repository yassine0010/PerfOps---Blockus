import ws from 'k6/ws';
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Gauge, Rate, Trend } from 'k6/metrics';
import { findFirstLegalMove } from '../../shared/validator.ts';
import { ALL_PIECE_IDS } from '../../shared/pieces.ts';
import type { PieceId, PlayerColor, RoomState, ServerMessage } from '../../shared/types.ts';

// ─── SRE / Performance Observability Metrics ───────────────────
export const moveRoundtripMs = new Trend('blokus_move_duration_ms', true);
export const gameDurationSec = new Trend('blokus_game_duration_s', true);
export const movesTotal = new Counter('blokus_moves_total');
export const passesTotal = new Counter('blokus_passes_total');
export const gamesCompleted = new Counter('blokus_games_completed');
export const moveRejectedTotal = new Counter('blokus_moves_rejected');
export const wsErrors = new Rate('blokus_ws_errors');
export const joinDurationMs = new Trend('blokus_join_duration_ms', true);
export const joinSuccess = new Rate('blokus_join_success');

// ─── Custom WebSocket & Engine Observability Metrics ───────────
// (Informational load test metrics — no failing thresholds configured)
export const k6ActiveWsConnections = new Gauge('blokus_active_ws_connections');
export const k6WsDisconnectsTotal = new Counter('blokus_ws_disconnects_total');
export const k6MessagesReceivedTotal = new Counter('blokus_messages_received_total');
export const k6MovesRejectedByReason = new Counter('blokus_moves_rejected_by_reason');

// SLI-6: Pages Speed (HTTP endpoints)
export const pageResponseMs = new Trend('blokus_page_response_ms', true);
export const pageSuccessRate = new Rate('blokus_page_success_rate');

// ─── Default k6 Workload Options ───────────────────────────────
export const options = {
  scenarios: {
    blokus_load_test: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: __ENV.RAMP_UP || '20s', target: parseInt(__ENV.TARGET_VUS || '10', 10) },  // Ramp-up
        { duration: __ENV.HOLD || '40s', target: parseInt(__ENV.TARGET_VUS || '10', 10) },     // Steady-state soak
        { duration: __ENV.RAMP_DOWN || '15s', target: 0 },                                      // Clean drain
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    blokus_move_duration_ms: ['p(95)<200'],          // SLI-3: 95% of moves confirmed under 200ms
    blokus_ws_errors: ['rate<0.02'],                 // Error rate < 2%
    blokus_join_duration_ms: ['p(95)<500', 'p(99)<1000'], // 95% of joins under 500ms
    blokus_join_success: ['rate>0.98'],              // Join success rate > 98%
    blokus_page_response_ms: ['p(95)<1000'],         // SLI-6: 95% of page requests under 1000ms
    blokus_page_success_rate: ['rate>0.98'],         // 98% of page requests succeed
  },
};

export function setup() {
  const shouldProfile = __ENV.PROFILE === 'true' || __ENV.PROFILE === '1';
  const httpHost = __ENV.HTTP_HOST || __ENV.WS_HOST || 'localhost:3001';
  const httpProtocol = __ENV.HTTP_PROTOCOL || 'http';
  const baseUrl = `${httpProtocol}://${httpHost}`;

  if (!shouldProfile) {
    return { isProfiling: false, baseUrl };
  }

  console.log(`[k6 setup] Initiating V8 CPU Profile capture at ${baseUrl}/api/debug/profile/start`);
  try {
    const res = http.post(`${baseUrl}/api/debug/profile/start`, JSON.stringify({}), {
      headers: { 'Content-Type': 'application/json' },
    });
    if (res.status === 200) {
      console.log('🔥 [k6 setup] V8 CPU Profiler active on server. Profiling load test execution...');
      return { isProfiling: true, baseUrl };
    } else {
      console.warn(`[k6 setup] Profiler start responded with HTTP ${res.status}`);
    }
  } catch (err) {
    console.warn('[k6 setup] Failed to trigger profiler start:', err);
  }
  return { isProfiling: false, baseUrl };
}

export function teardown(data: { isProfiling: boolean; baseUrl?: string }) {
  if (!data || !data.isProfiling) return;

  const baseUrl = data.baseUrl || `http://${__ENV.HTTP_HOST || __ENV.WS_HOST || 'localhost:3001'}`;
  console.log(`[k6 teardown] Stopping V8 CPU Profile capture at ${baseUrl}/api/debug/profile/stop`);
  try {
    const res = http.post(`${baseUrl}/api/debug/profile/stop`, JSON.stringify({ filename: 'load-test.cpuprofile' }), {
      headers: { 'Content-Type': 'application/json' },
    });
    if (res.status === 200) {
      const body = JSON.parse(res.body as string);
      console.log(`\n================================================================`);
      console.log(`✅ [k6 teardown] V8 CPU Profile captured successfully!`);
      console.log(`⏱️  Duration: ${body.durationMs}ms`);
      console.log(`📁 Saved to: ${body.filepath}`);
      console.log(`📊 View Interactive Flamegraph:`);
      console.log(`   npx speedscope "${body.filepath}"`);
      console.log(`   or drag & drop into Chrome DevTools (Performance tab -> Load Profile)`);
      console.log(`================================================================\n`);
    } else {
      console.warn(`[k6 teardown] Profiler stop responded with HTTP ${res.status}`);
    }
  } catch (err) {
    console.warn('[k6 teardown] Failed to stop profiler:', err);
  }
}

export default function () {
  const wsHost = __ENV.WS_HOST || 'localhost:3001';
  const httpHost = __ENV.HTTP_HOST || wsHost;
  const httpProtocol = __ENV.HTTP_PROTOCOL || 'http';
  const baseUrl = `${httpProtocol}://${httpHost}`;
  const url = `ws://${wsHost}/ws`;
  const thinkDelaySec = parseFloat(__ENV.THINK_DELAY_SEC || '0.6'); // 600ms default think time

  const vuId = __VU;
  const iterId = __ITER;
  const botName = `k6-bot-${vuId}-${iterId}`;

  // ─── 1. SLI-6: Test HTTP Page Endpoints Under Load ────────────
  // Test Leaderboard endpoint
  const lbRes = http.get(`${baseUrl}/api/leaderboard`, { tags: { name: 'GetLeaderboard' } });
  pageResponseMs.add(lbRes.timings.duration);
  pageSuccessRate.add(lbRes.status === 200 ? 1 : 0);
  check(lbRes, { 'Leaderboard HTTP 200': (r) => r.status === 200 });

  // Test Profile endpoint
  const profRes = http.get(`${baseUrl}/api/profile/${botName}`, { tags: { name: 'GetProfile' } });
  pageResponseMs.add(profRes.timings.duration);
  pageSuccessRate.add(profRes.status < 500 ? 1 : 0);
  check(profRes, { 'Profile HTTP < 500': (r) => r.status < 500 });

  // ─── 2. WebSocket Real-time Gameplay ──────────────────────────
  let roomId: string | null = null;
  let playerId: string | null = null;
  let currentState: RoomState | null = null;
  let pendingMoveSentAt: number | null = null;
  let joinSentAt: number = 0;
  let isActing = false;
  let gameStartTime = 0;

  function handleTurn(sock: any) {
    if (!currentState || currentState.status !== 'IN_PROGRESS' || !playerId || !roomId) return;

    // Check if it's this VU's active turn
    if (currentState.activePlayerId !== playerId) return;

    // Lock to prevent concurrent move calculation on rapid state broadcasts
    if (isActing) return;
    isActing = true;

    try {
      const color = currentState.currentTurn;
      const colorState = currentState.colorStates[color];

      if (!colorState || colorState.remainingPieces.length === 0 || colorState.hasPassed) {
        passesTotal.add(1);
        sleep(1.05); // respect PASS_TURN 1000ms cooldown
        sock.send(JSON.stringify({ type: 'PASS_TURN', roomId }));
        return;
      }

      // Paced think time to simulate realistic human delay & satisfy 500ms PLACE_PIECE cooldown
      sleep(thinkDelaySec);

      const isFirst = colorState.remainingPieces.length === ALL_PIECE_IDS.length;
      const candidate = findFirstLegalMove(currentState.board, colorState.remainingPieces, color, isFirst);

      if (candidate) {
        pendingMoveSentAt = Date.now();
        sock.send(JSON.stringify({
          type: 'PLACE_PIECE',
          roomId,
          pieceId: candidate.pieceId,
          rotation: candidate.rotation,
          flip: candidate.flip,
          originX: candidate.originX,
          originY: candidate.originY
        }));
      } else {
        // No legal moves remaining for this color
        passesTotal.add(1);
        sleep(Math.max(0.5, 1.05 - thinkDelaySec));
        sock.send(JSON.stringify({ type: 'PASS_TURN', roomId }));
      }
    } finally {
      isActing = false;
    }
  }

  const res = ws.connect(url, {}, function (socket) {
    socket.on('open', () => {
      k6ActiveWsConnections.add(1);
      // 1. Create Room as Host
      joinSentAt = Date.now();
      socket.send(JSON.stringify({
        type: 'CREATE_ROOM',
        playerName: botName
      }));
    });

    socket.on('message', (data: string) => {
      k6MessagesReceivedTotal.add(1);
      try {
        const msg: ServerMessage = JSON.parse(data);

        switch (msg.type) {
          case 'ROOM_CREATED': {
            if (joinSentAt > 0) {
              joinDurationMs.add(Date.now() - joinSentAt);
              joinSuccess.add(1);
              joinSentAt = 0;
            }
            roomId = msg.roomId;
            playerId = msg.playerId;
            currentState = msg.state;

            // 2. Add 3 server bots to complete the 4-player room.
            // Note: server enforces a 1000ms cooldown between ADD_BOT actions.
            sleep(0.2);
            socket.send(JSON.stringify({ type: 'ADD_BOT', roomId, botName: 'Echo-Bot' }));

            sleep(1.05);
            socket.send(JSON.stringify({ type: 'ADD_BOT', roomId, botName: 'Foxtrot-Bot' }));

            sleep(1.05);
            socket.send(JSON.stringify({ type: 'ADD_BOT', roomId, botName: 'Golf-Bot' }));

            // 3. Start the game once all 4 slots are filled
            sleep(0.5);
            gameStartTime = Date.now();
            socket.send(JSON.stringify({ type: 'START_GAME', roomId }));
            break;
          }

          case 'MOVE_ACCEPTED': {
            // Measure Move Round-Trip Latency (send -> broadcast received)
            if (pendingMoveSentAt !== null && msg.move.playerId === playerId) {
              const rtt = Date.now() - pendingMoveSentAt;
              moveRoundtripMs.add(rtt);
              movesTotal.add(1);
              pendingMoveSentAt = null;
            }
            currentState = msg.state;
            handleTurn(socket);
            break;
          }

          case 'ROOM_STATE_SYNC': {
            currentState = msg.state;
            handleTurn(socket);
            break;
          }

          case 'PLAYER_PASSED': {
            break;
          }

          case 'GAME_OVER': {
            gamesCompleted.add(1);
            if (gameStartTime > 0) {
              const elapsedSec = (Date.now() - gameStartTime) / 1000;
              gameDurationSec.add(elapsedSec);
            }
            socket.close();
            break;
          }

          case 'MOVE_REJECTED': {
            const rawReason = (msg.reason || '').toLowerCase();
            const reasonTag = rawReason.includes('quickly') ? 'anti_replay'
              : rawReason.includes('turn') ? 'not_your_turn'
              : rawReason.includes('edge') ? 'touching_edge'
              : rawReason.includes('corner') ? 'no_corner_contact'
              : 'illegal_placement';
            k6MovesRejectedByReason.add(1, { reason: reasonTag });
            moveRejectedTotal.add(1);
            pendingMoveSentAt = null;
            // Fallback: pass turn if move rejected to avoid stalling the room
            if (roomId) {
              sleep(1.05); // respect 1000ms PASS_TURN cooldown
              socket.send(JSON.stringify({ type: 'PASS_TURN', roomId }));
            }
            break;
          }

          case 'ERROR': {
            if (joinSentAt > 0) {
              joinSuccess.add(0);
              joinSentAt = 0;
            }
            wsErrors.add(1);
            break;
          }
        }
      } catch (err) {
        if (joinSentAt > 0) {
          joinSuccess.add(0);
          joinSentAt = 0;
        }
        wsErrors.add(1);
      }
    });

    socket.on('close', (code?: number) => {
      k6ActiveWsConnections.add(-1);
      k6WsDisconnectsTotal.add(1, { code: String(code || 1000) });
    });

    socket.on('error', () => {
      k6WsDisconnectsTotal.add(1, { code: '1006' });
      if (joinSentAt > 0) {
        joinSuccess.add(0);
        joinSentAt = 0;
      }
      wsErrors.add(1);
    });
  });

  check(res, { 'WebSocket connected successfully': (r) => r && r.status === 101 });
}
