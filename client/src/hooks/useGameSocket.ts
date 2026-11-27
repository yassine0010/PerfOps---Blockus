import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientMessage, PieceId, PlayerColor, RoomState, ServerMessage } from '../../../shared/types.ts';
import { sounds } from '../utils/sound';
import { joinMetrics } from '../utils/joinMetrics';
import { getWsUrl } from '../utils/apiConfig';

export interface PlayerConnectionAlert {
  id: string;
  type: 'DISCONNECTED' | 'RECONNECTED';
  playerId: string;
  playerName: string;
  color: PlayerColor;
  timestamp: number;
  reconnectDeadline?: number;
}

const NON_RETRYABLE_CLOSE_CODES = new Set([1008, 4001, 4002]);
const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30000;
const PING_INTERVAL_MS = 20000;
const CLOCK_DRIFT_THRESHOLD_MS = 250;

function normalizeMoveRejectionReason(reason: string): string {
  const lower = (reason || '').toLowerCase();
  if (lower.includes('out of bounds')) return 'out_of_bounds';
  if (lower.includes('already occupied')) return 'occupied';
  if (lower.includes('starting corner')) return 'starting_corner';
  if (lower.includes('along edges')) return 'edge_touch';
  if (lower.includes('corner-to-corner')) return 'no_corner';
  if (lower.includes('turn')) return 'not_your_turn';
  if (lower.includes('already placed')) return 'piece_unavailable';
  if (lower.includes('too quickly')) return 'rate_limited';
  if (lower.includes('not in progress')) return 'game_not_in_progress';
  if (lower.includes('unknown piece') || lower.includes('empty piece')) return 'invalid_piece';
  if (lower.includes('not in room')) return 'not_in_room';
  return 'other';
}

function clearRoomSessionStorage() {
  sessionStorage.removeItem('blokus_room_id');
  sessionStorage.removeItem('blokus_player_id');
  sessionStorage.removeItem('blokus_player_token');
}

function getCloseErrorMessage(code: number, reason: string): string {
  if (reason) return reason;
  switch (code) {
    case 4001:
      return 'Session opened in another tab.';
    case 4002:
      return 'You were removed from the room by the host.';
    case 1008:
    default:
      return 'Connection closed due to rate limiting or policy violation.';
  }
}

