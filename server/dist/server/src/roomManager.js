import { GameRoom } from './gameRoom.ts';
export class RoomManager {
    rooms = new Map();
    playerSessions = new Map();
    constructor() {
        // Periodic room cleanup check every 60 seconds
        setInterval(() => this.cleanupInactiveRooms(), 60000);
    }
    createRoom() {
        let roomId = this.generateRoomCode();
        while (this.rooms.has(roomId)) {
            roomId = this.generateRoomCode();
        }
        const room = new GameRoom(roomId);
        this.rooms.set(roomId, room);
        console.log(`[RoomManager] Room created: ${roomId}`);
        return room;
    }
    getRoom(roomId) {
        return this.rooms.get(roomId.toUpperCase());
    }
    registerSession(token, roomId, playerId) {
        this.playerSessions.set(token, { roomId, playerId });
    }
    getSession(token) {
        return this.playerSessions.get(token);
    }
    removeRoom(roomId) {
        this.rooms.delete(roomId);
        console.log(`[RoomManager] Room removed: ${roomId}`);
    }
    getAllRooms() {
        return Array.from(this.rooms.values());
    }
    getRoomStatusCounts() {
        const counts = { WAITING: 0, IN_PROGRESS: 0, FINISHED: 0 };
        for (const room of this.rooms.values()) {
            if (room.status in counts) {
                counts[room.status]++;
            }
        }
        return counts;
    }
    cleanupInactiveRooms() {
        for (const [roomId, room] of this.rooms.entries()) {
            if (room.getPlayerCount() === 0) {
                this.removeRoom(roomId);
            }
        }
    }
    generateRoomCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }
}
