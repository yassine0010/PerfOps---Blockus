import { WebSocket } from 'ws';
import { sliMetrics } from './sliMetrics.ts';
import { customMetrics } from './customMetrics.ts';
import { ALL_PIECE_IDS, PIECES } from '../../shared/pieces.ts';
import { BOARD_SIZE, createEmptyBoard, getPieceAbsoluteCoords, sanitizeDisplayText } from '../../shared/board.ts';
import { findBotLegalMove, findFirstLegalMove, type CandidateMove, isValidPlacement } from '../../shared/validator.ts';
import type {
  ColorState,
  GameOverRanking,
  GameStatus,
  Move,
  PieceId,
  PlayerColor,
  PlayerInfo,
  RoomState,
  ServerMessage
} from '../../shared/types.ts';

export interface RoomPlayer extends PlayerInfo {
  ws: WebSocket | null; // null for bots
  isBot?: boolean;
  originalName?: string;
  userId?: string; // Set if player authenticated via HTTP API
  reconnectTimer?: NodeJS.Timeout;
}

export interface GameEndResult {
  userId?: string;
  playerName: string;
  color: string;
  squaresRemaining: number;
  squaresPlaced: number;
  bonus: number;
  netScore: number;
  is2P: boolean;
  rank: number;
  forfeited: boolean;
}

export class GameRoom {
  public roomId: string;
  public hostId: string = '';
  private originalHostId: string = '';
  public status: GameStatus = 'WAITING';
  public round: number = 1;
  public currentTurn: PlayerColor = 'BLUE';
  public board: (PlayerColor | null)[][] = createEmptyBoard();
  public history: Move[] = [];
  public turnStartedAt: number = Date.now();
  public turnDurationSeconds: number = 90;
  public lastActivityAt: number = Date.now();
  public finishedAt: number | null = null;
  private seqCounter: number = 0;
  private gamePlayerCount: number = 0;
  private finishedWinner: PlayerColor | 'TIE' | undefined = undefined;
  private finishedRankings: GameOverRanking[] | undefined = undefined;
  private pendingGameResults: GameEndResult[] | null = null;
  private consecutiveTimeoutSkips: number = 0;
  private lastMoveTimestamps: Map<string, { round: number; at: number }> = new Map(); // Per-player same-turn anti-replay
  private botTimer: NodeJS.Timeout | null = null;
  private turnTimer: NodeJS.Timeout | null = null;

  // Callback for recording game results (set by server.ts)
  public onGameEnd?: (roomId: string, results: GameEndResult[]) => void;

  public players: Map<string, RoomPlayer> = new Map();
  private turnOrder: PlayerColor[] = ['BLUE', 'YELLOW', 'RED', 'GREEN'];

  public colorStates: Record<PlayerColor, ColorState> = {
    BLUE: { color: 'BLUE', controllerPlayerId: '', remainingPieces: [...ALL_PIECE_IDS], squaresRemaining: 89, hasPassed: false },
    YELLOW: { color: 'YELLOW', controllerPlayerId: '', remainingPieces: [...ALL_PIECE_IDS], squaresRemaining: 89, hasPassed: false },
    RED: { color: 'RED', controllerPlayerId: '', remainingPieces: [...ALL_PIECE_IDS], squaresRemaining: 89, hasPassed: false },
    GREEN: { color: 'GREEN', controllerPlayerId: '', remainingPieces: [...ALL_PIECE_IDS], squaresRemaining: 89, hasPassed: false }
  };
  public sharedColorControllerIndex: number = 0;

  public getColorControllerId(color: PlayerColor): string {
    return this.colorStates[color]?.controllerPlayerId || '';
  }

  constructor(roomId: string) {
    this.roomId = roomId;
  }

  public getPlayerCount(): number {
    return this.players.size;
  }

  public destroy(): void {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
    if (this.botTimer) {
      clearTimeout(this.botTimer);
      this.botTimer = null;
    }
    for (const player of this.players.values()) {
      if (player.reconnectTimer) {
        clearTimeout(player.reconnectTimer);
        player.reconnectTimer = undefined;
      }
    }
  }

  private isColorDone(color: PlayerColor): boolean {
    const cs = this.colorStates[color];
    return !cs || cs.hasPassed || cs.remainingPieces.length === 0;
  }

  private computePlayerHasPassed(player: RoomPlayer): boolean {
    if (player.forfeited) return true;
    const ownedColors = player.assignedColors || [player.color];
    const ownColorsDone = ownedColors.every(c => this.isColorDone(c));
    if (!ownColorsDone) return false;
    if (this.gamePlayerCount === 3) {
      return this.isColorDone('GREEN');
    }
    return true;
  }

  private syncPlayersHasPassed(): void {
    for (const player of this.players.values()) {
      player.hasPassed = this.computePlayerHasPassed(player);
    }
  }

  private transferHost(excludePlayerId?: string): void {
    const candidates = Array.from(this.players.values()).filter(
      p => p.id !== excludePlayerId && !p.isBot && !p.forfeited
    );
    const nextHost = candidates.find(p => p.isConnected) || candidates[0] || null;
    for (const p of this.players.values()) {
      p.isHost = false;
    }
    if (nextHost) {
      nextHost.isHost = true;
      this.hostId = nextHost.id;
    } else {
      this.hostId = '';
    }
  }

  private scheduleDisconnectTimeout(player: RoomPlayer, delayMs: number): void {
    if (player.reconnectTimer) clearTimeout(player.reconnectTimer);
    player.reconnectTimer = setTimeout(() => {
      player.reconnectTimer = undefined;
      if (player.isConnected) return;

      if (this.status === 'WAITING') {
        this.players.delete(player.id);
        if (this.hostId === player.id) {
          this.transferHost();
        }
        this.lastActivityAt = Date.now();
        this.broadcastSync();
      } else if (this.status === 'IN_PROGRESS' && !player.forfeited) {
        player.originalName = player.originalName || player.name;
        player.isBot = true;
        player.userId = undefined;
        player.name = player.name.endsWith(' (Bot)') ? player.name : `${player.name} (Bot)`;
        player.isConnected = true;
        player.disconnectedAt = undefined;
        player.reconnectDeadline = undefined;
        if (this.hostId === player.id) {
          this.transferHost();
        }
        this.lastActivityAt = Date.now();
        this.broadcastSync();
        this.triggerBotTurnIfNeeded();
      }
    }, delayMs);
  }

