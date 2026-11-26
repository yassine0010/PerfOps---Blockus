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
}

export function useGameSocket() {
  const [connected, setConnected] = useState<boolean>(false);
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [playerToken, setPlayerToken] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<Array<{ senderName: string; color: PlayerColor; message: string; timestamp: number }>>([]);
  const [connectionAlert, setConnectionAlert] = useState<PlayerConnectionAlert | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playerIdRef = useRef<string | null>(null);
  const roomStateRef = useRef<RoomState | null>(null);
  const alertTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingMessagesRef = useRef<ClientMessage[]>([]);
  const moveSentAtRef = useRef<number | null>(null);
  const messagesCountRef = useRef<number>(0);

  const triggerConnectionAlert = useCallback((type: 'DISCONNECTED' | 'RECONNECTED', pId: string, pName: string, pColor: PlayerColor) => {
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
      timestamp: Date.now()
    });
    alertTimeoutRef.current = setTimeout(() => {
      setConnectionAlert(null);
    }, type === 'DISCONNECTED' ? 6000 : 4000);
  }, []);

  useEffect(() => {
    playerIdRef.current = playerId;
  }, [playerId]);

  useEffect(() => {
    roomStateRef.current = roomState;
  }, [roomState]);

  const connect = useCallback(() => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const wsUrl = getWsUrl();
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setConnectedAt(Date.now());
      setLastError(null);

      // Heartbeat ping every 4s to keep connection alive and promptly detect network drops
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'PING', clientTs: Date.now() }));
        }
      }, 4000);

      // Reconnect to existing room if was previously in one
      const savedRoomId = sessionStorage.getItem('blokus_room_id');
      const savedPlayerId = sessionStorage.getItem('blokus_player_id');
      const savedName = sessionStorage.getItem('blokus_player_name');
      if (savedRoomId && savedPlayerId && savedName) {
        ws.send(JSON.stringify({
          type: 'JOIN_ROOM',
          roomId: savedRoomId,
          playerName: savedName,
          existingPlayerId: savedPlayerId
        }));
      }

      // Flush any queued messages that were clicked while reconnecting
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
      joinMetrics.recordClientWsDisconnect(event?.code || 1006);
      if (messagesCountRef.current > 0) {
        joinMetrics.recordClientMessagesReceived(messagesCountRef.current);
        messagesCountRef.current = 0;
      }
      setConnected(false);
      setConnectedAt(null);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      // Clear pending queue so user isn't locked out of subsequent room creation attempts
      pendingMessagesRef.current = [];

      // Smart reconnect: only auto-reconnect if the player was actively inside a room/match
      const inActiveRoom = !!roomStateRef.current || !!sessionStorage.getItem('blokus_room_id');
      if (inActiveRoom) {
        console.log('[WS] In-game connection dropped. Auto-reconnecting in 1.5s...');
        setTimeout(connect, 1500);
      } else {
        console.log('[WS] Connection closed in lobby/menu. Remaining idle until next user action.');
      }
    };

    ws.onerror = (e) => {
      console.warn('[WS] connection error', e);
      joinMetrics.networkError();
      setLastError('Unable to connect to game server. Please make sure the server is running.');
      pendingMessagesRef.current = [];
    };

    ws.onmessage = (event) => {
      messagesCountRef.current++;
      try {
        const msg: ServerMessage = JSON.parse(event.data);
        switch (msg.type) {
          case 'ROOM_CREATED':
          case 'ROOM_JOINED': {
            setPlayerId(msg.playerId);
            setPlayerToken(msg.playerToken);
            setRoomState(msg.state);
            setLastError(null);
            joinMetrics.success();

            // Save to session storage for seamless reload/reconnect
            sessionStorage.setItem('blokus_room_id', msg.roomId);
            sessionStorage.setItem('blokus_player_id', msg.playerId);
            const selfPlayer = msg.state.players.find(p => p.id === msg.playerId);
            if (selfPlayer) {
              sessionStorage.setItem('blokus_player_name', selfPlayer.name);
            }
            break;
          }

          case 'ROOM_STATE_SYNC': {
            const previousState = roomStateRef.current;
            if (previousState) {
              for (const player of msg.state.players) {
                const prevPlayer = previousState.players.find(p => p.id === player.id);
                if (prevPlayer) {
                  if (prevPlayer.isConnected && !player.isConnected) {
                    triggerConnectionAlert('DISCONNECTED', player.id, player.name, player.color);
                  } else if (!prevPlayer.isConnected && player.isConnected) {
                    triggerConnectionAlert('RECONNECTED', player.id, player.name, player.color);
                  }
                }
              }
            }
            setRoomState(msg.state);
            break;
          }

          case 'PLAYER_DISCONNECTED': {
            triggerConnectionAlert('DISCONNECTED', msg.playerId, msg.playerName, msg.color);
            break;
          }

          case 'PLAYER_RECONNECTED': {
            triggerConnectionAlert('RECONNECTED', msg.playerId, msg.playerName, msg.color);
            break;
          }

          case 'MOVE_ACCEPTED': {
            sounds.playPlacePiece();
            setRoomState(msg.state);
            const myCurrentId = playerIdRef.current;
            if (msg.move.playerId === myCurrentId && moveSentAtRef.current !== null) {
              const durationMs = Date.now() - moveSentAtRef.current;
              moveSentAtRef.current = null;
              joinMetrics.recordMoveDuration(durationMs);
            }
            if (msg.nextTurn && myCurrentId) {
              const me = msg.state.players.find(p => p.id === myCurrentId);
              if (me && me.color === msg.nextTurn) {
                sounds.playTurnNotification();
              }
            }
            break;
          }

          case 'MOVE_REJECTED': {
            joinMetrics.recordClientMoveRejected(msg.reason);
            moveSentAtRef.current = null;
            sounds.playInvalid();
            setLastError(msg.reason);
            setTimeout(() => setLastError(null), 3000);
            break;
          }

          case 'TURN_CHANGED': {
            const myCurrentId = playerIdRef.current;
            const currentRoom = roomStateRef.current;
            if (myCurrentId && currentRoom) {
              const me = currentRoom.players.find(p => p.id === myCurrentId);
              if (me && me.color === msg.currentTurn) {
                sounds.playTurnNotification();
              }
            }
            break;
          }

          case 'PLAYER_PASSED': {
            break;
          }

          case 'CHAT_MESSAGE': {
            setChatMessages(prev => [...prev, {
              senderName: msg.senderName,
              color: msg.color,
              message: msg.message,
              timestamp: msg.timestamp
            }]);
            break;
          }

          case 'GAME_OVER': {
            setRoomState(msg.state);
            break;
          }

          case 'PONG': {
            break;
          }

          case 'ERROR': {
            if (msg.code === 'ROOM_NOT_FOUND') joinMetrics.wrongCode();
            sounds.playInvalid();
            setLastError(msg.message);
            setTimeout(() => setLastError(null), 4000);
            break;
          }
        }
      } catch (e) {
        console.error('Failed to parse server message', e);
      }
    };
  }, []); // Stable callback, doesn't tear down WebSocket when state updates!

  useEffect(() => {
    joinMetrics.init();
    // Warm up the WebSocket connection immediately on mount so room creation/joining is instantaneous
    connect();

    return () => {
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  const send = useCallback((msg: ClientMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    } else {
      console.log('[WS] Socket not open, queueing message and connecting:', msg.type);
      // Avoid duplicate room creation if clicked multiple times while connecting
      if (msg.type === 'CREATE_ROOM' && pendingMessagesRef.current.some(m => m.type === 'CREATE_ROOM')) {
        return;
      }
      if (pendingMessagesRef.current.length < 5) {
        pendingMessagesRef.current.push(msg);
      }
      // Lazily establish the connection if not already connecting
      connect();
    }
  }, [connect]);

  const createRoom = (playerName: string, avatarSeed?: string, authToken?: string) => {
    // Clear stale session keys so new room starts clean
    sessionStorage.removeItem('blokus_room_id');
    sessionStorage.removeItem('blokus_player_id');
    sessionStorage.setItem('blokus_player_name', playerName);
    joinMetrics.start('host');
    send({ type: 'CREATE_ROOM', playerName, avatarSeed, ...(authToken ? { authToken } as any : {}) } as any);
  };

  const joinRoom = (roomId: string, playerName: string, avatarSeed?: string, authToken?: string) => {
    const formattedRoomId = roomId.trim().toUpperCase();
    sessionStorage.setItem('blokus_player_name', playerName);
    const savedRoomId = sessionStorage.getItem('blokus_room_id');
    const savedPlayerId = sessionStorage.getItem('blokus_player_id');
    const existingPlayerId = savedRoomId === formattedRoomId ? (savedPlayerId || undefined) : undefined;
    joinMetrics.start('join');
    send({ type: 'JOIN_ROOM', roomId: formattedRoomId, playerName, avatarSeed, existingPlayerId, ...(authToken ? { authToken } as any : {}) } as any);
  };

  const toggleReady = (roomId: string) => {
    send({ type: 'TOGGLE_READY', roomId });
  };

  const changeColor = (roomId: string, requestedColor: PlayerColor) => {
    send({ type: 'CHANGE_COLOR', roomId, requestedColor });
  };

  const addBot = (roomId: string, botName?: string) => {
    send({ type: 'ADD_BOT', roomId, botName });
  };

  const removeBot = (roomId: string, botId: string) => {
    send({ type: 'REMOVE_BOT', roomId, botId });
  };

  const startGame = (roomId: string) => {
    send({ type: 'START_GAME', roomId });
  };

  const placePiece = (
    roomId: string,
    pieceId: PieceId,
    rotation: number,
    flip: boolean,
    originX: number,
    originY: number
  ) => {
    moveSentAtRef.current = Date.now();
    send({ type: 'PLACE_PIECE', roomId, pieceId, rotation, flip, originX, originY });
  };

  const passTurn = (roomId: string) => {
    send({ type: 'PASS_TURN', roomId });
  };

  const sendChat = (roomId: string, message: string) => {
    send({ type: 'CHAT', roomId, message });
  };

  const leaveRoom = (roomId: string) => {
    sessionStorage.removeItem('blokus_room_id');
    sessionStorage.removeItem('blokus_player_id');
    sessionStorage.removeItem('blokus_player_name');
    send({ type: 'LEAVE_ROOM', roomId });
    setRoomState(null);
    setPlayerId(null);
    setPlayerToken(null);

    // Cleanly close the socket when leaving the room and returning to main menu
    setTimeout(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        console.log('[WS] Cleanly closing socket upon returning to main menu');
        wsRef.current.close();
      }
    }, 300);
  };

  return {
    connected,
    connectedAt,
    roomState,
    playerId,
    playerToken,
    lastError,
    chatMessages,
    connectionAlert,
    dismissConnectionAlert: () => setConnectionAlert(null),
    createRoom,
    joinRoom,
    leaveRoom,
    toggleReady,
    changeColor,
    addBot,
    removeBot,
    startGame,
    placePiece,
    passTurn,
    sendChat,
    resetError: () => setLastError(null)
  };
}
