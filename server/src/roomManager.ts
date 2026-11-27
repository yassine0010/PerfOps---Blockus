import crypto from 'crypto';
import { GameRoom } from './gameRoom.ts';

interface PlayerSession {
  roomId: string;
  playerId: string;
  createdAt: number;
}

const FINISHED_ROOM_TTL_MS = 10 * 60 * 1000; // 10 minutes
const IDLE_WAITING_TTL_MS = 30 * 60 * 1000;  // 30 minutes
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;  // 24 hours

export class RoomManager {
  private rooms: Map<string, GameRoom> = new Map();
  private playerSessions: Map<string, PlayerSession> = new Map();

  constructor() {
    // Periodic room and session cleanup check every 60 seconds
    const cleanupTimer = setInterval(() => this.cleanupInactiveRooms(), 60000);
    if (cleanupTimer.unref) cleanupTimer.unref();
  }

  public createRoom(): GameRoom {
    let roomId = this.generateRoomCode();
    while (this.rooms.has(roomId)) {
      roomId = this.generateRoomCode();
    }

    const room = new GameRoom(roomId);
    this.rooms.set(roomId, room);
    console.log(`[RoomManager] Room created: ${roomId}`);
    return room;
  }

  public getRoom(roomId: string): GameRoom | undefined {
    if (typeof roomId !== 'string') return undefined;
    return this.rooms.get(roomId.toUpperCase());
  }

  public registerSession(token: string, roomId: string, playerId: string): void {
    this.playerSessions.set(token, { roomId, playerId, createdAt: Date.now() });
  }

  public getSession(token: string): { roomId: string; playerId: string } | undefined {
    if (typeof token !== 'string' || !token) return undefined;
    const session = this.playerSessions.get(token);
    if (!session) return undefined;
    if (Date.now() - session.createdAt > SESSION_TTL_MS || !this.rooms.has(session.roomId)) {
      this.playerSessions.delete(token);
      return undefined;
    }
    return { roomId: session.roomId, playerId: session.playerId };
  }

  public removeRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (room) {
      room.destroy();
      this.rooms.delete(roomId);
    }
    for (const [token, session] of this.playerSessions.entries()) {
      if (session.roomId === roomId) {
        this.playerSessions.delete(token);
      }
    }
    console.log(`[RoomManager] Room removed: ${roomId}`);
  }

  public getRoomStatusCounts(): { WAITING: number; IN_PROGRESS: number; FINISHED: number } {
    const counts = { WAITING: 0, IN_PROGRESS: 0, FINISHED: 0 };
    for (const room of this.rooms.values()) {
      if (room.status in counts) {
        counts[room.status]++;
      }
    }
    return counts;
  }

  private cleanupInactiveRooms(): void {
    const now = Date.now();
    for (const [roomId, room] of Array.from(this.rooms.entries())) {
      const players = Array.from(room.players.values());
      const hasAnyHuman = players.some(p => !p.isBot);
      const hasActiveHuman = players.some(p => !p.isBot && !p.forfeited);
      const hasConnectedHuman = players.some(p => !p.isBot && p.isConnected);

      if (players.length === 0 || !hasAnyHuman) {
        this.removeRoom(roomId);
      } else if (room.status === 'IN_PROGRESS' && !hasActiveHuman) {
        this.removeRoom(roomId);
      } else if (
        room.status === 'FINISHED' &&
        (!hasConnectedHuman || now - (room.finishedAt ?? room.lastActivityAt) > FINISHED_ROOM_TTL_MS)
      ) {
        this.removeRoom(roomId);
      } else if (room.status === 'WAITING' && now - room.lastActivityAt > IDLE_WAITING_TTL_MS) {
        this.removeRoom(roomId);
      }
    }

    for (const [token, session] of this.playerSessions.entries()) {
      if (now - session.createdAt > SESSION_TTL_MS || !this.rooms.has(session.roomId)) {
        this.playerSessions.delete(token);
      }
    }
  }

  private generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(crypto.randomInt(chars.length));
    }
    return code;
  }
}