  private rotateSharedGreenController(): boolean {
    if (this.gamePlayerCount !== 3) return false;
    const playerList = Array.from(this.players.values());
    if (playerList.length === 0) return false;

    for (let step = 1; step <= playerList.length; step++) {
      const idx = (this.sharedColorControllerIndex + step) % playerList.length;
      const candidate = playerList[idx];
      if (candidate && !candidate.forfeited) {
        this.sharedColorControllerIndex = idx;
        this.colorStates['GREEN'].controllerPlayerId = candidate.id;
        return true;
      }
    }
    return false;
  }

  public addPlayer(name: string, isHost: boolean, avatarSeed?: string, ws?: WebSocket, userId?: string): RoomPlayer {
    const playerId = 'p_' + Math.random().toString(36).substring(2, 9);
    const assignedColor = this.getAvailableColor();

    // Sanitize player name & seed: trim, cap length, strip HTML
    const safeName = sanitizeDisplayText(name, 15, 'Player');
    const safeAvatarSeed = sanitizeDisplayText(avatarSeed, 32, safeName);

    const hasHumanHost = Boolean(this.hostId && this.players.get(this.hostId) && !this.players.get(this.hostId)?.isBot);
    const effectiveIsHost = isHost || !hasHumanHost;
    if (effectiveIsHost) {
      for (const p of this.players.values()) p.isHost = false;
    }

    const player: RoomPlayer = {
      id: playerId,
      name: safeName,
      originalName: safeName,
      color: assignedColor,
      isHost: effectiveIsHost,
      isReady: true,
      isConnected: true,
      hasPassed: false,
      remainingPieces: [...ALL_PIECE_IDS],
      squaresRemaining: 89,
      avatarSeed: safeAvatarSeed,
      ws: ws || null,
      isBot: false,
      userId
    };

    if (effectiveIsHost) {
      this.hostId = playerId;
      if (!this.originalHostId) {
        this.originalHostId = playerId;
      }
    }

    this.lastActivityAt = Date.now();
    this.players.set(playerId, player);
    return player;
  }

  public addBot(customName?: string, color?: PlayerColor): RoomPlayer | null {
    if (this.status !== 'WAITING' || this.players.size >= 4) return null;
    const botColor = color || this.getAvailableColor();
    const botId = 'bot_' + Math.random().toString(36).substring(2, 7);
    const presetNames = ['Nolan Bot', 'Theo Bot', 'Mia Bot', 'Leo Bot'];
    const existingNames = new Set(Array.from(this.players.values()).map(p => p.name.toLowerCase()));

    let baseName = sanitizeDisplayText(customName, 18, '');
    if (!baseName) {
      baseName = presetNames.find(n => !existingNames.has(n.toLowerCase())) || 'Bot';
    }

    let botName = baseName;
    let suffix = 2;
    while (existingNames.has(botName.toLowerCase())) {
      const candidateSuffix = ` ${suffix++}`;
      botName = baseName.substring(0, Math.max(1, 18 - candidateSuffix.length)) + candidateSuffix;
    }

    const bot: RoomPlayer = {
      id: botId,
      name: botName,
      originalName: botName,
      color: botColor,
      isHost: false,
      isReady: true,
      isConnected: true,
      hasPassed: false,
      remainingPieces: [...ALL_PIECE_IDS],
      squaresRemaining: 89,
      avatarSeed: botName,
      ws: null,
      isBot: true
    };

    this.lastActivityAt = Date.now();
    this.players.set(botId, bot);
    this.broadcastSync();
    return bot;
  }

  public removeBot(botId: string): boolean {
    const player = this.players.get(botId);
    if (!player || !player.isBot || this.status !== 'WAITING') return false;
    this.players.delete(botId);
    this.lastActivityAt = Date.now();
    this.broadcastSync();
    return true;
  }

  public kickPlayer(requesterId: string, targetPlayerId: string): { success: boolean; ws?: WebSocket | null; error?: string } {
    if (this.status !== 'WAITING') {
      return { success: false, error: 'Players can only be kicked in the lobby.' };
    }
    if (this.hostId !== requesterId) {
      return { success: false, error: 'Only the host can kick players.' };
    }
    if (targetPlayerId === requesterId) {
      return { success: false, error: 'You cannot kick yourself.' };
    }
    const target = this.players.get(targetPlayerId);
    if (!target) {
      return { success: false, error: 'Player not found.' };
    }
    if (target.reconnectTimer) {
      clearTimeout(target.reconnectTimer);
      target.reconnectTimer = undefined;
    }
    const kickedWs = target.ws;
    this.players.delete(targetPlayerId);
    this.lastActivityAt = Date.now();
    this.broadcastSync();
    return { success: true, ws: kickedWs };
  }

