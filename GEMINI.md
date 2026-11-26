# 🧠 GEMINI.md — Project Guidelines & Instant Context

> This workspace uses [AGENTS.md](file:///Users/yassinebenayed/Desktop/Si%20Yessine/devops/projects/PerfOps%20-%20Blockus/AGENTS.md) as the comprehensive Single Source of Truth for architecture, directory mapping, protocol specifications, and development runbooks.

---

## ⚡ Directives for the AI Assistant

1. **Do not re-scan the entire project from scratch:** Consult [AGENTS.md](file:///Users/yassinebenayed/Desktop/Si%20Yessine/devops/projects/PerfOps%20-%20Blockus/AGENTS.md) for full context on architecture, components, game rules, and commands.
2. **Shared Engine Invariant:** All game validation rules, board geometry, and polyomino piece definitions reside in [`shared/`](file:///Users/yassinebenayed/Desktop/Si%20Yessine/devops/projects/PerfOps%20-%20Blockus/shared). Never duplicate game logic separately in `client/` or `server/`.
3. **Real-Time Architecture:** Active game rooms are stored in RAM (`server/src/gameRoom.ts`). Durable persistence (`server/src/userStore.ts`) is only written asynchronously when a match ends.
4. **WebSocket Protections:** Respect `ACTION_COOLDOWNS` (500ms `PLACE_PIECE`, 1000ms `ADD_BOT`, etc.) and rate limits defined in `server/src/server.ts` when building or testing bot clients.
