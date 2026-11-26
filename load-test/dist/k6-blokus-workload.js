// load-test/k6/k6-blokus-workload.ts
import ws from "k6/ws";
import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Gauge, Rate, Trend } from "k6/metrics";

// shared/board.ts
var BOARD_SIZE = 20;
var STARTING_CORNERS = {
  YELLOW: [0, 0],
  // Top-Left
  RED: [19, 0],
  // Top-Right
  GREEN: [19, 19],
  // Bottom-Right
  BLUE: [0, 19]
  // Bottom-Left
};
function rotateMatrix(matrix, rotation) {
  const normalizedRot = (rotation % 360 + 360) % 360;
  let result = matrix.map((row) => [...row]);
  const steps = Math.floor(normalizedRot / 90) % 4;
  for (let s = 0; s < steps; s++) {
    const rows = result.length;
    const cols = result[0].length;
    const rotated = [];
    for (let c = 0; c < cols; c++) {
      rotated.push(new Array(rows).fill(0));
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        rotated[c][rows - 1 - r] = result[r][c];
      }
    }
    result = rotated;
  }
  return result;
}
function flipMatrix(matrix, flip) {
  if (!flip) return matrix.map((row) => [...row]);
  return matrix.map((row) => [...row].reverse());
}
function transformShape(matrix, rotation, flip) {
  const flipped = flipMatrix(matrix, flip);
  return rotateMatrix(flipped, rotation);
}
function getShapeCells(matrix) {
  const cells = [];
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      if (matrix[r][c] === 1) {
        cells.push([c, r]);
      }
    }
  }
  return cells;
}

// shared/pieces.ts
var PIECES = {
  O1: {
    id: "O1",
    name: "1-Square (Monomino)",
    size: 1,
    shape: [
      [1]
    ]
  },
  I2: {
    id: "I2",
    name: "2-Bar (Domino)",
    size: 2,
    shape: [
      [1, 1]
    ]
  },
  I3: {
    id: "I3",
    name: "3-Bar",
    size: 3,
    shape: [
      [1, 1, 1]
    ]
  },
  V3: {
    id: "V3",
    name: "3-Corner",
    size: 3,
    shape: [
      [1, 0],
      [1, 1]
    ]
  },
  I4: {
    id: "I4",
    name: "4-Bar",
    size: 4,
    shape: [
      [1, 1, 1, 1]
    ]
  },
  L4: {
    id: "L4",
    name: "4-L",
    size: 4,
    shape: [
      [1, 0],
      [1, 0],
      [1, 1]
    ]
  },
  T4: {
    id: "T4",
    name: "4-T",
    size: 4,
    shape: [
      [1, 1, 1],
      [0, 1, 0]
    ]
  },
  O4: {
    id: "O4",
    name: "4-Square",
    size: 4,
    shape: [
      [1, 1],
      [1, 1]
    ]
  },
  Z4: {
    id: "Z4",
    name: "4-Z",
    size: 4,
    shape: [
      [1, 1, 0],
      [0, 1, 1]
    ]
  },
  F5: {
    id: "F5",
    name: "5-F",
    size: 5,
    shape: [
      [0, 1, 1],
      [1, 1, 0],
      [0, 1, 0]
    ]
  },
  I5: {
    id: "I5",
    name: "5-Bar",
    size: 5,
    shape: [
      [1, 1, 1, 1, 1]
    ]
  },
  L5: {
    id: "L5",
    name: "5-L",
    size: 5,
    shape: [
      [1, 0],
      [1, 0],
      [1, 0],
      [1, 1]
    ]
  },
  P5: {
    id: "P5",
    name: "5-P",
    size: 5,
    shape: [
      [1, 1],
      [1, 1],
      [1, 0]
    ]
  },
  N5: {
    id: "N5",
    name: "5-N",
    size: 5,
    shape: [
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 1]
    ]
  },
  T5: {
    id: "T5",
    name: "5-T",
    size: 5,
    shape: [
      [1, 1, 1],
      [0, 1, 0],
      [0, 1, 0]
    ]
  },
  U5: {
    id: "U5",
    name: "5-U",
    size: 5,
    shape: [
      [1, 0, 1],
      [1, 1, 1]
    ]
  },
  V5: {
    id: "V5",
    name: "5-V",
    size: 5,
    shape: [
      [1, 0, 0],
      [1, 0, 0],
      [1, 1, 1]
    ]
  },
  W5: {
    id: "W5",
    name: "5-W",
    size: 5,
    shape: [
      [1, 0, 0],
      [1, 1, 0],
      [0, 1, 1]
    ]
  },
  X5: {
    id: "X5",
    name: "5-Cross",
    size: 5,
    shape: [
      [0, 1, 0],
      [1, 1, 1],
      [0, 1, 0]
    ]
  },
  Y5: {
    id: "Y5",
    name: "5-Y",
    size: 5,
    shape: [
      [0, 1],
      [1, 1],
      [0, 1],
      [0, 1]
    ]
  },
  Z5: {
    id: "Z5",
    name: "5-Z",
    size: 5,
    shape: [
      [1, 1, 0],
      [0, 1, 0],
      [0, 1, 1]
    ]
  }
};
var ALL_PIECE_IDS = Object.keys(PIECES);