  public removePlayer(playerId: string, isExplicitLeave: boolean = false): void {
    const player = this.players.get(playerId);
    if (!player) return;

    this.lastActivityAt = Date.now();

    if (this.status === 'FINISHED') {
      if (player.reconnectTimer) {
        clearTimeout(player.reconnectTimer);
        player.reconnectTimer = undefined;
      }
      if (isExplicitLeave) {
        this.players.delete(playerId);
        if (this.hostId === playerId) {
          this.transferHost(playerId);
        }
      } else {
        player.isConnected = false;
        player.ws = null;
        player.disconnectedAt = undefined;
        player.reconnectDeadline = undefined;
      }
      this.broadcastSync();
      return;
    }

    if (this.status === 'WAITING') {
      if (isExplicitLeave) {
        if (player.reconnectTimer) {
          clearTimeout(player.reconnectTimer);
          player.reconnectTimer = undefined;
        }
        this.players.delete(playerId);
        if (this.hostId === playerId) {
          this.transferHost();
        }
      } else {
        // Unexpected disconnect in lobby: keep player slot for reconnection up to 180s
        player.isConnected = false;
        player.ws = null;
        player.disconnectedAt = Date.now();
        player.reconnectDeadline = Date.now() + 180000;
        this.scheduleDisconnectTimeout(player, 180000);
        this.broadcast({
          type: 'PLAYER_DISCONNECTED',
          playerId: player.id,
          playerName: player.name,
          color: player.color,
          reconnectDeadline: player.reconnectDeadline
        });
      }
    } else {
      if (isExplicitLeave) {
        // Player clicked "Leave Match" -> Immediate Forfeit & Out!
        if (player.reconnectTimer) {
          clearTimeout(player.reconnectTimer);
          player.reconnectTimer = undefined;
        }
        player.isConnected = false;
        player.ws = null;
        player.hasPassed = true;
        player.forfeited = true;
        player.disconnectedAt = undefined;
        player.reconnectDeadline = undefined;

        // Mark all colors owned exclusively by this player as passed
        const ownedColors = player.assignedColors || [player.color];
        for (const c of ownedColors) {
          if (this.colorStates[c]) {
            this.colorStates[c].hasPassed = true;
          }
        }
        this.syncPlayersHasPassed();

        if (this.hostId === playerId) {
          this.transferHost(playerId);
        }

        this.broadcast({
          type: 'PLAYER_DISCONNECTED',
          playerId: player.id,
          playerName: player.name,
          color: player.color
        });

        // Count players who have NOT forfeited (still active even if inside 3m reconnect grace)
        const activePlayers = Array.from(this.players.values()).filter(p => !p.forfeited);

        // If only 1 non-forfeited player remains, declare immediate victory
        if (activePlayers.length <= 1) {
          console.log(`[GameRoom] Only 1 active player remaining after ${player.name} left. Declaring immediate victory.`);
          this.endGame();
          return;
        }

        // Advance turn or transfer shared GREEN if leaving player held the active turn
        if (this.getColorControllerId(this.currentTurn) === playerId) {
          if (
            this.gamePlayerCount === 3 &&
            this.currentTurn === 'GREEN' &&
            !this.colorStates['GREEN'].hasPassed &&
            this.colorStates['GREEN'].remainingPieces.length > 0
          ) {
            this.rotateSharedGreenController();
            this.turnStartedAt = Date.now();
            this.startTurnTimer();
            this.triggerBotTurnIfNeeded();
          } else {
            const hasNextTurn = this.advanceTurn();
            if (!hasNextTurn) {
              this.endGame();
              return;
            }
            this.triggerBotTurnIfNeeded();
          }
        } else {
          const allDone = Object.values(this.colorStates).every(
            c => c.hasPassed || c.remainingPieces.length === 0
          );
          if (allDone) {
            this.endGame();
            return;
          }
        }
      } else {
        // In-game unexpected drop (tab close / network blip): Give a 3-minute grace period to reconnect!
        player.isConnected = false;
        player.ws = null;
        player.disconnectedAt = Date.now();

        // SLI-5: Connection Stability — count unexpected in-game disconnect
        sliMetrics.recordUnexpectedDisconnect();
        player.reconnectDeadline = Date.now() + 180000; // 3 minutes grace period
        this.scheduleDisconnectTimeout(player, 180000);

        this.broadcast({
          type: 'PLAYER_DISCONNECTED',
          playerId: player.id,
          playerName: player.name,
          color: player.color,
          reconnectDeadline: player.reconnectDeadline
        });
      }
    }

    this.broadcastSync();
  }

  public setPlayerReady(playerId: string, isReady?: boolean): void {
    const player = this.players.get(playerId);
    if (!player) return;
    player.isReady = isReady !== undefined ? isReady : !player.isReady;
    this.lastActivityAt = Date.now();
    this.broadcastSync();
  }

  public changePlayerColor(playerId: string, targetColor: PlayerColor): boolean {
    const player = this.players.get(playerId);
    if (!player || this.status !== 'WAITING') return false;

    for (const p of this.players.values()) {
      if (p.id !== playerId && p.color === targetColor) {
        return false;
      }
    }

    player.color = targetColor;
    this.lastActivityAt = Date.now();
    this.broadcastSync();
    return true;
  }

  public reconnectPlayer(playerId: string, ws: WebSocket): boolean {
    const player = this.players.get(playerId);
    if (!player || player.forfeited) return false;

    // Safely retire lingering socket without triggering unintended disconnect logic
    if (player.ws && player.ws !== ws) {
      try {
        (player.ws as any).isReplaced = true;
        player.ws.close(4001, 'Session replaced');
      } catch { }
    }

    if (player.reconnectTimer) {
      clearTimeout(player.reconnectTimer);
      player.reconnectTimer = undefined;
    }

    if (player.isBot) {
      player.isBot = false;
      player.name = player.originalName || player.name.replace(/ \(Bot\)$/, '');
      if (this.getColorControllerId(this.currentTurn) === playerId && this.botTimer) {
        clearTimeout(this.botTimer);
        this.botTimer = null;
      }
    }

    player.ws = ws;
    player.isConnected = true;
    player.disconnectedAt = undefined;
    player.reconnectDeadline = undefined;

    const currentHost = this.hostId ? this.players.get(this.hostId) : undefined;
    if (
      !currentHost ||
      currentHost.isBot ||
      currentHost.forfeited ||
      (this.originalHostId === playerId && !currentHost.isConnected)
    ) {
      for (const p of this.players.values()) {
        p.isHost = false;
      }
      player.isHost = true;
      this.hostId = player.id;
    }

    this.lastActivityAt = Date.now();

    this.broadcast({
      type: 'PLAYER_RECONNECTED',
      playerId: player.id,
      playerName: player.name,
      color: player.color
    });

    this.broadcastSync();
    return true;
  }

