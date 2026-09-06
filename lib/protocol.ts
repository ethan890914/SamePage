export const activityIds = ['converge', 'pattern-race', 'photo-booth'] as const;

export type ActivityId = (typeof activityIds)[number];
export type JoinRejectedReason =
  | 'bad_password'
  | 'room_full'
  | 'rate_limited'
  | 'invalid_message';

export type ClientMessage =
  | {
      type: 'join_room';
      protocolVersion: 1;
      sessionToken: string;
      name: string;
      password: string;
    }
  | { type: 'reconnect'; protocolVersion: 1; sessionToken: string }
  | { type: 'select_activity'; activityId: ActivityId }
  | { type: 'set_ready'; activityId: ActivityId; ready: boolean }
  | { type: 'exit_activity'; activityId: ActivityId }
  | { type: 'leave_room' };

export type PlayerView = {
  id: string;
  name: string;
  connected: boolean;
  selectedActivity: ActivityId | null;
  ready: boolean;
};

export type ServerMessage =
  | {
      type: 'join_accepted';
      roomCode: string;
      selfId: string;
      players: PlayerView[];
    }
  | { type: 'join_rejected'; reason: JoinRejectedReason }
  | {
      type: 'room_snapshot';
      roomCode: string;
      players: PlayerView[];
      activeActivity: ActivityId | null;
    }
  | { type: 'activity_started'; activityId: ActivityId };