export function useGameSocket() {
  const [connected, setConnected] = useState<boolean>(false);
  const [clockOffsetMs, setClockOffsetMs] = useState<number>(0);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [connectionAlert, setConnectionAlert] = useState<PlayerConnectionAlert | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const leaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playerIdRef = useRef<string | null>(null);
  const roomStateRef = useRef<RoomState | null>(null);
  const activeRoomIdRef = useRef<string | null>(null);
  const leftRoomRef = useRef<string | null>(null);
  const alertTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingMessagesRef = useRef<ClientMessage[]>([]);
  const moveSentAtRef = useRef<number | null>(null);
  const messagesCountRef = useRef<number>(0);
  const clockOffsetRef = useRef<number>(0);

  const showError = useCallback((message: string, durationMs: number = 4000) => {
    if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
    setLastError(message);
    errorTimeoutRef.current = setTimeout(() => {
      setLastError(null);
      errorTimeoutRef.current = null;
    }, durationMs);
  }, []);

  const clearError = useCallback(() => {
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current);
      errorTimeoutRef.current = null;
    }
    setLastError(null);
  }, []);

  const triggerConnectionAlert = useCallback((
    type: 'DISCONNECTED' | 'RECONNECTED',
    pId: string,
    pName: string,
    pColor: PlayerColor,
    reconnectDeadline?: number
  ) => {
    if (alertTimeoutRef.current) clearTimeout(alertTimeoutRef.current);
    if (type === 'DISCONNECTED') {
      sounds.playDisconnectNotification();
    } else {
      sounds.playReconnectNotification();
    }
    setConnectionAlert({
      id: `${pId}-${Date.now()}`,
      type,
      playerId: pId,
      playerName: pName,
      color: pColor,
      timestamp: Date.now(),
      reconnectDeadline
    });
    alertTimeoutRef.current = setTimeout(() => {
      setConnectionAlert(null);
    }, type === 'DISCONNECTED' ? 6000 : 4000);
  }, []);

  const dismissConnectionAlert = useCallback(() => {
    if (alertTimeoutRef.current) {
      clearTimeout(alertTimeoutRef.current);
      alertTimeoutRef.current = null;
    }
    setConnectionAlert(null);
  }, []);

  useEffect(() => {
    playerIdRef.current = playerId;
  }, [playerId]);

  useEffect(() => {
    roomStateRef.current = roomState;
  }, [roomState]);

  const cancelPendingLeaveClose = useCallback(() => {
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    cancelPendingLeaveClose();
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const wsUrl = getWsUrl();
    const ws = new WebSocket(wsUrl);
    (ws as WebSocket & { __intentionalClose?: boolean }).__intentionalClose = false;
    wsRef.current = ws;

    ws.onopen = () => {
      if ((ws as WebSocket & { __intentionalClose?: boolean }).__intentionalClose || wsRef.current !== ws) {
        ws.close();
        return;
      }
      reconnectAttemptsRef.current = 0;
      setConnected(true);
      clearError();

      // Measure initial clock offset and keep connection alive
      ws.send(JSON.stringify({ type: 'PING', clientTs: Date.now() }));
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'PING', clientTs: Date.now() }));
        }
      }, PING_INTERVAL_MS);

      // Reconnect to existing room if session tokens exist
      const savedRoomId = sessionStorage.getItem('blokus_room_id');
      const savedPlayerId = sessionStorage.getItem('blokus_player_id');
      const savedPlayerToken = sessionStorage.getItem('blokus_player_token');
      const savedName = sessionStorage.getItem('blokus_player_name');
      if (savedRoomId && savedPlayerId && savedPlayerToken && savedName) {
        activeRoomIdRef.current = savedRoomId;
        leftRoomRef.current = null;
        ws.send(JSON.stringify({
          type: 'JOIN_ROOM',
          roomId: savedRoomId,
          playerName: savedName,
          existingPlayerId: savedPlayerId,
          playerToken: savedPlayerToken
        }));
      }

      // Flush any queued messages that were sent while connecting
      if (pendingMessagesRef.current.length > 0) {
        console.log(`[WS] Flushing ${pendingMessagesRef.current.length} queued message(s)`);
        while (pendingMessagesRef.current.length > 0) {
          const queued = pendingMessagesRef.current.shift();
          if (queued) {
            ws.send(JSON.stringify(queued));
          }
        }
      }
    };

    ws.onclose = (event: CloseEvent) => {
      const intentional = Boolean((ws as WebSocket & { __intentionalClose?: boolean }).__intentionalClose);
      if (wsRef.current === ws) {
        wsRef.current = null;
      } else {
        // Stale socket (e.g. StrictMode double-invoke cleanup): do not disturb active socket or queued messages
        return;
      }

      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }

      if (intentional) {
        setConnected(false);
        return;
      }

      joinMetrics.recordClientWsDisconnect(event?.code || 1006);
      if (messagesCountRef.current > 0) {
        joinMetrics.recordClientMessagesReceived(messagesCountRef.current);
        messagesCountRef.current = 0;
      }
      setConnected(false);
      // Clear pending queue so user isn't locked out of subsequent room creation attempts
      pendingMessagesRef.current = [];

      if (NON_RETRYABLE_CLOSE_CODES.has(event.code)) {
        clearRoomSessionStorage();
        activeRoomIdRef.current = null;
        setRoomState(null);
        setPlayerId(null);
        reconnectAttemptsRef.current = 0;
        showError(getCloseErrorMessage(event.code, event.reason), 5000);
        return;
      }

      // Smart reconnect: only auto-reconnect if the player was actively inside a room/match
      const inActiveRoom = !!roomStateRef.current || !!sessionStorage.getItem('blokus_room_id');
      if (inActiveRoom) {
        if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
          showError('Unable to reconnect to game server. Please check your connection.', 6000);
          return;
        }
        const attempt = reconnectAttemptsRef.current++;
        const delayMs =
          Math.min(MAX_RECONNECT_DELAY_MS, BASE_RECONNECT_DELAY_MS * (2 ** attempt)) +
          Math.floor(Math.random() * 500);
        console.log(`[WS] In-game connection dropped. Auto-reconnecting in ${delayMs}ms (attempt ${attempt + 1}/${MAX_RECONNECT_ATTEMPTS})...`);
        reconnectTimerRef.current = setTimeout(connect, delayMs);
      } else {
        console.log('[WS] Connection closed in lobby/menu. Remaining idle until next user action.');
      }
    };

    ws.onerror = (e) => {
      if ((ws as WebSocket & { __intentionalClose?: boolean }).__intentionalClose || wsRef.current !== ws) return;
      console.warn('[WS] connection error', e);
      joinMetrics.networkError();
      showError('Unable to connect to game server. Please make sure the server is running.');
      pendingMessagesRef.current = [];
    };

    ws.onmessage = (event) => {
      messagesCountRef.current++;
      try {
        const msg: ServerMessage = JSON.parse(event.data);
        switch (msg.type) {
          case 'ROOM_CREATED':
          case 'ROOM_JOINED': {
            activeRoomIdRef.current = msg.roomId;
            leftRoomRef.current = null;
            setPlayerId(msg.playerId);
            setRoomState(msg.state);
            clearError();
            joinMetrics.success();

            // Save to session storage for authenticated seamless reload/reconnect
            sessionStorage.setItem('blokus_room_id', msg.roomId);
            sessionStorage.setItem('blokus_player_id', msg.playerId);
            sessionStorage.setItem('blokus_player_token', msg.playerToken);
            const selfPlayer = msg.state.players.find(p => p.id === msg.playerId);
            if (selfPlayer) {
              sessionStorage.setItem('blokus_player_name', selfPlayer.name);
            }
            break;
          }

          case 'ROOM_STATE_SYNC': {
            if (!activeRoomIdRef.current || msg.state.roomId !== activeRoomIdRef.current || leftRoomRef.current === msg.state.roomId) {
              break;
            }
            const previousState = roomStateRef.current;
            const myCurrentId = playerIdRef.current;
            if (
              previousState &&
              msg.state.status === 'IN_PROGRESS' &&
              myCurrentId &&
              previousState.activePlayerId !== msg.state.activePlayerId &&
              msg.state.activePlayerId === myCurrentId
            ) {
              sounds.playTurnNotification();
            }
            setRoomState(msg.state);
            break;
          }

          case 'PLAYER_DISCONNECTED': {
            if (!activeRoomIdRef.current || leftRoomRef.current === activeRoomIdRef.current) {
              break;
            }
            triggerConnectionAlert('DISCONNECTED', msg.playerId, msg.playerName, msg.color, msg.reconnectDeadline);
            break;
          }

          case 'PLAYER_RECONNECTED': {
            if (!activeRoomIdRef.current || leftRoomRef.current === activeRoomIdRef.current) {
              break;
            }
            triggerConnectionAlert('RECONNECTED', msg.playerId, msg.playerName, msg.color);
            break;
          }

          case 'MOVE_ACCEPTED': {
            if (!activeRoomIdRef.current || msg.state.roomId !== activeRoomIdRef.current || leftRoomRef.current === msg.state.roomId) {
              break;
            }
            sounds.playPlacePiece();
            const previousState = roomStateRef.current;
            setRoomState(msg.state);
            const myCurrentId = playerIdRef.current;
            if (msg.move.playerId === myCurrentId && moveSentAtRef.current !== null) {
              const durationMs = Date.now() - moveSentAtRef.current;
              moveSentAtRef.current = null;
              joinMetrics.recordMoveDuration(durationMs);
            }
            if (
              msg.state.status === 'IN_PROGRESS' &&
              myCurrentId &&
              msg.state.activePlayerId === myCurrentId &&
              previousState?.activePlayerId !== msg.state.activePlayerId
            ) {
              sounds.playTurnNotification();
            }
            break;
          }

          case 'MOVE_REJECTED': {
            joinMetrics.recordClientMoveRejected(normalizeMoveRejectionReason(msg.reason));
            moveSentAtRef.current = null;
            sounds.playInvalid();
            showError(msg.reason, 3000);
            break;
          }

          case 'PLAYER_PASSED': {
            break;
          }

          case 'GAME_OVER': {
            if (!activeRoomIdRef.current || msg.state.roomId !== activeRoomIdRef.current || leftRoomRef.current === msg.state.roomId) {
              break;
            }
            setRoomState(msg.state);
            break;
          }

          case 'PONG': {
            const rtt = Math.max(0, Date.now() - msg.clientTs);
            const estimatedOffset = msg.serverTs + Math.floor(rtt / 2) - Date.now();
            if (Math.abs(estimatedOffset - clockOffsetRef.current) > CLOCK_DRIFT_THRESHOLD_MS) {
              clockOffsetRef.current = estimatedOffset;
              setClockOffsetMs(estimatedOffset);
            }
            break;
          }

          case 'ERROR': {
            if (msg.code === 'ROOM_NOT_FOUND') {
              joinMetrics.wrongCode();
              clearRoomSessionStorage();
              activeRoomIdRef.current = null;
              setRoomState(null);
              setPlayerId(null);
            } else {
              joinMetrics.rejected();
            }
            sounds.playInvalid();
            showError(msg.message, 4000);
            break;
          }
        }
      } catch (e) {
        console.error('Failed to parse server message', e);
      }
    };
  }, [cancelPendingLeaveClose, clearError, showError, triggerConnectionAlert]);

  useEffect(() => {
    joinMetrics.init();
    // Warm up the WebSocket connection immediately on mount so room creation/joining is instantaneous
    connect();

    return () => {
      cancelPendingLeaveClose();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
      if (alertTimeoutRef.current) clearTimeout(alertTimeoutRef.current);
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      if (wsRef.current) {
        const ws = wsRef.current;
        (ws as WebSocket & { __intentionalClose?: boolean }).__intentionalClose = true;
        wsRef.current = null;
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
        // If CONNECTING (e.g. React StrictMode double-invoke), ws.onopen checks __intentionalClose and closes cleanly
      }
    };
  }, [cancelPendingLeaveClose, connect]);

  const send = useCallback((msg: ClientMessage) => {
    cancelPendingLeaveClose();
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    } else {
      console.log('[WS] Socket not open, queueing message and connecting:', msg.type);
      if (msg.type === 'CREATE_ROOM' && pendingMessagesRef.current.some(m => m.type === 'CREATE_ROOM')) {
        return;
      }
      if (pendingMessagesRef.current.length < 5) {
        pendingMessagesRef.current.push(msg);
      }
      connect();
    }
  }, [cancelPendingLeaveClose, connect]);

  const createRoom = useCallback((playerName: string, avatarSeed?: string, authToken?: string) => {
    cancelPendingLeaveClose();
    leftRoomRef.current = null;
    reconnectAttemptsRef.current = 0;
    clearRoomSessionStorage();
    sessionStorage.setItem('blokus_player_name', playerName);
    joinMetrics.start('host');
    send({
      type: 'CREATE_ROOM',
      playerName,
      avatarSeed,
      ...(authToken ? { authToken } : {})
    });
  }, [cancelPendingLeaveClose, send]);

  const joinRoom = useCallback((roomId: string, playerName: string, avatarSeed?: string, authToken?: string) => {
    cancelPendingLeaveClose();
    leftRoomRef.current = null;
    reconnectAttemptsRef.current = 0;
    const formattedRoomId = roomId.trim().toUpperCase();
    sessionStorage.setItem('blokus_player_name', playerName);
    const savedRoomId = sessionStorage.getItem('blokus_room_id');
    const savedPlayerId = sessionStorage.getItem('blokus_player_id');
    const savedPlayerToken = sessionStorage.getItem('blokus_player_token');
    const isReconnect = savedRoomId === formattedRoomId && !!savedPlayerId && !!savedPlayerToken;
    const existingPlayerId = isReconnect ? savedPlayerId! : undefined;
    const playerTokenArg = isReconnect ? savedPlayerToken! : undefined;
    joinMetrics.start('join');
    send({
      type: 'JOIN_ROOM',
      roomId: formattedRoomId,
      playerName,
      avatarSeed,
      existingPlayerId,
      playerToken: playerTokenArg,
      ...(authToken ? { authToken } : {})
    });
  }, [cancelPendingLeaveClose, send]);

  const addBot = useCallback((roomId: string, botName?: string) => {
    send({ type: 'ADD_BOT', roomId, botName });
  }, [send]);

  const removeBot = useCallback((roomId: string, botId: string) => {
    send({ type: 'REMOVE_BOT', roomId, botId });
  }, [send]);

  const kickPlayer = useCallback((roomId: string, targetPlayerId: string) => {
    send({ type: 'KICK_PLAYER', roomId, playerId: targetPlayerId });
  }, [send]);

  const startGame = useCallback((roomId: string) => {
    send({ type: 'START_GAME', roomId });
  }, [send]);

  const returnToLobby = useCallback((roomId: string) => {
    send({ type: 'RETURN_TO_LOBBY', roomId });
  }, [send]);

  const placePiece = useCallback((
    roomId: string,
    pieceId: PieceId,
    rotation: number,
    flip: boolean,
    originX: number,
    originY: number
  ) => {
    moveSentAtRef.current = Date.now();
    send({ type: 'PLACE_PIECE', roomId, pieceId, rotation, flip, originX, originY });
  }, [send]);

  const passTurn = useCallback((roomId: string) => {
    send({ type: 'PASS_TURN', roomId });
  }, [send]);

  const leaveRoom = useCallback((roomId: string) => {
    clearRoomSessionStorage();
    sessionStorage.removeItem('blokus_player_name');
    leftRoomRef.current = roomId;
    activeRoomIdRef.current = null;
    pendingMessagesRef.current = [];
    moveSentAtRef.current = null;
    reconnectAttemptsRef.current = 0;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'LEAVE_ROOM', roomId }));
    }

    setRoomState(null);
    setPlayerId(null);

    cancelPendingLeaveClose();
    leaveTimeoutRef.current = setTimeout(() => {
      leaveTimeoutRef.current = null;
      const ws = wsRef.current;
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        (ws as WebSocket & { __intentionalClose?: boolean }).__intentionalClose = true;
        wsRef.current = null;
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }
        setConnected(false);
        if (ws.readyState === WebSocket.OPEN) {
          console.log('[WS] Cleanly closing socket upon returning to main menu');
          ws.close(1000, 'Left room');
        }
      }
    }, 300);
  }, [cancelPendingLeaveClose]);

  return {
    connected,
    clockOffsetMs,
    roomState,
    playerId,
    lastError,
    connectionAlert,
    dismissConnectionAlert,
    createRoom,
    joinRoom,
    leaveRoom,
    addBot,
    removeBot,
    kickPlayer,
    startGame,
    returnToLobby,
    placePiece,
    passTurn,
    resetError: clearError
  };
}