  public returnToLobby(requesterId: string): boolean {
    if (this.status !== 'FINISHED' || this.hostId !== requesterId) return false;

    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
    if (this.botTimer) {
      clearTimeout(this.botTimer);
      this.botTimer = null;
    }

    for (const [pid, player] of Array.from(this.players.entries())) {
      if (player.reconnectTimer) {
        clearTimeout(player.reconnectTimer);
        player.reconnectTimer = undefined;
      }
      if (player.forfeited || (!player.isConnected && !player.isBot)) {
        this.players.delete(pid);
      }
    }

    const colors: PlayerColor[] = ['BLUE', 'YELLOW', 'RED', 'GREEN'];
    const usedColors = new Set<PlayerColor>();
    for (const player of this.players.values()) {
      if (colors.includes(player.color) && !usedColors.has(player.color)) {
        usedColors.add(player.color);
      } else {
        const nextColor = colors.find(c => !usedColors.has(c)) || 'BLUE';
        usedColors.add(nextColor);
        player.color = nextColor;
      }
      player.assignedColors = undefined;
      player.isReady = true;
      player.hasPassed = false;
      player.forfeited = false;
      player.remainingPieces = [...ALL_PIECE_IDS];
      player.squaresRemaining = 89;
      player.disconnectedAt = undefined;
      player.reconnectDeadline = undefined;
    }

    if (!this.players.has(this.hostId) || this.players.get(this.hostId)?.isBot) {
      this.transferHost();
    }

    this.status = 'WAITING';
    this.round = 1;
    this.currentTurn = 'BLUE';
    this.board = createEmptyBoard();
    this.history = [];
    this.seqCounter = 0;
    this.gamePlayerCount = 0;
    this.finishedWinner = undefined;
    this.finishedRankings = undefined;
    this.pendingGameResults = null;
    this.consecutiveTimeoutSkips = 0;
    this.finishedAt = null;
    this.lastMoveTimestamps.clear();
    this.sharedColorControllerIndex = -1;
    this.colorStates = {
      BLUE: { color: 'BLUE', controllerPlayerId: '', remainingPieces: [...ALL_PIECE_IDS], squaresRemaining: 89, hasPassed: false },
      YELLOW: { color: 'YELLOW', controllerPlayerId: '', remainingPieces: [...ALL_PIECE_IDS], squaresRemaining: 89, hasPassed: false },
      RED: { color: 'RED', controllerPlayerId: '', remainingPieces: [...ALL_PIECE_IDS], squaresRemaining: 89, hasPassed: false },
      GREEN: { color: 'GREEN', controllerPlayerId: '', remainingPieces: [...ALL_PIECE_IDS], squaresRemaining: 89, hasPassed: false }
    };

    this.lastActivityAt = Date.now();
    this.broadcastSync();
    return true;
  }

