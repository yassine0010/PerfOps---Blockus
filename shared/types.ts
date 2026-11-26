export type PlayerColor = 'BLUE' | 'YELLOW' | 'RED' | 'GREEN';

export type PieceId =
  // 1 square
  | 'O1'
  // 2 squares
  | 'I2'
  // 3 squares
  | 'I3' | 'V3'
  // 4 squares
  | 'I4' | 'L4' | 'T4' | 'O4' | 'Z4'
  // 5 squares
  | 'F5' | 'I5' | 'L5' | 'P5' | 'N5' | 'T5' | 'U5' | 'V5' | 'W5' | 'X5' | 'Y5' | 'Z5';

export interface PieceDefinition {
  id: PieceId;
  name: string;
  size: number;
  // Shape represented as row-major 2D array of 0 or 1
  shape: number[][];
}

export interface ColorState {
  color: PlayerColor;
  controllerPlayerId: string;
  remainingPieces: PieceId[];
  squaresRemaining: number;
  hasPassed: boolean;
}

export interface PlayerInfo {
  id: string;
  name: string;
  color: PlayerColor;
  assignedColors?: PlayerColor[]; // In 2P: ['BLUE', 'RED'] or ['YELLOW', 'GREEN']
  isHost: boolean;
  isReady: boolean;
  isConnected: boolean;
  isBot?: boolean;
  forfeited?: boolean;
  disconnectedAt?: number;
  reconnectDeadline?: number;
  hasPassed: boolean;
  remainingPieces: PieceId[];
  squaresRemaining: number;
  avatarSeed?: string;
}

export type GameStatus = 'WAITING' | 'IN_PROGRESS' | 'FINISHED';

export type PlacementMode = 'CIRCULAR_BUTTON' | 'DOUBLE_TAP' | 'BOTTOM_BUTTON';

export type { CandidateMove } from './validator.ts';

export interface Move {
  playerId: string;
  playerName: string;
  color: PlayerColor;
  pieceId: PieceId;
  rotation: number; // 0, 90, 180, 270
  flip: boolean;
  originX: number;
  originY: number;
  coords: [number, number][];
  serverTimestamp: number;
  seq: number;
}

export interface RoomState {
  roomId: string;
  status: GameStatus;
  round: number;
  hostId: string;
  players: PlayerInfo[];
  currentTurn: PlayerColor;
  activePlayerId?: string; // Player ID whose turn it is right now
  colorStates?: Record<PlayerColor, ColorState>;
  sharedColor?: PlayerColor; // e.g. 'GREEN' in 3-player game
  sharedColorControllerId?: string;
  board: (PlayerColor | null)[][]; // 20x20
  turnStartedAt: number;
  turnDurationSeconds: number;
  history: Move[];
  winner?: PlayerColor | 'TIE';
}

// Client-to-Server Messages
export type ClientMessage =
  | { type: 'CREATE_ROOM'; playerName: string; avatarSeed?: string }
  | { type: 'JOIN_ROOM'; roomId: string; playerName: string; avatarSeed?: string; existingPlayerId?: string }
  | { type: 'LEAVE_ROOM'; roomId: string }
  | { type: 'TOGGLE_READY'; roomId: string }
  | { type: 'CHANGE_COLOR'; roomId: string; requestedColor: PlayerColor }
  | { type: 'ADD_BOT'; roomId: string; botName?: string }
  | { type: 'REMOVE_BOT'; roomId: string; botId: string }
  | { type: 'START_GAME'; roomId: string }
  | { type: 'PLACE_PIECE'; roomId: string; pieceId: PieceId; rotation: number; flip: boolean; originX: number; originY: number }
  | { type: 'PASS_TURN'; roomId: string }
  | { type: 'CHAT'; roomId: string; message: string }
  | { type: 'PING'; clientTs: number };

// Server-to-Client Messages
export type ServerMessage =
  | { type: 'ROOM_CREATED'; roomId: string; playerId: string; playerToken: string; state: RoomState }
  | { type: 'ROOM_JOINED'; roomId: string; playerId: string; playerToken: string; state: RoomState }
  | { type: 'ROOM_STATE_SYNC'; state: RoomState }
  | { type: 'MOVE_ACCEPTED'; move: Move; nextTurn: PlayerColor; state: RoomState }
  | { type: 'MOVE_REJECTED'; reason: string }
  | { type: 'TURN_CHANGED'; currentTurn: PlayerColor; turnStartedAt: number }
  | { type: 'PLAYER_PASSED'; playerId: string; color: PlayerColor; nextTurn: PlayerColor }
  | { type: 'PLAYER_DISCONNECTED'; playerId: string; playerName: string; color: PlayerColor; reconnectDeadline?: number }
  | { type: 'PLAYER_RECONNECTED'; playerId: string; playerName: string; color: PlayerColor }
  | { type: 'CHAT_MESSAGE'; senderName: string; color: PlayerColor; message: string; timestamp: number }
  | { type: 'GAME_OVER'; state: RoomState; rankings: { color: PlayerColor; name: string; squaresRemaining: number; rank: number }[] }
  | { type: 'ERROR'; message: string; code?: 'ROOM_NOT_FOUND' }
  | { type: 'PONG'; clientTs: number; serverTs: number };
