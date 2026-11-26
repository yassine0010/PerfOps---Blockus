# 🤖 AGENTS.md — PerfOps Blokus AI Context & Architecture Hub

> **For AI Assistants & LLMs:** Read this file first. It contains everything needed to understand the project architecture, directory structure, game engine rules, and development workflows without having to scan the entire repository from scratch.

---

## 📌 1. Project Overview & Core Mission

**PerfOps Blokus** is a high-performance, real-time multiplayer implementation of the classic strategy board game **Blokus** built with:
- **Frontend:** React 19, TypeScript 5.7, Vite 6.1, Vanilla CSS.
- **Backend:** Node.js, Express 4.21, `ws` (WebSockets), `better-sqlite3`.
- **Shared Engine:** Isomorphic TypeScript rules engine used by client, server, and load testing bots.
- **Load Testing:** Grafana k6 workload simulating headless bots playing authoritative games to test stability and connection limits under load.

### Core Architectural Decisions:
1. **Decoupled Client-Server:** WebSockets (`ws://<host>:3001/ws`) handle sub-10ms real-time game turns; Express HTTP REST endpoints handle durable user accounts, profiles, and leaderboards.
2. **In-Memory Live Gameplay:** Active games, turn timers, and piece states live strictly in RAM (`GameRoom`) for zero-database overhead during live play.
3. **Durable Persistence on Game Over:** Match results and user stats are asynchronously flushed to SQLite (`data/blokus.db`) only *after* a match concludes.
4. **Authoritative Validation:** The server validates every move using [`shared/validator.ts`](file:///Users/yassinebenayed/Desktop/Si%20Yessine/devops/projects/PerfOps%20-%20Blockus/shared/validator.ts). The client performs optimistic pre-checks for instant UI response.

---

## 🗂️ 2. Repository Directory Map

```text
PerfOps - Blockus/
├── AGENTS.md                      # <── THIS FILE: Instant context for any AI assistant
├── ARCHITECTURE.md                # System components & data flow diagram
├── blokus-online-architecture.md  # Deep SRE scaling paper (Redis, WebSockets, k6, backpressure)
├── blokus.conf                    # Nginx reverse proxy template (rate limits, WS upgrade, anti-Slowloris)
├── TODO_SECURITY_DEFERRED.md      # Security backlog (Express rate limiting, scrypt, socket caps)
├── package.json                   # Root orchestration scripts
│
├── client/                        # Frontend Single Page Application
│   ├── src/
│   │   ├── components/            # UI Screens & Board components
│   │   │   ├── Board.tsx          # 20x20 SVG board, magnifier loupe, touch handling, check-button
│   │   │   ├── PieceTray.tsx      # Remaining pieces inventory, rotate & flip controls
│   │   │   ├── MatchScreen.tsx    # In-game HUD, turn timers, score panel, 2P color switcher
│   │   │   ├── LobbyScreen.tsx    # Room creation, 6-letter join codes, bot controls, color select
│   │   │   ├── SplashScreen.tsx   # Entry landing page, auth modals (Login/Register)
│   │   │   ├── ProfileScreen.tsx  # Career stats, win rates, match history
│   │   │   ├── LeaderboardScreen.tsx # Top player rankings
│   │   │   ├── SettingsModal.tsx  # Placement modes (Floating check, Double tap, Bottom bar), Audio
│   │   │   └── RulesScreen.tsx    # Interactive rules walkthrough
│   │   ├── hooks/
│   │   │   ├── useGameSocket.ts   # WebSocket state machine, auto-reconnect, heartbeat ping/pong
│   │   │   └── useAuth.ts         # User auth tokens, localStorage, profile sync
│   │   ├── utils/
│   │   │   └── sound.ts           # Web Audio API procedural sound FX (zero audio asset files)
│   │   ├── App.tsx                # Screen routing & disconnection toast banners
│   │   ├── index.css              # Global styles, dark theme palette, glassmorphism tokens
│   │   └── main.tsx               # Vite entry point
│   ├── package.json               # Client dependencies (React 19, Lucide, Canvas Confetti)
│   └── vite.config.ts             # Host 0.0.0.0, port 3000, proxy for /api and /ws
│
├── server/                        # Backend Real-time WebSocket & REST Server
│   ├── src/
│   │   ├── server.ts              # HTTP & WS server, Anti-Slowloris timeouts, rate limiters, cooldowns
│   │   ├── gameRoom.ts            # Authoritative game loop, 30s timers, 2P/3P/4P turn cycles, bot AI
│   │   ├── roomManager.ts         # In-memory room directory (6-char codes), session tokens
│   │   └── userStore.ts           # SQLite store (users, passwords, stats, match history)
│   ├── data/                      # Local SQLite database (blokus.db)
│   ├── package.json               # Server dependencies (express, ws, better-sqlite3, tsx)
│   └── tsconfig.json              # TypeScript compilation settings
│
├── shared/                        # Isomorphic Rules Engine (Shared by Client, Server, k6)
│   ├── board.ts                   # Board size (20x20), corner coords, piece transformation matrix
│   ├── pieces.ts                  # All 21 standard Blokus polyominoes (I1 to X5 shapes)
│   ├── types.ts                   # Full protocol contracts (ClientMessage, ServerMessage, RoomState)
│   └── validator.ts               # Move validation (vacancy, bounds, corners, edges) & bot move solver
│
└── load-test/                     # Load Testing Workload
    ├── k6/
    │   └── k6-blokus-workload.ts  # k6 scenario (connects, creates room, adds bots, plays legal moves)
    ├── build-k6.ts                # esbuild script bundling TypeScript k6 test to standalone JS
    ├── dist/                      # Compiled k6 bundle (k6-blokus-workload.js)
    └── README.md                  # Load testing guide and scripts
```

---

## 🎮 3. Game Rules & Mechanics

The game uses a **20×20 grid** with **4 colors** (`Blue`, `Yellow`, `Red`, `Green`). Each color has **21 unique polyomino pieces** (89 squares total).

### Placement Rules:
1. **First Move:** Must cover the player's assigned starting corner:
   - `Blue`: `(0, 0)` (Top-Left)
   - `Yellow`: `(19, 0)` (Top-Right)
   - `Red`: `(19, 19)` (Bottom-Right)
   - `Green`: `(0, 19)` (Bottom-Left)
2. **Subsequent Moves:**
   - Must touch at least one **corner** (diagonal) of an existing piece of the **same color**.
   - Must **NEVER** touch an **edge** (orthogonal) of an existing piece of the **same color**.
   - May touch opposing colors along edges without restriction.
3. **Turn Order:** `Blue ➔ Yellow ➔ Red ➔ Green`.
4. **2-Player Mode:** Player 1 controls `Blue + Red`; Player 2 controls `Yellow + Green`.
5. **3-Player Mode:** Players take Blue, Yellow, Red; Green is a shared neutral color played alternately.
6. **Passing & Game End:** If a player has no legal moves, they pass. When all players have passed, the game ends. Lowest remaining square count wins (+15 bonus for placing all pieces; +20 if monomino is placed last).

> **CRITICAL CODE RULE:** If modifying game rules, update [`shared/validator.ts`](file:///Users/yassinebenayed/Desktop/Si%20Yessine/devops/projects/PerfOps%20-%20Blockus/shared/validator.ts) and [`shared/board.ts`](file:///Users/yassinebenayed/Desktop/Si%20Yessine/devops/projects/PerfOps%20-%20Blockus/shared/board.ts). **Never** duplicate validation logic separately in client or server.

---

## ⚡ 4. Real-time Protocol & Security

### WebSocket Messages:
- **Client to Server:** `CREATE_ROOM`, `JOIN_ROOM`, `SET_READY`, `CHANGE_COLOR`, `ADD_BOT`, `REMOVE_BOT`, `START_GAME`, `PLACE_PIECE`, `PASS_TURN`, `LEAVE_ROOM`.
- **Server to Client:** `ROOM_CREATED`, `ROOM_STATE`, `GAME_STARTED`, `MOVE_ACCEPTED`, `MOVE_REJECTED`, `GAME_OVER`, `PLAYER_DISCONNECTED`, `PLAYER_RECONNECTED`, `ERROR`.

### Built-in Security Protections in [`server/src/server.ts`](file:///Users/yassinebenayed/Desktop/Si%20Yessine/devops/projects/PerfOps%20-%20Blockus/server/src/server.ts):
- **Anti-Slowloris:** `headersTimeout: 6s`, `requestTimeout: 15s`, `keepAliveTimeout: 5s`.
- **WebSocket Frame Cap:** `maxPayload: 4096` bytes (4 KB max per frame).
- **Global Rate Limiting:** 20 messages/sec per WebSocket connection (terminates on repeated violations).
- **Action Cooldowns:** Minimum intervals between sensitive actions:
  - `PLACE_PIECE`: 500ms
  - `PASS_TURN`: 1000ms
  - `ADD_BOT` / `REMOVE_BOT`: 1000ms
  - `CREATE_ROOM`: 5000ms
  - `JOIN_ROOM`: 2000ms
  - `START_GAME`: 3000ms

---

## 🚀 5. Developer Commands & Workflows

### Running Locally:
```bash
# 1. Start both server (port 3001) and client (port 3000)
npm run dev

# Or run in separate terminal tabs:
npm run dev:server   # Backend (http://localhost:3001)
npm run dev:client   # Frontend (http://localhost:3000)
```

### Running k6 Load Tests:
```bash
# Compile k6 bundle from TypeScript
npm run build:k6

# Run smoke test (1 VU, 30s)
npm run k6:smoke

# Run standard load test (10 VUs / 40 players)
npm run k6:run

# Run stress test (25 VUs / 100 players, 2m)
npm run k6:stress
```

### Freeing Ports If Stale (3000 / 3001):
```bash
lsof -ti:3000 | xargs kill -9
lsof -ti:3001 | xargs kill -9
```

---

## 🎯 6. Instructions for AI Coding Assistants

When interacting with this codebase:
1. **Refer to this file (`AGENTS.md`)** before scanning the rest of the workspace.
2. **Preserve shared logic:** Any board, piece, or game rule modifications **must** be implemented inside [`shared/`](file:///Users/yassinebenayed/Desktop/Si%20Yessine/devops/projects/PerfOps%20-%20Blockus/shared).
3. **Respect action cooldowns:** When writing or testing WebSocket scripts, ensure requests adhere to `ACTION_COOLDOWNS` in `server.ts` (e.g. 1000ms pause between `ADD_BOT`).
4. **Maintain documentation integrity:** Do not delete existing comments or architecture docs.