  public startGame(): boolean {
    if (this.status === 'IN_PROGRESS') return false;

    const now = Date.now();
    // On rematch from FINISHED, remove forfeited or permanently disconnected players cleanly
    if (this.status === 'FINISHED') {
      for (const [pid, player] of Array.from(this.players.entries())) {
        if (player.reconnectTimer) {
          clearTimeout(player.reconnectTimer);
          player.reconnectTimer = undefined;
        }
        if (player.forfeited || (!player.isConnected && !player.isBot)) {
          this.players.delete(pid);
        }
      }
    }

    // Convert disconnected players only if their 3-minute grace period has fully expired
    for (const player of this.players.values()) {
      if (!player.isConnected && !player.isBot) {
        if (player.reconnectDeadline && now > player.reconnectDeadline) {
          player.originalName = player.originalName || player.name;
          player.isBot = true;
          player.userId = undefined;
          player.name = player.name.endsWith(' (Bot)') ? player.name : `${player.name} (Bot)`;
          player.isConnected = true;
          player.disconnectedAt = undefined;
          player.reconnectDeadline = undefined;
        } else if (player.reconnectDeadline) {
          this.scheduleDisconnectTimeout(player, Math.max(1000, player.reconnectDeadline - now));
        }
      }
    }

    // Require at least 2 players/bots to start (e.g. 1v1 or party)
    if (this.players.size < 2) {
      if (this.status === 'FINISHED') this.broadcastSync();
      return false;
    }

    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
    if (this.botTimer) {
      clearTimeout(this.botTimer);
      this.botTimer = null;
    }

    for (const player of this.players.values()) {
      player.forfeited = false;
      player.isReady = true;
      player.hasPassed = false;
    }

    if (!this.players.has(this.hostId) || this.players.get(this.hostId)?.isBot) {
      this.transferHost();
    }

    this.status = 'IN_PROGRESS';
    this.round = 1;
    this.board = createEmptyBoard();
    this.history = [];
    this.seqCounter = 0;
    this.finishedWinner = undefined;
    this.finishedRankings = undefined;
    this.pendingGameResults = null;
    this.consecutiveTimeoutSkips = 0;
    this.finishedAt = null;
    this.lastMoveTimestamps.clear();
    this.lastActivityAt = now;
    this.turnOrder = ['BLUE', 'YELLOW', 'RED', 'GREEN'];

    const playerList = Array.from(this.players.values());
    this.gamePlayerCount = playerList.length;

    if (playerList.length === 2) {
      // Official 2-Player Blokus: opposite-corner pairs ['BLUE', 'RED'] vs ['YELLOW', 'GREEN']
      // Preserve chosen lobby colors when selecting which pair each player controls.
      const PAIR_A: PlayerColor[] = ['BLUE', 'RED'];
      const PAIR_B: PlayerColor[] = ['YELLOW', 'GREEN'];
      const p1 = playerList[0];
      const p2 = playerList[1];

      let p1Pair: PlayerColor[];
      let p2Pair: PlayerColor[];

      if (PAIR_B.includes(p1.color) && !PAIR_B.includes(p2.color)) {
        p1Pair = PAIR_B;
        p2Pair = PAIR_A;
        if (!PAIR_A.includes(p2.color)) p2.color = 'BLUE';
      } else if (PAIR_A.includes(p2.color) && !PAIR_A.includes(p1.color)) {
        p1Pair = PAIR_B;
        p2Pair = PAIR_A;
        if (!PAIR_B.includes(p1.color)) p1.color = 'YELLOW';
      } else if (PAIR_B.includes(p1.color) && PAIR_B.includes(p2.color)) {
        p1Pair = PAIR_B;
        p2Pair = PAIR_A;
        p2.color = 'BLUE';
      } else {
        p1Pair = PAIR_A;
        p2Pair = PAIR_B;
        if (!PAIR_A.includes(p1.color)) p1.color = 'BLUE';
        if (!PAIR_B.includes(p2.color)) p2.color = 'YELLOW';
      }

      p1.assignedColors = [...p1Pair];
      p1.squaresRemaining = 89 * 2;
      p1.hasPassed = false;
      p1.remainingPieces = [...ALL_PIECE_IDS];

      p2.assignedColors = [...p2Pair];
      p2.squaresRemaining = 89 * 2;
      p2.hasPassed = false;
      p2.remainingPieces = [...ALL_PIECE_IDS];

      this.colorStates = {} as Record<PlayerColor, ColorState>;
      for (const p of [p1, p2]) {
        for (const c of p.assignedColors!) {
          this.colorStates[c] = {
            color: c,
            controllerPlayerId: p.id,
            remainingPieces: [...ALL_PIECE_IDS],
            squaresRemaining: 89,
            hasPassed: false
          };
        }
      }
    } else if (playerList.length === 3) {
      // Official 3-Player Blokus: Blue, Yellow, Red owned by players; Green is shared alternately.
      // Preserve chosen lobby colors among ['BLUE', 'YELLOW', 'RED'] before reassigning any 'GREEN' or duplicate.
      const threeColors: PlayerColor[] = ['BLUE', 'YELLOW', 'RED'];
      const usedThree = new Set<PlayerColor>();
      const assignedThree = new Map<string, PlayerColor>();

      for (const p of playerList) {
        if (threeColors.includes(p.color) && !usedThree.has(p.color)) {
          usedThree.add(p.color);
          assignedThree.set(p.id, p.color);
        }
      }
      for (const p of playerList) {
        if (!assignedThree.has(p.id)) {
          const fallback = threeColors.find(c => !usedThree.has(c)) || 'BLUE';
          usedThree.add(fallback);
          assignedThree.set(p.id, fallback);
        }
      }

      this.sharedColorControllerIndex = -1;
      this.colorStates = {} as Record<PlayerColor, ColorState>;
      for (const p of playerList) {
        const c = assignedThree.get(p.id)!;
        p.color = c;
        p.assignedColors = [c];
        p.squaresRemaining = 89;
        p.hasPassed = false;
        p.remainingPieces = [...ALL_PIECE_IDS];
        this.colorStates[c] = {
          color: c,
          controllerPlayerId: p.id,
          remainingPieces: [...ALL_PIECE_IDS],
          squaresRemaining: 89,
          hasPassed: false
        };
      }
      this.colorStates['GREEN'] = {
        color: 'GREEN',
        controllerPlayerId: playerList[0].id,
        remainingPieces: [...ALL_PIECE_IDS],
        squaresRemaining: 89,
        hasPassed: false
      };
    } else {
      // 4-Player Blokus: 1 color each, preserving chosen lobby colors
      const colors: PlayerColor[] = ['BLUE', 'YELLOW', 'RED', 'GREEN'];
      const usedFour = new Set<PlayerColor>();
      const assignedFour = new Map<string, PlayerColor>();

      for (const p of playerList) {
        if (colors.includes(p.color) && !usedFour.has(p.color)) {
          usedFour.add(p.color);
          assignedFour.set(p.id, p.color);
        }
      }
      for (const p of playerList) {
        if (!assignedFour.has(p.id)) {
          const fallback = colors.find(c => !usedFour.has(c)) || 'BLUE';
          usedFour.add(fallback);
          assignedFour.set(p.id, fallback);
        }
      }

      this.colorStates = {} as Record<PlayerColor, ColorState>;
      for (const p of playerList) {
        const c = assignedFour.get(p.id)!;
        p.color = c;
        p.assignedColors = [c];
        p.squaresRemaining = 89;
        p.hasPassed = false;
        p.remainingPieces = [...ALL_PIECE_IDS];
        this.colorStates[c] = {
          color: c,
          controllerPlayerId: p.id,
          remainingPieces: [...ALL_PIECE_IDS],
          squaresRemaining: 89,
          hasPassed: false
        };
      }
    }

    this.currentTurn = 'BLUE';
    this.turnStartedAt = Date.now();

    // SLI-5: Connection Stability — count real (non-bot) players entering this match
    for (const p of this.players.values()) {
      if (!p.isBot) sliMetrics.recordPlayerEnteredMatch();
    }

    this.broadcastSync();
    this.startTurnTimer();
    this.triggerBotTurnIfNeeded();
    return true;
  }

