import type { ActivityId, PlayerView } from '../lib/protocol';

export const ROOM_STORAGE_KEY = 'room';
export const CREATOR_RESERVATION_MS = 60_000;
export const DISCONNECT_GRACE_MS = 45_000;

export type RoomPlayer = {
  id: string;
  name: string;
  sessionTokenHash: string;
  connected: boolean;
  activeConnectionId: string | null;
  lastSeenAt: number;
  reservedUntil: number | null;
  selectedActivity: ActivityId | null;
  ready: boolean;
};

export type StoredRoom = {
  schemaVersion: 1;
  creationRequestId: string;
  roomCode: string;
  passwordSalt: string;
  passwordHash: string;
  createdAt: number;
  revision: number;
  activeActivity: ActivityId | null;
  activeActivityInstanceId: string | null;
  failedJoinAttempts: Record<
    string,
    { windowStartedAt: number; count: number }
  >;
  players: RoomPlayer[];
};

export type SocketAttachment = {
  connectionId: string;
  playerId: string | null;
  authenticated: boolean;
  clientKey: string;
};

export function playerView(player: RoomPlayer): PlayerView {
  return {
    id: player.id,
    name: player.name,
    connected: player.connected,
    selectedActivity: player.selectedActivity,
    ready: player.ready,
  };
}
