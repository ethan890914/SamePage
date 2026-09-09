import {
  isConvergeSettings,
  isPatternRaceSettings,
  type ConvergeSettings,
  type PatternRaceSettings,
} from './game-settings';
import {
  isConvergeCommand,
  type ConvergeCommand,
  type ConvergePublicState,
} from './converge';
import {
  isPatternRaceCommand,
  type PatternRaceCommand,
  type PatternRaceGuessError,
  type PatternRaceState,
} from './pattern-race';
import {
  isBoothCommand,
  type BoothCommand,
  type BoothState,
} from './photo-booth';
export const PROTOCOL_VERSION = 1 as const;

export const activityIds = ['converge', 'pattern-race', 'photo-booth'] as const;
export type ActivityId = (typeof activityIds)[number];

export const avatarIds = [
  'avatar-1',
  'avatar-2',
  'avatar-3',
  'avatar-4',
  'avatar-5',
  'avatar-6',
  'avatar-7',
  'avatar-8',
] as const;
export type AvatarId = (typeof avatarIds)[number];

export const joinRejectedReasons = [
  'bad_password',
  'room_full',
  'rate_limited',
  'invalid_message',
  'room_not_found',
  'session_expired',
] as const;
export type JoinRejectedReason = (typeof joinRejectedReasons)[number];

export type CreateRoomRequest = {
  protocolVersion: typeof PROTOCOL_VERSION;
  requestId: string;
  sessionToken: string;
  name: string;
  avatarId: AvatarId;
  password: string;
};

export type CreateRoomResponse = {
  protocolVersion: typeof PROTOCOL_VERSION;
  roomCode: string;
  selfId: string;
};

export type CreateRoomError = {
  error: {
    code:
      | 'invalid_json'
      | 'invalid_message'
      | 'unsupported_version'
      | 'room_creation_failed';
    message: string;
  };
};

export type ClientMessage =
  | {
      type: 'pattern_race_command';
      protocolVersion: typeof PROTOCOL_VERSION;
      requestId: string;
      instanceId: string;
      command: PatternRaceCommand;
    }
  | {
      type: 'set_booth_settings';
      protocolVersion: typeof PROTOCOL_VERSION;
      requestId: string;
      activityId: 'photo-booth';
      countdownSeconds: number;
    }
  | {
      type: 'converge_command';
      protocolVersion: typeof PROTOCOL_VERSION;
      requestId: string;
      instanceId: string;
      command: ConvergeCommand;
    }
  | {
      type: 'set_game_settings';
      protocolVersion: typeof PROTOCOL_VERSION;
      requestId: string;
      activityId: 'converge';
      settings: ConvergeSettings;
    }
  | {
      type: 'set_pattern_race_settings';
      protocolVersion: typeof PROTOCOL_VERSION;
      requestId: string;
      activityId: 'pattern-race';
      settings: PatternRaceSettings;
    }
  | {
      type: 'booth_command';
      protocolVersion: typeof PROTOCOL_VERSION;
      requestId: string;
      instanceId: string;
      command: BoothCommand;
    }
  | {
      type: 'join_room';
      protocolVersion: typeof PROTOCOL_VERSION;
      requestId: string;
      sessionToken: string;
      name: string;
      avatarId: AvatarId;
      password: string;
    }
  | {
      type: 'reconnect';
      protocolVersion: typeof PROTOCOL_VERSION;
      requestId: string;
      sessionToken: string;
    }
  | {
      type: 'select_activity';
      protocolVersion: typeof PROTOCOL_VERSION;
      requestId: string;
      activityId: ActivityId;
    }
  | {
      type: 'set_ready';
      protocolVersion: typeof PROTOCOL_VERSION;
      requestId: string;
      activityId: ActivityId;
      ready: boolean;
    }
  | {
      type: 'exit_activity';
      protocolVersion: typeof PROTOCOL_VERSION;
      requestId: string;
      activityId: ActivityId;
    }
  | {
      type: 'leave_room';
      protocolVersion: typeof PROTOCOL_VERSION;
      requestId: string;
    }
  | { type: 'heartbeat'; protocolVersion: typeof PROTOCOL_VERSION };

export type PlayerView = {
  id: string;
  name: string;
  avatarId: AvatarId;
  connected: boolean;
  selectedActivity: ActivityId | null;
  ready: boolean;
};