  public handleMove(
    playerId: string,
    pieceId: PieceId,
    rotation: number,
    flip: boolean,
    originX: number,
    originY: number
  ): { success: boolean; reason?: string } {
    const player = this.players.get(playerId);

    if (!player) {
      sliMetrics.recordMoveRejected();
      customMetrics.recordMoveRejectedReason('not_in_room');
      return { success: false, reason: 'Player not in room' };
    }
    if (this.status !== 'IN_PROGRESS') {
      if (!player.isBot) {
        sliMetrics.recordMoveRejected();
        customMetrics.recordMoveRejectedReason('not_in_progress');
      }
      return { success: false, reason: 'Game is not in progress' };
    }

    const currentControllerId = this.getColorControllerId(this.currentTurn);
    if (playerId !== currentControllerId) {
      if (!player.isBot) {
        sliMetrics.recordMoveRejected();
        customMetrics.recordMoveRejectedReason('not_your_turn');
      }
      return { success: false, reason: `It is currently ${this.currentTurn}'s turn` };
    }

    const pieceDef = ALL_PIECE_IDS.includes(pieceId) ? PIECES[pieceId] : undefined;
    if (!pieceDef) {
      if (!player.isBot) {
        sliMetrics.recordMoveRejected();
        customMetrics.recordMoveRejectedReason('unknown_piece_id');
      }
      return { success: false, reason: 'Unknown piece ID' };
    }

    const currentColorState = this.colorStates[this.currentTurn];
    if (!currentColorState || !currentColorState.remainingPieces.includes(pieceId)) {
      if (!player.isBot) {
        sliMetrics.recordMoveRejected();
        customMetrics.recordMoveRejectedReason('piece_already_placed');
      }
      return { success: false, reason: 'You have already placed this piece' };
    }

    // Anti-replay: reject duplicate submissions within the same (player, color, round) turn < 200ms
    const now = Date.now();
    const moveKey = `${playerId}:${this.currentTurn}`;
    const prevMove = this.lastMoveTimestamps.get(moveKey);
    if (prevMove && prevMove.round === this.round && now - prevMove.at < 200) {
      if (!player.isBot) {
        sliMetrics.recordMoveRejected();
        customMetrics.recordMoveRejectedReason('anti_replay');
      }
      return { success: false, reason: 'Move submitted too quickly' };
    }

    const coords = getPieceAbsoluteCoords(pieceDef.shape, rotation, flip, originX, originY);
    const isFirstMove = currentColorState.remainingPieces.length === ALL_PIECE_IDS.length;
    const validation = isValidPlacement(this.board, coords, this.currentTurn, isFirstMove);

    if (!validation.valid) {
      // SLI-4: Move Accepted — this move was rejected
      if (!player.isBot) {
        const rawReason = validation.reason?.toLowerCase() || '';
        const reasonTag = rawReason.includes('edge') ? 'touching_edge'
          : rawReason.includes('corner') ? 'no_corner_contact'
          : rawReason.includes('bounds') ? 'out_of_bounds'
          : rawReason.includes('occupied') ? 'cell_occupied'
          : 'illegal_placement';
        sliMetrics.recordMoveRejected();
        customMetrics.recordMoveRejectedReason(reasonTag);
      }
      return { success: false, reason: validation.reason || 'Illegal placement' };
    }

    this.lastMoveTimestamps.set(moveKey, { round: this.round, at: now });
    this.lastActivityAt = now;
    this.consecutiveTimeoutSkips = 0;

    // Clear current turn timer
    if (this.turnTimer) clearTimeout(this.turnTimer);

    // Apply move to board
    for (const [x, y] of coords) {
      this.board[y][x] = this.currentTurn;
    }

    // Update color inventory
    currentColorState.remainingPieces = currentColorState.remainingPieces.filter(id => id !== pieceId);
    currentColorState.squaresRemaining -= pieceDef.size;

    // Update player score strictly for owned colors (never overwrite 3P score on shared GREEN)
    if (this.gamePlayerCount === 2) {
      if (player.assignedColors) {
        player.squaresRemaining = player.assignedColors.reduce(
          (sum, c) => sum + (this.colorStates[c]?.squaresRemaining || 0),
          0
        );
      }
    } else if (player.color === this.currentTurn) {
      player.squaresRemaining = currentColorState.squaresRemaining;
    }
    if (player.color === this.currentTurn) {
      player.remainingPieces = currentColorState.remainingPieces;
    }
    this.syncPlayersHasPassed();

    this.seqCounter++;
    const move: Move = {
      playerId,
      playerName: player.name,
      color: this.currentTurn,
      pieceId,
      rotation,
      flip,
      originX,
      originY,
      coords,
      serverTimestamp: Date.now(),
      seq: this.seqCounter
    };
    this.history.push(move);

    // SLI-4: Move Accepted — this move was accepted (non-bot only)
    if (!player.isBot) sliMetrics.recordMoveAccepted();

    const hasNextTurn = this.advanceTurn();
    if (!hasNextTurn) {
      this.finalizeGameEnd();
    }

    this.broadcast({
      type: 'MOVE_ACCEPTED',
      move,
      nextTurn: this.currentTurn,
      state: this.getRoomState()
    });

    if (!hasNextTurn) {
      this.emitGameOver();
      return { success: true };
    }

    this.triggerBotTurnIfNeeded();
    return { success: true };
  }

  public handlePass(playerId: string, fromTimeoutSkip: boolean = false): void {
    const currentControllerId = this.getColorControllerId(this.currentTurn);
    if (playerId !== currentControllerId || this.status !== 'IN_PROGRESS') return;

    this.lastActivityAt = Date.now();
    if (!fromTimeoutSkip) {
      this.consecutiveTimeoutSkips = 0;
    }
    if (this.turnTimer) clearTimeout(this.turnTimer);

    if (this.colorStates[this.currentTurn]) {
      this.colorStates[this.currentTurn].hasPassed = true;
    }

    this.syncPlayersHasPassed();

    const prevTurn = this.currentTurn;
    const hasNextTurn = this.advanceTurn();
    if (!hasNextTurn) {
      this.finalizeGameEnd();
    }

    this.broadcast({
      type: 'PLAYER_PASSED',
      playerId,
      color: prevTurn,
      nextTurn: this.currentTurn
    });
    this.broadcastSync();

    if (!hasNextTurn) {
      this.emitGameOver();
      return;
    }

    this.triggerBotTurnIfNeeded();
  }

