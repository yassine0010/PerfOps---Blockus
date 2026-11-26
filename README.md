# 🎮 Blokus Party (PerfOps Blokus)

A modern, real-time multiplayer implementation of the classic strategy board game **Blokus**, built with **React 19**, **TypeScript**, **Vite**, and **Node.js WebSockets**.

Featuring official **2-Player, 3-Player, and 4-Player rules**, customizable **Bots**, lag-free touch controls with a **Pixel Art Magnifier Loupe**, and multiple **Placement Confirmation Modes** (Floating Check Button, Double Tap, and Classic Bottom Bar).

---

## 📁 Project Structure

```text
PerfOps - Blockus/
├── client/          # Frontend application (React 19, TypeScript, Vite)
│   ├── src/
│   │   ├── components/  # Board, PieceTray, SettingsModal, MatchScreen, LobbyScreen, etc.
│   │   ├── hooks/       # useGameSocket (WebSocket state machine & reconnects)
│   │   └── utils/       # Sound FX & audio synthesized engine
│   └── vite.config.ts   # Network host 0.0.0.0 & WebSocket proxy configuration
├── server/          # Backend WebSocket game server (Node.js, Express, ws, tsx)
│   ├── src/
│   │   ├── gameRoom.ts  # Game loop, turn timers, official 2P/3P/4P rules, bot AI
│   │   ├── roomManager.ts # Lobby creation, joining, player tracking
│   │   └── server.ts    # HTTP & WebSocket server entrypoint (Port 3001)
├── shared/          # Shared game engine code (Board logic, validator, 21 pieces)
└── package.json     # Root convenience scripts
```

---

## 🚀 How to Run the App and Server

### Prerequisites
- **Node.js** (v18.0.0 or higher recommended)
- **npm** (v9.0.0 or higher)

---

### Step 1: Initial Installation (First Time Only)

Open your terminal in the project root directory and install dependencies for both the client and the server:

```bash
# 1. Install server dependencies
cd server
npm install
cd ..

# 2. Install client dependencies
cd client
npm install
cd ..
```

---

### Step 2: Running the Server and Client

The cleanest and most reliable way to run the project is using **two separate terminal tabs** so you can view both server events and client logs clearly:

#### Terminal 1 — Start the Backend Server (Port 3001)
```bash
cd server
npm run dev
```
> You will see:
> ```text
> 🎮 Blokus Game Server running on port 3001 (0.0.0.0)
> 🔌 WebSocket Endpoint: ws://0.0.0.0:3001/ws
> ```

#### Terminal 2 — Start the Frontend Client (Port 3000)
```bash
cd client
npm run dev
```
> You will see:
> ```text
>   VITE v6.4.3  ready in 180 ms
>
>   ➜  Local:   http://localhost:3000/
>   ➜  Network: http://192.168.0.129:3000/
> ```

---

### Quick Start (Single Terminal from Project Root)

Alternatively, you can launch both services from the project root directory using:

```bash
# Run both server and client concurrently
npm run dev
```

Or run them individually from the root:
```bash
npm run dev:server   # Starts backend on port 3001
npm run dev:client   # Starts frontend on port 3000
```

---

## 📱 How to Play on Mobile / Same Wi-Fi Network

The client is configured with `host: '0.0.0.0'` and connects via your local network IP:

1. Connect your phone and computer to the **same Wi-Fi network**.
2. Find your computer's local IP address:
   - **macOS / Linux**: run `ifconfig | grep "inet " | grep -v 127.0.0.1` or look at the Vite output (`Network: http://192.168.x.x:3000/`).
   - **Windows**: run `ipconfig` (IPv4 Address).
3. On your phone's browser (Safari, Chrome, etc.), navigate to:
   ```text
   http://<YOUR_LOCAL_IP>:3000
   ```
   *(For example: `http://192.168.0.129:3000`)*

---

## 🕹️ Controls & Placement Modes

When inside a match, tap the **⚙️ Settings** icon in the top header to choose your preferred control style:

| Mode | How It Works |
| :--- | :--- |
| **🔘 Floating Check Button** *(Recommended)* | When you select a valid spot, a circular green checkmark button (`✓`) pops up directly over your piece on the board. Tap it to place instantly! |
| **👆 Double Tap on Board** | Tap once on the board to preview your piece, then tap the piece a second time to lock it in. |
| **📱 Bottom Bar Button Only** | Traditional arcade layout: tap the board to position your piece, then tap the large bottom `PLACE PIECE` button. |
| **🔍 Magnifier Loupe (ON/OFF)** | Silky-smooth, hardware-accelerated zoom popup that floats above your finger during board drag so your touch never blocks the view. |
| **🔊 Sound Effects (ON/OFF)** | Interactive audio feedback for piece placement, rotation, and turn notifications. |

---

## 🏆 Game Rules Implemented

- **4-Player Standard**: Each player controls 1 color. Order: `Blue ➔ Yellow ➔ Red ➔ Green`.
- **2-Player Official Rules**:
  - Player 1 controls **Blue + Red**.
  - Player 2 controls **Yellow + Green**.
  - Playing order: `Blue ➔ Yellow ➔ Red ➔ Green`.
  - Multi-color switcher tabs let players view inventory and remaining squares for both colors.
  - Final score is calculated across both colors controlled.
- **3-Player Official Rules**:
  - Each player controls 1 color (`Blue`, `Yellow`, `Red`).
  - Remaining color (`Green`) is shared and played alternately.
- **Bot Customization**:
  - Add bots on demand in the lobby screen and customize their names.
- **Reconnection & Forfeit Rules**:
  - **Accidental Disconnect**: 3-minute grace period with visual offline indicators; if a player's timer expires while offline, their turn simply passes.
  - **Explicit Leave**: Clicking "Leave Match" triggers a confirmation modal. Confirming acts as an **immediate forfeit**, instantly awarding victory to the remaining opponent.

---

## 🛠️ Port & Build Troubleshooting

### Freeing Ports If Lingering (3000 / 3001)
If you get `EADDRINUSE: address already in use`, kill any stale processes:
```bash
# Kill process using port 3000 (Client)
lsof -ti:3000 | xargs kill -9

# Kill process using port 3001 (Server)
lsof -ti:3001 | xargs kill -9
```

### Production Build
To check TypeScript types and build production bundles:
```bash
# Build frontend
cd client && npm run build
```