type ServerEnvelope = {
  protocolVersion: typeof PROTOCOL_VERSION;
  serverTime: number;
};

export type ServerMessage =
  | (ServerEnvelope & {
      type: 'pattern_race_state';
      requestId: string;
      state: PatternRaceState;
    })
  | (ServerEnvelope & {
      type: 'pattern_race_guess_rejected';
      requestId: string;
      reason: PatternRaceGuessError;
    })
  | (ServerEnvelope & {
      type: 'converge_state';
      requestId: string;
      state: ConvergePublicState;
    })
  | (ServerEnvelope & {
      type: 'booth_state';
      requestId: string;
      state: BoothState;
    })
  | (ServerEnvelope & {
      type: 'booth_signal';
      instanceId: string;
      fromId: string;
      signal: {
        type: 'offer' | 'answer' | 'candidate' | 'hello' | 'restart';
        value: string;
      };
    })
  | (ServerEnvelope & { type: 'booth_ice'; iceServers: RTCIceServer[] })
  | (ServerEnvelope & {
      type: 'join_accepted';
      requestId: string;
      roomCode: string;
      selfId: string;
      revision: number;
      players: PlayerView[];
    })
  | (ServerEnvelope & {
      type: 'join_rejected';
      requestId: string;
      reason: JoinRejectedReason;
    })
  | (ServerEnvelope & {
      type: 'reconnect_accepted';
      requestId: string;
      roomCode: string;
      selfId: string;
      revision: number;
      players: PlayerView[];
    })
  | (ServerEnvelope & {
      type: 'room_snapshot';
      convergeSettings?: ConvergeSettings;
      patternRaceSettings?: PatternRaceSettings;
      boothCountdownSeconds?: number;
      roomCode: string;
      revision: number;
      players: PlayerView[];
      activeActivity: ActivityId | null;
      activityInstanceId?: string | null;
    })
  | (ServerEnvelope & {
      type: 'activity_started';
      activityId: ActivityId;
      activityInstanceId: string;
      revision: number;
    })
  | (ServerEnvelope & { type: 'heartbeat_ack' })
  | (ServerEnvelope & {
      type: 'command_rejected';
      requestId: string;
      reason:
        | 'not_in_activity'
        | 'activity_already_started'
        | 'player_not_found'
        | 'stale_round'
        | 'already_submitted'
        | 'game_not_playing';
    })
  | (ServerEnvelope & {
      type: 'protocol_error';
      requestId?: string;
      code:
        | 'invalid_json'
        | 'invalid_message'
        | 'unsupported_version'
        | 'unsupported_message';
      message: string;
    });

export type ParseResult<T> =
  | { success: true; data: T }
  | {
      success: false;
      error: 'invalid_json' | 'invalid_message' | 'unsupported_version';
    };

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,160}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).every((key) => keys.includes(key));
}

function hasVersion(value: Record<string, unknown>) {
  return value.protocolVersion === PROTOCOL_VERSION;
}

function isRequestId(value: unknown): value is string {
  return typeof value === 'string' && REQUEST_ID_PATTERN.test(value);
}

function isSessionToken(value: unknown): value is string {
  return typeof value === 'string' && SESSION_TOKEN_PATTERN.test(value);
}

function isName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value === value.trim() &&
    value.length >= 1 &&
    value.length <= 40
  );
}

function isPassword(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 8 && value.length <= 128;
}

export function isActivityId(value: unknown): value is ActivityId {
  return typeof value === 'string' && activityIds.includes(value as ActivityId);
}

export function isAvatarId(value: unknown): value is AvatarId {
  return typeof value === 'string' && avatarIds.includes(value as AvatarId);
}

export function parseCreateRoomRequest(
  value: unknown,
): ParseResult<CreateRoomRequest> {
  if (!isRecord(value)) return { success: false, error: 'invalid_message' };
  if (!hasVersion(value))
    return { success: false, error: 'unsupported_version' };
  const keys = [
    'protocolVersion',
    'requestId',
    'sessionToken',
    'name',
    'avatarId',
    'password',
  ];
  if (
    !hasOnlyKeys(value, keys) ||
    !isRequestId(value.requestId) ||
    !isSessionToken(value.sessionToken) ||
    !isName(value.name) ||
    !isAvatarId(value.avatarId) ||
    !isPassword(value.password)
  ) {
    return { success: false, error: 'invalid_message' };
  }
  return { success: true, data: value as CreateRoomRequest };
}