  private advanceTurn(): boolean {
    const allPassed = Object.values(this.colorStates).every(
      c => c.hasPassed || c.remainingPieces.length === 0
    );
    if (allPassed) {
      return false;
    }

    const currentIdx = this.turnOrder.indexOf(this.currentTurn);
    let crossedRoundStart = false;

    for (let step = 1; step <= this.turnOrder.length; step++) {
      const candidateIdx = (currentIdx + step) % this.turnOrder.length;
      if (candidateIdx === 0) {
        crossedRoundStart = true;
      }

      const candidateColor = this.turnOrder[candidateIdx];
      const colorState = this.colorStates[candidateColor];

      if (colorState && !colorState.hasPassed && colorState.remainingPieces.length > 0) {
        this.currentTurn = candidateColor;
        this.turnStartedAt = Date.now();

        if (crossedRoundStart) {
          this.round++;
        }

        // In 3-player game, alternate shared GREEN controller across non-forfeited players
        if (this.gamePlayerCount === 3 && candidateColor === 'GREEN') {
          this.rotateSharedGreenController();
        }

        this.startTurnTimer();
        return true;
      }
    }

    return false;
  }

  private startTurnTimer(): void {
    if (this.turnTimer) clearTimeout(this.turnTimer);
    if (this.status !== 'IN_PROGRESS') return;

    const currentControllerId = this.getColorControllerId(this.currentTurn);
    const currentTurnPlayer = this.players.get(currentControllerId);
    if (!currentTurnPlayer) return;

    const duration = this.turnDurationSeconds * 1000;

    this.turnTimer = setTimeout(() => {
      if (this.status !== 'IN_PROGRESS') return;
      if (this.getColorControllerId(this.currentTurn) === currentTurnPlayer.id && !this.colorStates[this.currentTurn]?.hasPassed) {
        if (!currentTurnPlayer.isConnected || (this.gamePlayerCount === 3 && this.currentTurn === 'GREEN')) {
          this.consecutiveTimeoutSkips++;
          const activePlayersCount = Array.from(this.players.values()).filter(p => !p.forfeited).length;
          const colorState = this.colorStates[this.currentTurn];
          const isFirstMove = colorState ? colorState.remainingPieces.length === ALL_PIECE_IDS.length : false;
          const hasLegal = colorState && colorState.remainingPieces.length > 0
            ? Boolean(findFirstLegalMove(this.board, colorState.remainingPieces, this.currentTurn, isFirstMove))
            : false;

          if (!hasLegal || (this.gamePlayerCount === 3 && this.currentTurn === 'GREEN' && this.consecutiveTimeoutSkips >= Math.max(1, activePlayersCount))) {
            console.log(`[Timer] Auto-passing turn for ${currentTurnPlayer.name} (${this.currentTurn}) after full ${this.turnDurationSeconds}s elapsed.`);
            this.handlePass(currentTurnPlayer.id, true);
            return;
          }

          console.log(`[Timer] Skipping turn for ${currentTurnPlayer.name} (${this.currentTurn}) without permanent pass.`);
          this.lastActivityAt = Date.now();
          const hasNextTurn = this.advanceTurn();
          if (!hasNextTurn) {
            this.endGame();
            return;
          }
          this.broadcastSync();
          this.triggerBotTurnIfNeeded();
          return;
        }

        console.log(`[Timer] Auto-passing turn for ${currentTurnPlayer.name} (${this.currentTurn}) after full ${this.turnDurationSeconds}s elapsed.`);
        this.handlePass(currentTurnPlayer.id, true);
      }
    }, duration);
  }

  private triggerBotTurnIfNeeded(): void {
    if (this.status !== 'IN_PROGRESS') return;
    const currentControllerId = this.getColorControllerId(this.currentTurn);
    const currentTurnPlayer = this.players.get(currentControllerId);
    if (!currentTurnPlayer || !currentTurnPlayer.isBot) return;

    if (this.botTimer) clearTimeout(this.botTimer);

    const thinkDelay = 800 + Math.floor(Math.random() * 800);
    this.botTimer = setTimeout(() => {
      if (this.status !== 'IN_PROGRESS' || !currentTurnPlayer.isBot || this.getColorControllerId(this.currentTurn) !== currentTurnPlayer.id) return;

      const currentColorState = this.colorStates[this.currentTurn];
      if (!currentColorState || currentColorState.remainingPieces.length === 0) {
        this.handlePass(currentTurnPlayer.id);
        return;
      }

      const isFirstMove = currentColorState.remainingPieces.length === ALL_PIECE_IDS.length;
      const botMove: CandidateMove | null = findBotLegalMove(
        this.board,
        currentColorState.remainingPieces,
        this.currentTurn,
        isFirstMove
      );

      if (botMove) {
        this.handleMove(
          currentTurnPlayer.id,
          botMove.pieceId,
          botMove.rotation,
          botMove.flip,
          botMove.originX,
          botMove.originY
        );
      } else {
        this.handlePass(currentTurnPlayer.id);
      }
    }, thinkDelay);
  }

  private computePlayerBonus(player: RoomPlayer): number {
    if (player.forfeited) return 0;
    const ownedColors = player.assignedColors || [player.color];
    const allCleared = ownedColors.every(c => (this.colorStates[c]?.remainingPieces.length ?? 1) === 0);
    if (!allCleared) return 0;

    // Check if the player's final placement among their owned colors was the O1 monomino
    for (let i = this.history.length - 1; i >= 0; i--) {
      const m = this.history[i];
      if (ownedColors.includes(m.color) && m.playerId === player.id) {
        return m.pieceId === 'O1' ? 20 : 15;
      }
    }
    return 15;
  }

