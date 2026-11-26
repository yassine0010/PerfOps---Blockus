import { WebSocket } from 'ws';
import { sliMetrics } from './sliMetrics.ts';
import { customMetrics } from './customMetrics.ts';
import { ALL_PIECE_IDS, PIECES } from '../../shared/pieces.ts';
import { createEmptyBoard, getPieceAbsoluteCoords } from '../../shared/board.ts';
import { findFirstLegalMove, isValidPlacement } from '../../shared/validator.ts';
export class GameRoom {
    roomId;
    hostId = '';
    status = 'WAITING';
    round = 1;
    currentTurn = 'BLUE';
    board = createEmptyBoard();
    history = [];
    turnStartedAt = Date.now();
    turnDurationSeconds = 90;
    seqCounter = 0;
    lastMoveTimestamp = 0; // Anti-replay: minimum interval between moves
    botTimer = null;
    turnTimer = null;
    // Callback for recording game results (set by server.ts)
    onGameEnd;
    players = new Map();
    turnOrder = ['BLUE', 'YELLOW', 'RED', 'GREEN'];
    colorStates = {
        BLUE: { color: 'BLUE', controllerPlayerId: '', remainingPieces: [...ALL_PIECE_IDS], squaresRemaining: 89, hasPassed: false },
        YELLOW: { color: 'YELLOW', controllerPlayerId: '', remainingPieces: [...ALL_PIECE_IDS], squaresRemaining: 89, hasPassed: false },
        RED: { color: 'RED', controllerPlayerId: '', remainingPieces: [...ALL_PIECE_IDS], squaresRemaining: 89, hasPassed: false },
        GREEN: { color: 'GREEN', controllerPlayerId: '', remainingPieces: [...ALL_PIECE_IDS], squaresRemaining: 89, hasPassed: false }
    };
    sharedColorControllerIndex = 0;
    getColorControllerId(color) {
        return this.colorStates[color]?.controllerPlayerId || '';
    }
    constructor(roomId) {
        this.roomId = roomId;
    }
    getPlayerCount() {
        return this.players.size;
    }
    addPlayer(name, isHost, avatarSeed, ws, userId) {
        const playerId = 'p_' + Math.random().toString(36).substring(2, 9);
        const assignedColor = this.getAvailableColor();
        // Sanitize player name: trim, cap length, strip HTML
        const safeName = (name || '').trim().substring(0, 15).replace(/<[^>]*>/g, '') || 'Player';
        const effectiveIsHost = isHost || !this.hostId;
        const player = {
            id: playerId,
            name: safeName,
            color: assignedColor,
            isHost: effectiveIsHost,
            isReady: true,
            isConnected: true,
            hasPassed: false,
            remainingPieces: [...ALL_PIECE_IDS],
            squaresRemaining: 89,
            avatarSeed: avatarSeed || name,
            ws: ws || null,
            isBot: false,
            userId
        };
        if (effectiveIsHost) {
            this.hostId = playerId;
        }
        this.players.set(playerId, player);
        return player;
    }
    addBot(customName, color) {
        if (this.players.size >= 4)
            return null;
        const botColor = color || this.getAvailableColor();
        const botId = 'bot_' + Math.random().toString(36).substring(2, 7);
        const botNames = ['Nolan Bot', 'Theo Bot', 'Mia Bot', 'Leo Bot'];
        const botName = customName && customName.trim()
            ? customName.trim()
            : botNames[this.players.size % botNames.length];
        const bot = {
            id: botId,
            name: botName,
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
        this.players.set(botId, bot);
        this.broadcastSync();
        return bot;
    }
    removeBot(botId) {
        const player = this.players.get(botId);
        if (!player || !player.isBot || this.status !== 'WAITING')
            return false;
        this.players.delete(botId);
        this.broadcastSync();
        return true;
    }
    removePlayer(playerId, isExplicitLeave = false) {
        const player = this.players.get(playerId);
        if (!player)
            return;
        if (this.status === 'WAITING') {
            if (isExplicitLeave) {
                this.players.delete(playerId);
                if (this.hostId === playerId && this.players.size > 0) {
                    const nextHost = this.players.values().next().value;
                    if (nextHost) {
                        nextHost.isHost = true;
                        this.hostId = nextHost.id;
                    }
                }
            }
            else {
                // Unexpected disconnect in lobby: keep player slot for reconnection
                player.isConnected = false;
                player.ws = null;
                player.disconnectedAt = Date.now();
                player.reconnectDeadline = Date.now() + 180000;
                this.broadcast({
                    type: 'PLAYER_DISCONNECTED',
                    playerId: player.id,
                    playerName: player.name,
                    color: player.color,
                    reconnectDeadline: player.reconnectDeadline
                });
            }
        }
        else {
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
                this.broadcast({
                    type: 'PLAYER_DISCONNECTED',
                    playerId: player.id,
                    playerName: player.name,
                    color: player.color
                });
                // If it was currently their turn, advance turn immediately
                if (this.currentTurn === player.color) {
                    this.advanceTurn();
                }
                // Count active players who are NOT forfeited and still connected
                const activePlayers = Array.from(this.players.values()).filter(p => !p.forfeited && p.isConnected);
                // If only 1 player remains in the game, they automatically win immediately!
                if (activePlayers.length <= 1) {
                    console.log(`[GameRoom] Only 1 active player remaining after ${player.name} left. Declaring immediate victory.`);
                    this.endGame();
                    return;
                }
            }
            else {
                // In-game unexpected drop (tab close / network blip): Give a 3-minute grace period to reconnect!
                player.isConnected = false;
                player.ws = null;
                player.disconnectedAt = Date.now();
                // SLI-5: Connection Stability — count unexpected in-game disconnect
                sliMetrics.recordUnexpectedDisconnect();
                player.reconnectDeadline = Date.now() + 180000; // 3 minutes grace period
                if (player.reconnectTimer)
                    clearTimeout(player.reconnectTimer);
                player.reconnectTimer = setTimeout(() => {
                    player.reconnectTimer = undefined;
                    if (!player.isConnected && this.status === 'IN_PROGRESS') {
                        player.isBot = true;
                        player.name = player.name + ' (Bot)';
                        player.isConnected = true;
                        player.disconnectedAt = undefined;
                        player.reconnectDeadline = undefined;
                        this.broadcastSync();
                        this.triggerBotTurnIfNeeded();
                    }
                }, 180000);
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
    setPlayerReady(playerId, isReady) {
        const player = this.players.get(playerId);
        if (!player)
            return;
        player.isReady = isReady !== undefined ? isReady : !player.isReady;
        this.broadcastSync();
    }
    changePlayerColor(playerId, targetColor) {
        const player = this.players.get(playerId);
        if (!player || this.status !== 'WAITING')
            return false;
        for (const p of this.players.values()) {
            if (p.id !== playerId && p.color === targetColor) {
                return false;
            }
        }
        player.color = targetColor;
        this.broadcastSync();
        return true;
    }
    reconnectPlayer(playerId, ws) {
        const player = this.players.get(playerId);
        if (!player)
            return false;
        // Safely retire lingering socket without triggering unintended disconnect logic
        if (player.ws && player.ws !== ws) {
            try {
                player.ws.isReplaced = true;
                player.ws.close();
            }
            catch { }
        }
        if (player.reconnectTimer) {
            clearTimeout(player.reconnectTimer);
            player.reconnectTimer = undefined;
        }
        player.ws = ws;
        player.isConnected = true;
        player.disconnectedAt = undefined;
        player.reconnectDeadline = undefined;
        this.broadcast({
            type: 'PLAYER_RECONNECTED',
            playerId: player.id,
            playerName: player.name,
            color: player.color
        });
        this.broadcastSync();
        return true;
    }
    startGame() {
        if (this.status === 'IN_PROGRESS')
            return false;
        // Require at least 2 players/bots to start (e.g. 1v1 or party)
        if (this.players.size < 2)
            return false;
        // Only convert disconnected players if their 3-minute grace period has fully expired!
        const now = Date.now();
        for (const player of this.players.values()) {
            if (!player.isConnected && !player.isBot) {
                if (player.reconnectDeadline && now > player.reconnectDeadline) {
                    player.isBot = true;
                    player.name = player.name + ' (Bot)';
                    player.isConnected = true;
                    player.disconnectedAt = undefined;
                    player.reconnectDeadline = undefined;
                }
            }
        }
        this.status = 'IN_PROGRESS';
        this.round = 1;
        this.board = createEmptyBoard();
        this.history = [];
        this.turnOrder = ['BLUE', 'YELLOW', 'RED', 'GREEN'];
        const playerList = Array.from(this.players.values());
        if (playerList.length === 2) {
            // Official 2-Player Blokus:
            // Player 1 controls Blue and Red
            // Player 2 controls Yellow and Green
            const p1 = playerList[0];
            const p2 = playerList[1];
            p1.color = 'BLUE';
            p1.assignedColors = ['BLUE', 'RED'];
            p1.squaresRemaining = 89 * 2;
            p1.hasPassed = false;
            p1.remainingPieces = [...ALL_PIECE_IDS];
            p2.color = 'YELLOW';
            p2.assignedColors = ['YELLOW', 'GREEN'];
            p2.squaresRemaining = 89 * 2;
            p2.hasPassed = false;
            p2.remainingPieces = [...ALL_PIECE_IDS];
            this.colorStates = {
                BLUE: { color: 'BLUE', controllerPlayerId: p1.id, remainingPieces: [...ALL_PIECE_IDS], squaresRemaining: 89, hasPassed: false },
                YELLOW: { color: 'YELLOW', controllerPlayerId: p2.id, remainingPieces: [...ALL_PIECE_IDS], squaresRemaining: 89, hasPassed: false },
                RED: { color: 'RED', controllerPlayerId: p1.id, remainingPieces: [...ALL_PIECE_IDS], squaresRemaining: 89, hasPassed: false },
                GREEN: { color: 'GREEN', controllerPlayerId: p2.id, remainingPieces: [...ALL_PIECE_IDS], squaresRemaining: 89, hasPassed: false }
            };
        }
        else if (playerList.length === 3) {
            // Official 3-Player Blokus:
            // Player 1 = Blue, Player 2 = Yellow, Player 3 = Red
            // Green is shared, played alternately
            const p1 = playerList[0];
            const p2 = playerList[1];
            const p3 = playerList[2];
            p1.color = 'BLUE';
            p1.assignedColors = ['BLUE'];
            p1.squaresRemaining = 89;
            p1.hasPassed = false;
            p1.remainingPieces = [...ALL_PIECE_IDS];
            p2.color = 'YELLOW';
            p2.assignedColors = ['YELLOW'];
            p2.squaresRemaining = 89;
            p2.hasPassed = false;
            p2.remainingPieces = [...ALL_PIECE_IDS];
            p3.color = 'RED';
            p3.assignedColors = ['RED'];
            p3.squaresRemaining = 89;
            p3.hasPassed = false;
            p3.remainingPieces = [...ALL_PIECE_IDS];
            this.sharedColorControllerIndex = 0;
            this.colorStates = {
                BLUE: { color: 'BLUE', controllerPlayerId: p1.id, remainingPieces: [...ALL_PIECE_IDS], squaresRemaining: 89, hasPassed: false },
                YELLOW: { color: 'YELLOW', controllerPlayerId: p2.id, remainingPieces: [...ALL_PIECE_IDS], squaresRemaining: 89, hasPassed: false },
                RED: { color: 'RED', controllerPlayerId: p3.id, remainingPieces: [...ALL_PIECE_IDS], squaresRemaining: 89, hasPassed: false },
                GREEN: { color: 'GREEN', controllerPlayerId: p1.id, remainingPieces: [...ALL_PIECE_IDS], squaresRemaining: 89, hasPassed: false }
            };
        }
        else {
            // 4-Player Blokus: 1 color each
            const colors = ['BLUE', 'YELLOW', 'RED', 'GREEN'];
            this.colorStates = {};
            playerList.forEach((p, idx) => {
                const c = colors[idx] || 'BLUE';
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
            });
        }
        this.currentTurn = 'BLUE';
        this.turnStartedAt = Date.now();
        // SLI-5: Connection Stability — count real (non-bot) players entering this match
        for (const p of this.players.values()) {
            if (!p.isBot)
                sliMetrics.recordPlayerEnteredMatch();
        }
        this.broadcastSync();
        this.startTurnTimer();
        this.triggerBotTurnIfNeeded();
        return true;
    }
    handleMove(playerId, pieceId, rotation, flip, originX, originY) {
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
        const currentColorState = this.colorStates[this.currentTurn];
        if (!currentColorState || !currentColorState.remainingPieces.includes(pieceId)) {
            if (!player.isBot) {
                sliMetrics.recordMoveRejected();
                customMetrics.recordMoveRejectedReason('piece_already_placed');
            }
            return { success: false, reason: 'You have already placed this piece' };
        }
        const pieceDef = PIECES[pieceId];
        if (!pieceDef || !ALL_PIECE_IDS.includes(pieceId)) {
            if (!player.isBot) {
                sliMetrics.recordMoveRejected();
                customMetrics.recordMoveRejectedReason('unknown_piece_id');
            }
            return { success: false, reason: 'Unknown piece ID' };
        }
        // Anti-replay: reject moves arriving faster than 200ms apart
        const now = Date.now();
        if (now - this.lastMoveTimestamp < 200) {
            if (!player.isBot) {
                sliMetrics.recordMoveRejected();
                customMetrics.recordMoveRejectedReason('anti_replay');
            }
            return { success: false, reason: 'Move submitted too quickly' };
        }
        this.lastMoveTimestamp = now;
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
        // Clear current turn timer
        if (this.turnTimer)
            clearTimeout(this.turnTimer);
        // Apply move to board
        for (const [x, y] of coords) {
            this.board[y][x] = this.currentTurn;
        }
        // Update color inventory
        currentColorState.remainingPieces = currentColorState.remainingPieces.filter(id => id !== pieceId);
        currentColorState.squaresRemaining -= pieceDef.size;
        // Update player combined squaresRemaining in 2P
        if (this.players.size === 2) {
            if (player.assignedColors) {
                player.squaresRemaining = player.assignedColors.reduce((sum, c) => sum + (this.colorStates[c]?.squaresRemaining || 0), 0);
            }
        }
        else {
            player.squaresRemaining = currentColorState.squaresRemaining;
        }
        this.seqCounter++;
        const move = {
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
        if (!player.isBot)
            sliMetrics.recordMoveAccepted();
        this.advanceTurn();
        this.broadcast({
            type: 'MOVE_ACCEPTED',
            move,
            nextTurn: this.currentTurn,
            state: this.getRoomState()
        });
        this.triggerBotTurnIfNeeded();
        return { success: true };
    }
    handlePass(playerId) {
        const currentControllerId = this.getColorControllerId(this.currentTurn);
        if (playerId !== currentControllerId || this.status !== 'IN_PROGRESS')
            return;
        if (this.turnTimer)
            clearTimeout(this.turnTimer);
        if (this.colorStates[this.currentTurn]) {
            this.colorStates[this.currentTurn].hasPassed = true;
        }
        const player = this.players.get(playerId);
        if (player && player.assignedColors) {
            player.hasPassed = player.assignedColors.every(c => this.colorStates[c]?.hasPassed);
        }
        else if (player) {
            player.hasPassed = true;
        }
        const prevTurn = this.currentTurn;
        this.advanceTurn();
        this.broadcast({
            type: 'PLAYER_PASSED',
            playerId,
            color: prevTurn,
            nextTurn: this.currentTurn
        });
        this.broadcastSync();
        this.triggerBotTurnIfNeeded();
    }
    advanceTurn() {
        const allPassed = Object.values(this.colorStates).every(c => c.hasPassed || c.remainingPieces.length === 0);
        if (allPassed) {
            this.endGame();
            return;
        }
        let nextIndex = (this.turnOrder.indexOf(this.currentTurn) + 1) % this.turnOrder.length;
        let attempts = 0;
        while (attempts < this.turnOrder.length) {
            const candidateColor = this.turnOrder[nextIndex];
            const colorState = this.colorStates[candidateColor];
            if (colorState && !colorState.hasPassed && colorState.remainingPieces.length > 0) {
                this.currentTurn = candidateColor;
                this.turnStartedAt = Date.now();
                // In 3-player game, if advancing to GREEN (shared color), alternate controller
                if (this.players.size === 3 && candidateColor === 'GREEN') {
                    const playerList = Array.from(this.players.values());
                    this.sharedColorControllerIndex = (this.sharedColorControllerIndex + 1) % playerList.length;
                    this.colorStates['GREEN'].controllerPlayerId = playerList[this.sharedColorControllerIndex].id;
                }
                if (candidateColor === 'BLUE') {
                    this.round++;
                }
                this.startTurnTimer();
                return;
            }
            nextIndex = (nextIndex + 1) % this.turnOrder.length;
            attempts++;
        }
        this.endGame();
    }
    startTurnTimer() {
        if (this.turnTimer)
            clearTimeout(this.turnTimer);
        if (this.status !== 'IN_PROGRESS')
            return;
        const currentControllerId = this.getColorControllerId(this.currentTurn);
        const currentTurnPlayer = this.players.get(currentControllerId);
        if (!currentTurnPlayer)
            return;
        const duration = this.turnDurationSeconds * 1000;
        this.turnTimer = setTimeout(() => {
            if (this.status !== 'IN_PROGRESS')
                return;
            if (this.getColorControllerId(this.currentTurn) === currentTurnPlayer.id && !this.colorStates[this.currentTurn]?.hasPassed) {
                console.log(`[Timer] Auto-passing turn for ${currentTurnPlayer.name} (${this.currentTurn}) after full ${this.turnDurationSeconds}s elapsed.`);
                this.handlePass(currentTurnPlayer.id);
            }
        }, duration);
    }
    triggerBotTurnIfNeeded() {
        if (this.status !== 'IN_PROGRESS')
            return;
        const currentControllerId = this.getColorControllerId(this.currentTurn);
        const currentTurnPlayer = this.players.get(currentControllerId);
        if (!currentTurnPlayer || !currentTurnPlayer.isBot)
            return;
        if (this.botTimer)
            clearTimeout(this.botTimer);
        const thinkDelay = 800 + Math.floor(Math.random() * 800);
        this.botTimer = setTimeout(() => {
            if (this.status !== 'IN_PROGRESS' || this.getColorControllerId(this.currentTurn) !== currentTurnPlayer.id)
                return;
            const currentColorState = this.colorStates[this.currentTurn];
            if (!currentColorState || currentColorState.remainingPieces.length === 0) {
                this.handlePass(currentTurnPlayer.id);
                return;
            }
            const isFirstMove = currentColorState.remainingPieces.length === ALL_PIECE_IDS.length;
            const botMove = findFirstLegalMove(this.board, currentColorState.remainingPieces, this.currentTurn, isFirstMove);
            if (botMove) {
                this.handleMove(currentTurnPlayer.id, botMove.pieceId, botMove.rotation, botMove.flip, botMove.originX, botMove.originY);
            }
            else {
                this.handlePass(currentTurnPlayer.id);
            }
        }, thinkDelay);
    }
    endGame() {
        if (this.status === 'FINISHED')
            return;
        this.status = 'FINISHED';
        if (this.turnTimer)
            clearTimeout(this.turnTimer);
        if (this.botTimer)
            clearTimeout(this.botTimer);
        for (const p of this.players.values()) {
            if (p.reconnectTimer) {
                clearTimeout(p.reconnectTimer);
                p.reconnectTimer = undefined;
            }
        }
        // Calculate final scores
        const is2P = this.players.size === 2;
        if (is2P) {
            for (const p of this.players.values()) {
                if (p.assignedColors) {
                    p.squaresRemaining = p.assignedColors.reduce((sum, c) => sum + (this.colorStates[c]?.squaresRemaining || 0), 0);
                }
            }
        }
        const rankedPlayers = Array.from(this.players.values())
            .sort((a, b) => {
            if (a.forfeited && !b.forfeited)
                return 1;
            if (!a.forfeited && b.forfeited)
                return -1;
            return a.squaresRemaining - b.squaresRemaining;
        })
            .map((item, index) => ({
            color: item.color,
            name: item.name,
            squaresRemaining: item.forfeited ? 999 : item.squaresRemaining,
            forfeited: item.forfeited || false,
            rank: index + 1
        }));
        this.broadcast({
            type: 'GAME_OVER',
            state: this.getRoomState(),
            rankings: rankedPlayers
        });
        // Fire game-end callback to record stats
        if (this.onGameEnd) {
            const playerList = Array.from(this.players.values());
            this.onGameEnd(this.roomId, rankedPlayers.map(rp => {
                const player = playerList.find(p => p.name === rp.name);
                return {
                    userId: player?.userId,
                    playerName: rp.name,
                    color: rp.color,
                    squaresRemaining: rp.forfeited ? 999 : rp.squaresRemaining,
                    rank: rp.rank,
                    forfeited: rp.forfeited || false
                };
            }));
        }
    }
    getRoomState() {
        const is2P = this.players.size === 2;
        const is3P = this.players.size === 3;
        if (is2P) {
            for (const p of this.players.values()) {
                if (p.assignedColors) {
                    p.squaresRemaining = p.assignedColors.reduce((sum, c) => sum + (this.colorStates[c]?.squaresRemaining || 0), 0);
                }
            }
        }
        const activePlayers = Array.from(this.players.values()).filter(p => !p.forfeited);
        const winnerPlayer = activePlayers.sort((a, b) => a.squaresRemaining - b.squaresRemaining)[0];
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
                hasPassed: p.assignedColors ? p.assignedColors.every(c => this.colorStates[c]?.hasPassed) : p.hasPassed,
                remainingPieces: this.colorStates[this.currentTurn]?.controllerPlayerId === p.id
                    ? this.colorStates[this.currentTurn].remainingPieces
                    : (this.colorStates[p.color]?.remainingPieces || p.remainingPieces),
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
            history: this.history,
            winner: winnerPlayer ? winnerPlayer.color : undefined
        };
    }
    broadcast(message) {
        const payload = JSON.stringify(message);
        for (const player of this.players.values()) {
            if (player.ws && player.ws.readyState === WebSocket.OPEN) {
                try {
                    player.ws.send(payload);
                }
                catch (e) {
                    console.error(`[GameRoom] Error sending to player ${player.id}:`, e);
                }
            }
        }
    }
    broadcastSync() {
        this.broadcast({
            type: 'ROOM_STATE_SYNC',
            state: this.getRoomState()
        });
    }
    getAvailableColor() {
        const usedColors = new Set(Array.from(this.players.values()).map(p => p.color));
        for (const color of this.turnOrder) {
            if (!usedColors.has(color)) {
                return color;
            }
        }
        return 'BLUE';
    }
}