export function parseClientMessage(raw: string): ParseResult<ClientMessage> {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { success: false, error: 'invalid_json' };
  }
  if (!isRecord(value) || typeof value.type !== 'string')
    return { success: false, error: 'invalid_message' };
  if (!hasVersion(value))
    return { success: false, error: 'unsupported_version' };

  if (value.type === 'heartbeat') {
    return hasOnlyKeys(value, ['type', 'protocolVersion'])
      ? { success: true, data: value as ClientMessage }
      : { success: false, error: 'invalid_message' };
  }
  if (!isRequestId(value.requestId))
    return { success: false, error: 'invalid_message' };

  switch (value.type) {
    case 'pattern_race_command':
      if (
        hasOnlyKeys(value, [
          'type',
          'protocolVersion',
          'requestId',
          'instanceId',
          'command',
        ]) &&
        typeof value.instanceId === 'string' &&
        value.instanceId.length <= 80 &&
        isPatternRaceCommand(value.command)
      )
        return { success: true, data: value as ClientMessage };
      break;
    case 'converge_command':
      if (
        hasOnlyKeys(value, [
          'type',
          'protocolVersion',
          'requestId',
          'instanceId',
          'command',
        ]) &&
        typeof value.instanceId === 'string' &&
        value.instanceId.length <= 80 &&
        isConvergeCommand(value.command)
      )
        return { success: true, data: value as ClientMessage };
      break;
    case 'set_game_settings':
      if (
        hasOnlyKeys(value, [
          'type',
          'protocolVersion',
          'requestId',
          'activityId',
          'settings',
        ]) &&
        value.activityId === 'converge' &&
        isConvergeSettings(value.settings)
      )
        return { success: true, data: value as ClientMessage };
      break;
    case 'set_pattern_race_settings':
      if (
        hasOnlyKeys(value, [
          'type',
          'protocolVersion',
          'requestId',
          'activityId',
          'settings',
        ]) &&
        value.activityId === 'pattern-race' &&
        isPatternRaceSettings(value.settings)
      )
        return { success: true, data: value as ClientMessage };
      break;
    case 'set_booth_settings':
      if (
        hasOnlyKeys(value, [
          'type',
          'protocolVersion',
          'requestId',
          'activityId',
          'countdownSeconds',
        ]) &&
        value.activityId === 'photo-booth' &&
        [10, 12, 15].includes(value.countdownSeconds as number)
      )
        return { success: true, data: value as ClientMessage };
      break;
    case 'booth_command':
      if (
        hasOnlyKeys(value, [
          'type',
          'protocolVersion',
          'requestId',
          'instanceId',
          'command',
        ]) &&
        typeof value.instanceId === 'string' &&
        value.instanceId.length <= 80 &&
        isBoothCommand(value.command)
      )
        return { success: true, data: value as ClientMessage };
      break;
    case 'join_room':
      if (
        hasOnlyKeys(value, [
          'type',
          'protocolVersion',
          'requestId',
          'sessionToken',
          'name',
          'avatarId',
          'password',
        ]) &&
        isSessionToken(value.sessionToken) &&
        isName(value.name) &&
        isAvatarId(value.avatarId) &&
        isPassword(value.password)
      )
        return { success: true, data: value as ClientMessage };
      break;
    case 'reconnect':
      if (
        hasOnlyKeys(value, [
          'type',
          'protocolVersion',
          'requestId',
          'sessionToken',
        ]) &&
        isSessionToken(value.sessionToken)
      )
        return { success: true, data: value as ClientMessage };
      break;
    case 'select_activity':
    case 'exit_activity':
      if (
        hasOnlyKeys(value, [
          'type',
          'protocolVersion',
          'requestId',
          'activityId',
        ]) &&
        isActivityId(value.activityId)
      )
        return { success: true, data: value as ClientMessage };
      break;
    case 'set_ready':
      if (
        hasOnlyKeys(value, [
          'type',
          'protocolVersion',
          'requestId',
          'activityId',
          'ready',
        ]) &&
        isActivityId(value.activityId) &&
        typeof value.ready === 'boolean'
      )
        return { success: true, data: value as ClientMessage };
      break;
    case 'leave_room':
      if (hasOnlyKeys(value, ['type', 'protocolVersion', 'requestId']))
        return { success: true, data: value as ClientMessage };
      break;
  }
  return { success: false, error: 'invalid_message' };
}