  private finalizeGameEnd(): boolean {
    if (this.status === 'FINISHED') return false;
    this.status = 'FINISHED';
    this.finishedAt = Date.now();
    this.lastActivityAt = this.finishedAt;

    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
    if (this.botTimer) {
      clearTimeout(this.botTimer);
      this.botTimer = null;
    }

    for (const p of this.players.values()) {
      if (p.reconnectTimer) {
        clearTimeout(p.reconnectTimer);
        p.reconnectTimer = undefined;
      }
    }

    const is2P = this.gamePlayerCount === 2;
    const scoredPlayers = Array.from(this.players.values()).map(p => {
      const ownedColors = p.assignedColors || [p.color];
      const rawRemaining = p.forfeited
        ? 999
        : ownedColors.reduce((sum, c) => sum + (this.colorStates[c]?.squaresRemaining || 0), 0);
      if (!p.forfeited) {
        p.squaresRemaining = rawRemaining;
      }
      const bonus = this.computePlayerBonus(p);
      const netScore = p.forfeited ? 999 : rawRemaining - bonus;
      return { player: p, rawRemaining, bonus, netScore };
    });

    scoredPlayers.sort((a, b) => {
      if (a.player.forfeited && !b.player.forfeited) return 1;
      if (!a.player.forfeited && b.player.forfeited) return -1;
      return a.netScore - b.netScore;
    });

    let currentRank = 1;
    const rankedPlayers = scoredPlayers.map((entry, index) => {
      if (index > 0) {
        const prev = scoredPlayers[index - 1];
        const sameTier =
          Boolean(entry.player.forfeited) === Boolean(prev.player.forfeited) &&
          (entry.player.forfeited || entry.netScore === prev.netScore);
        if (!sameTier) {
          currentRank = index + 1;
        }
      }
      return {
        playerId: entry.player.id,
        color: entry.player.color,
        name: entry.player.name,
        squaresRemaining: entry.player.forfeited ? 999 : entry.rawRemaining,
        bonus: entry.bonus,
        netScore: entry.netScore,
        forfeited: entry.player.forfeited || false,
        rank: currentRank
      };
    });

    const winners = rankedPlayers.filter(rp => rp.rank === 1 && !rp.forfeited);
    this.finishedWinner = winners.length > 1 ? 'TIE' : winners[0]?.color;
    this.finishedRankings = rankedPlayers;

    this.pendingGameResults = rankedPlayers.map(rp => {
      const player = this.players.get(rp.playerId);
      const ownedColors = player?.assignedColors || (player ? [player.color] : []);
      const squaresPlaced = this.history.reduce((sum, m) => {
        if (m.playerId === rp.playerId && ownedColors.includes(m.color)) {
          return sum + m.coords.length;
        }
        return sum;
      }, 0);
      return {
        userId: player?.userId,
        playerName: rp.name,
        color: rp.color,
        squaresRemaining: rp.forfeited ? 999 : rp.squaresRemaining,
        squaresPlaced,
        bonus: rp.bonus,
        netScore: rp.netScore,
        is2P,
        rank: rp.rank,
        forfeited: rp.forfeited || false
      };
    });

    return true;
  }

  private emitGameOver(): void {
    this.broadcast({
      type: 'GAME_OVER',
      state: this.getRoomState()
    });

    if (this.onGameEnd && this.pendingGameResults) {
      const results = this.pendingGameResults;
      this.pendingGameResults = null;
      this.onGameEnd(this.roomId, results);
    }
  }

  private endGame(): void {
    if (this.finalizeGameEnd()) {
      this.emitGameOver();
    }
  }

  public getRoomState(): RoomState {
    const modeCount = this.status === 'WAITING' ? this.players.size : this.gamePlayerCount;
    const is2P = modeCount === 2;
    const is3P = modeCount === 3;

    if (this.status !== 'WAITING' && is2P) {
      for (const p of this.players.values()) {
        if (p.assignedColors) {
          p.squaresRemaining = p.assignedColors.reduce(
            (sum, c) => sum + (this.colorStates[c]?.squaresRemaining || 0),
            0
          );
        }
      }
    }

    const currentControllerId = this.getColorControllerId(this.currentTurn);

    return {
      roomId: this.roomId,
      status: this.status,
      round: this.round,
      hostId: this.hostId,
      players: Array.from(this.players.values()).map(p => ({
        id: p.id,
        name: p.name,
        color: p.color,
        assignedColors: p.assignedColors,
        isHost: p.id === this.hostId,
        isReady: p.isReady,
        isConnected: p.isConnected,
        isBot: p.isBot,
        forfeited: p.forfeited,
        disconnectedAt: p.disconnectedAt,
        reconnectDeadline: p.reconnectDeadline,
        hasPassed: this.status === 'WAITING' ? p.hasPassed : this.computePlayerHasPassed(p),
        remainingPieces: this.colorStates[p.color]?.remainingPieces || p.remainingPieces,
        squaresRemaining: p.squaresRemaining,
        avatarSeed: p.avatarSeed
      })),
      currentTurn: this.currentTurn,
      activePlayerId: currentControllerId,
      colorStates: this.colorStates,
      sharedColor: is3P ? 'GREEN' : undefined,
      sharedColorControllerId: is3P ? this.colorStates['GREEN']?.controllerPlayerId : undefined,
      board: this.board,
      turnStartedAt: this.turnStartedAt,
      turnDurationSeconds: this.turnDurationSeconds,
      history: undefined,
      winner: this.status === 'FINISHED' ? this.finishedWinner : undefined,
      rankings: this.status === 'FINISHED' ? this.finishedRankings : undefined
    };
  }

  public broadcast(message: ServerMessage): void {
    const payload = JSON.stringify(message);
    for (const player of this.players.values()) {
      if (player.ws && player.ws.readyState === WebSocket.OPEN) {
        if (player.ws.bufferedAmount > 1_000_000) {
          console.warn(`[GameRoom] Dropping broadcast ${message.type} to ${player.id}: bufferedAmount=${player.ws.bufferedAmount}`);
          continue;
        }
        try {
          player.ws.send(payload);
        } catch (e) {
          console.error(`[GameRoom] Error sending to player ${player.id}:`, e);
        }
      }
    }
  }

  public broadcastSync(): void {
    this.broadcast({
      type: 'ROOM_STATE_SYNC',
      state: this.getRoomState()
    });
  }

  private getAvailableColor(): PlayerColor {
    const usedColors = new Set(Array.from(this.players.values()).map(p => p.color));
    for (const color of this.turnOrder) {
      if (!usedColors.has(color)) {
        return color;
      }
    }
    return 'BLUE';
  }
}