// shared/validator.ts
function isValidPlacement(board, coords, color, isFirstMove) {
  if (coords.length === 0) {
    return { valid: false, reason: "Empty piece coordinates" };
  }
  for (const [x, y] of coords) {
    if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) {
      return { valid: false, reason: `Cell (${x}, ${y}) is out of bounds` };
    }
  }
  for (const [x, y] of coords) {
    if (board[y][x] !== null) {
      return { valid: false, reason: `Cell (${x}, ${y}) is already occupied` };
    }
  }
  if (isFirstMove) {
    const [startX, startY] = STARTING_CORNERS[color];
    const touchesStart = coords.some(([x, y]) => x === startX && y === startY);
    if (!touchesStart) {
      return {
        valid: false,
        reason: `First move must cover your starting corner (${startX}, ${startY})`
      };
    }
    return { valid: true };
  }
  const orthogonalOffsets = [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0]
  ];
  for (const [x, y] of coords) {
    for (const [dx, dy] of orthogonalOffsets) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE) {
        if (board[ny][nx] === color) {
          return {
            valid: false,
            reason: `Pieces cannot touch existing ${color} pieces along edges`
          };
        }
      }
    }
  }
  const diagonalOffsets = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1]
  ];
  let touchesFriendlyCorner = false;
  for (const [x, y] of coords) {
    for (const [dx, dy] of diagonalOffsets) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE) {
        if (board[ny][nx] === color) {
          touchesFriendlyCorner = true;
          break;
        }
      }
    }
    if (touchesFriendlyCorner) break;
  }
  if (!touchesFriendlyCorner) {
    return {
      valid: false,
      reason: `Move must connect corner-to-corner with at least one existing ${color} piece`
    };
  }
  return { valid: true };
}
function findFirstLegalMove(board, remainingPieces, color, isFirstMove) {
  const rotations = [0, 90, 180, 270];
  const flips = [false, true];
  let candidateTargets = null;
  if (!isFirstMove) {
    candidateTargets = [];
    const seen = /* @__PURE__ */ new Set();
    const diags = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        if (board[y][x] === color) {
          for (const [dx, dy] of diags) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE && board[ny][nx] === null) {
              const key = ny * BOARD_SIZE + nx;
              if (!seen.has(key)) {
                seen.add(key);
                candidateTargets.push([nx, ny]);
              }
            }
          }
        }
      }
    }
    if (candidateTargets.length === 0) return null;
  }
  const startCorner = isFirstMove ? STARTING_CORNERS[color] : null;
  for (const pieceId of remainingPieces) {
    const piece = PIECES[pieceId];
    if (!piece) continue;
    for (const flip of flips) {
      for (const rot of rotations) {
        const transformed = transformShape(piece.shape, rot, flip);
        const shapeCells = getShapeCells(transformed);
        let maxDx = 0, maxDy = 0;
        for (const [dx, dy] of shapeCells) {
          if (dx > maxDx) maxDx = dx;
          if (dy > maxDy) maxDy = dy;
        }
        const limitX = BOARD_SIZE - maxDx;
        const limitY = BOARD_SIZE - maxDy;
        if (startCorner) {
          const [cornerX, cornerY] = startCorner;
          for (const [dx, dy] of shapeCells) {
            const ox = cornerX - dx;
            const oy = cornerY - dy;
            if (ox < 0 || ox >= limitX || oy < 0 || oy >= limitY) continue;
            const coords = shapeCells.map(([ddx, ddy]) => [ox + ddx, oy + ddy]);
            const res = isValidPlacement(board, coords, color, true);
            if (res.valid) {
              return { pieceId, rotation: rot, flip, originX: ox, originY: oy, coords };
            }
          }
        } else if (candidateTargets) {
          const tested = /* @__PURE__ */ new Set();
          for (const [tx, ty] of candidateTargets) {
            for (const [dx, dy] of shapeCells) {
              const ox = tx - dx;
              const oy = ty - dy;
              if (ox < 0 || ox >= limitX || oy < 0 || oy >= limitY) continue;
              const key = oy * BOARD_SIZE + ox;
              if (tested.has(key)) continue;
              tested.add(key);
              const coords = shapeCells.map(([ddx, ddy]) => [ox + ddx, oy + ddy]);
              const res = isValidPlacement(board, coords, color, false);
              if (res.valid) {
                return { pieceId, rotation: rot, flip, originX: ox, originY: oy, coords };
              }
            }
          }
        }
      }
    }
  }
  return null;
}

