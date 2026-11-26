import { GameRoom } from './gameRoom.ts';

export class RoomManager {
  private rooms: Map<string, GameRoom> = new Map();
  private playerSessions: Map<string, { roomId: string; playerId: string }> = new Map();

  constructor() {
    // Periodic room cleanup check every 60 seconds
    setInterval(() => this.cleanupInactiveRooms(), 60000);
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
    return this.rooms.get(roomId.toUpperCase());
  }

  public registerSession(token: string, roomId: string, playerId: string): void {
    this.playerSessions.set(token, { roomId, playerId });
  }

  public getSession(token: string): { roomId: string; playerId: string } | undefined {
    return this.playerSessions.get(token);
  }

  public removeRoom(roomId: string): void {
    this.rooms.delete(roomId);
    console.log(`[RoomManager] Room removed: ${roomId}`);
  }

  public getAllRooms(): GameRoom[] {
    return Array.from(this.rooms.values());
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
    for (const [roomId, room] of this.rooms.entries()) {
      if (room.getPlayerCount() === 0) {
        this.removeRoom(roomId);
      }
    }
  }

  private generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }
}