// load-test/k6/k6-blokus-workload.ts
var moveRoundtripMs = new Trend("blokus_move_duration_ms", true);
var gameDurationSec = new Trend("blokus_game_duration_s", true);
var movesTotal = new Counter("blokus_moves_total");
var passesTotal = new Counter("blokus_passes_total");
var gamesCompleted = new Counter("blokus_games_completed");
var moveRejectedTotal = new Counter("blokus_moves_rejected");
var wsErrors = new Rate("blokus_ws_errors");
var joinDurationMs = new Trend("blokus_join_duration_ms", true);
var joinSuccess = new Rate("blokus_join_success");
var k6ActiveWsConnections = new Gauge("blokus_active_ws_connections");
var k6WsDisconnectsTotal = new Counter("blokus_ws_disconnects_total");
var k6MessagesReceivedTotal = new Counter("blokus_messages_received_total");
var k6MovesRejectedByReason = new Counter("blokus_moves_rejected_by_reason");
var pageResponseMs = new Trend("blokus_page_response_ms", true);
var pageSuccessRate = new Rate("blokus_page_success_rate");
var options = {
  scenarios: {
    blokus_load_test: {
      executor: "ramping-vus",
      startVUs: 1,
      stages: [
        { duration: __ENV.RAMP_UP || "20s", target: parseInt(__ENV.TARGET_VUS || "10", 10) },
        // Ramp-up
        { duration: __ENV.HOLD || "40s", target: parseInt(__ENV.TARGET_VUS || "10", 10) },
        // Steady-state soak
        { duration: __ENV.RAMP_DOWN || "15s", target: 0 }
        // Clean drain
      ],
      gracefulRampDown: "10s"
    }
  },
  thresholds: {
    blokus_move_duration_ms: ["p(95)<200"],
    // SLI-3: 95% of moves confirmed under 200ms
    blokus_ws_errors: ["rate<0.02"],
    // Error rate < 2%
    blokus_join_duration_ms: ["p(95)<500", "p(99)<1000"],
    // 95% of joins under 500ms
    blokus_join_success: ["rate>0.98"],
    // Join success rate > 98%
    blokus_page_response_ms: ["p(95)<1000"],
    // SLI-6: 95% of page requests under 1000ms
    blokus_page_success_rate: ["rate>0.98"]
    // 98% of page requests succeed
  }
};
function setup() {
  const shouldProfile = __ENV.PROFILE === "true" || __ENV.PROFILE === "1";
  const httpHost = __ENV.HTTP_HOST || __ENV.WS_HOST || "localhost:3001";
  const httpProtocol = __ENV.HTTP_PROTOCOL || "http";
  const baseUrl = `${httpProtocol}://${httpHost}`;
  if (!shouldProfile) {
    return { isProfiling: false, baseUrl };
  }
  console.log(`[k6 setup] Initiating V8 CPU Profile capture at ${baseUrl}/api/debug/profile/start`);
  try {
    const res = http.post(`${baseUrl}/api/debug/profile/start`, JSON.stringify({}), {
      headers: { "Content-Type": "application/json" }
    });
    if (res.status === 200) {
      console.log("\u{1F525} [k6 setup] V8 CPU Profiler active on server. Profiling load test execution...");
      return { isProfiling: true, baseUrl };
    } else {
      console.warn(`[k6 setup] Profiler start responded with HTTP ${res.status}`);
    }
  } catch (err) {
    console.warn("[k6 setup] Failed to trigger profiler start:", err);
  }
  return { isProfiling: false, baseUrl };
}
function teardown(data) {
  if (!data || !data.isProfiling) return;
  const baseUrl = data.baseUrl || `http://${__ENV.HTTP_HOST || __ENV.WS_HOST || "localhost:3001"}`;
  console.log(`[k6 teardown] Stopping V8 CPU Profile capture at ${baseUrl}/api/debug/profile/stop`);
  try {
    const res = http.post(`${baseUrl}/api/debug/profile/stop`, JSON.stringify({ filename: "load-test.cpuprofile" }), {
      headers: { "Content-Type": "application/json" }
    });
    if (res.status === 200) {
      const body = JSON.parse(res.body);
      console.log(`
================================================================`);
      console.log(`\u2705 [k6 teardown] V8 CPU Profile captured successfully!`);
      console.log(`\u23F1\uFE0F  Duration: ${body.durationMs}ms`);
      console.log(`\u{1F4C1} Saved to: ${body.filepath}`);
      console.log(`\u{1F4CA} View Interactive Flamegraph:`);
      console.log(`   npx speedscope "${body.filepath}"`);
      console.log(`   or drag & drop into Chrome DevTools (Performance tab -> Load Profile)`);
      console.log(`================================================================
`);
    } else {
      console.warn(`[k6 teardown] Profiler stop responded with HTTP ${res.status}`);
    }
  } catch (err) {
    console.warn("[k6 teardown] Failed to stop profiler:", err);
  }
}
function k6_blokus_workload_default() {
  const wsHost = __ENV.WS_HOST || "localhost:3001";
  const httpHost = __ENV.HTTP_HOST || wsHost;
  const httpProtocol = __ENV.HTTP_PROTOCOL || "http";
  const baseUrl = `${httpProtocol}://${httpHost}`;
  const url = `ws://${wsHost}/ws`;
  const thinkDelaySec = parseFloat(__ENV.THINK_DELAY_SEC || "0.6");
  const vuId = __VU;
  const iterId = __ITER;
  const botName = `k6-bot-${vuId}-${iterId}`;
  const lbRes = http.get(`${baseUrl}/api/leaderboard`, { tags: { name: "GetLeaderboard" } });
  pageResponseMs.add(lbRes.timings.duration);
  pageSuccessRate.add(lbRes.status === 200 ? 1 : 0);
  check(lbRes, { "Leaderboard HTTP 200": (r) => r.status === 200 });
  const profRes = http.get(`${baseUrl}/api/profile/${botName}`, { tags: { name: "GetProfile" } });
  pageResponseMs.add(profRes.timings.duration);
  pageSuccessRate.add(profRes.status < 500 ? 1 : 0);
  check(profRes, { "Profile HTTP < 500": (r) => r.status < 500 });
  let roomId = null;
  let playerId = null;
  let currentState = null;
  let pendingMoveSentAt = null;
  let joinSentAt = 0;
  let isActing = false;
  let gameStartTime = 0;
  function handleTurn(sock) {
    if (!currentState || currentState.status !== "IN_PROGRESS" || !playerId || !roomId) return;
    if (currentState.activePlayerId !== playerId) return;
    if (isActing) return;
    isActing = true;
    try {
      const color = currentState.currentTurn;
      const colorState = currentState.colorStates[color];
      if (!colorState || colorState.remainingPieces.length === 0 || colorState.hasPassed) {
        passesTotal.add(1);
        sleep(1.05);
        sock.send(JSON.stringify({ type: "PASS_TURN", roomId }));
        return;
      }
      sleep(thinkDelaySec);
      const isFirst = colorState.remainingPieces.length === ALL_PIECE_IDS.length;
      const candidate = findFirstLegalMove(currentState.board, colorState.remainingPieces, color, isFirst);
      if (candidate) {
        pendingMoveSentAt = Date.now();
        sock.send(JSON.stringify({
          type: "PLACE_PIECE",
          roomId,
          pieceId: candidate.pieceId,
          rotation: candidate.rotation,
          flip: candidate.flip,
          originX: candidate.originX,
          originY: candidate.originY
        }));
      } else {
        passesTotal.add(1);
        sleep(0.5);
        sock.send(JSON.stringify({ type: "PASS_TURN", roomId }));
      }
    } finally {
      isActing = false;
    }
  }
  const res = ws.connect(url, {}, function(socket) {
    socket.on("open", () => {
      k6ActiveWsConnections.add(1);
      joinSentAt = Date.now();
      socket.send(JSON.stringify({
        type: "CREATE_ROOM",
        playerName: botName
      }));
    });
    socket.on("message", (data) => {
      k6MessagesReceivedTotal.add(1);
      try {
        const msg = JSON.parse(data);
        switch (msg.type) {
          case "ROOM_CREATED": {
            if (joinSentAt > 0) {
              joinDurationMs.add(Date.now() - joinSentAt);
              joinSuccess.add(1);
              joinSentAt = 0;
            }
            roomId = msg.roomId;
            playerId = msg.playerId;
            currentState = msg.state;
            sleep(0.2);
            socket.send(JSON.stringify({ type: "ADD_BOT", roomId, botName: "Echo-Bot" }));
            sleep(1.05);
            socket.send(JSON.stringify({ type: "ADD_BOT", roomId, botName: "Foxtrot-Bot" }));
            sleep(1.05);
            socket.send(JSON.stringify({ type: "ADD_BOT", roomId, botName: "Golf-Bot" }));
            sleep(0.5);
            gameStartTime = Date.now();
            socket.send(JSON.stringify({ type: "START_GAME", roomId }));
            break;
          }
          case "MOVE_ACCEPTED": {
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
          case "ROOM_STATE_SYNC": {
            currentState = msg.state;
            handleTurn(socket);
            break;
          }
          case "PLAYER_PASSED": {
            break;
          }
          case "GAME_OVER": {
            gamesCompleted.add(1);
            if (gameStartTime > 0) {
              const elapsedSec = (Date.now() - gameStartTime) / 1e3;
              gameDurationSec.add(elapsedSec);
            }
            socket.close();
            break;
          }
          case "MOVE_REJECTED": {
            const rawReason = (msg.reason || "").toLowerCase();
            const reasonTag = rawReason.includes("quickly") ? "anti_replay" : rawReason.includes("turn") ? "not_your_turn" : rawReason.includes("edge") ? "touching_edge" : rawReason.includes("corner") ? "no_corner_contact" : "illegal_placement";
            k6MovesRejectedByReason.add(1, { reason: reasonTag });
            moveRejectedTotal.add(1);
            pendingMoveSentAt = null;
            if (roomId) {
              sleep(1.05);
              socket.send(JSON.stringify({ type: "PASS_TURN", roomId }));
            }
            break;
          }
          case "ERROR": {
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
    socket.on("close", (code) => {
      k6ActiveWsConnections.add(-1);
      k6WsDisconnectsTotal.add(1, { code: String(code || 1e3) });
    });
    socket.on("error", () => {
      k6WsDisconnectsTotal.add(1, { code: "1006" });
      if (joinSentAt > 0) {
        joinSuccess.add(0);
        joinSentAt = 0;
      }
      wsErrors.add(1);
    });
  });
  check(res, { "WebSocket connected successfully": (r) => r && r.status === 101 });
}
export {
  k6_blokus_workload_default as default,
  gameDurationSec,
  gamesCompleted,
  joinDurationMs,
  joinSuccess,
  k6ActiveWsConnections,
  k6MessagesReceivedTotal,
  k6MovesRejectedByReason,
  k6WsDisconnectsTotal,
  moveRejectedTotal,
  moveRoundtripMs,
  movesTotal,
  options,
  pageResponseMs,
  pageSuccessRate,
  passesTotal,
  setup,
  teardown,
  wsErrors
};
