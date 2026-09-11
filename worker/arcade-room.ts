import {
  DEFAULT_CONVERGE_SETTINGS,
  DEFAULT_PATTERN_RACE_SETTINGS,
  isPatternRaceSettings,
  DEFAULT_MINESWEEPER_SETTINGS,
  DEFAULT_COLOR_PICKER_SETTINGS,
  isColorPickerSettings,
} from '../lib/game-settings';
import { colorScore, publicColorPickerState, randomTarget, type ColorPickerState } from '../lib/color-picker';
import {
  convergeWordsMatch,
  publicConvergeState,
  type ConvergeState,
} from '../lib/converge';
import { DurableObject } from 'cloudflare:workers';
import { AUTO_START_MS, takeDuration } from '../lib/photo-booth';
import {
  generatePatternRacePattern,
  patternRaceKey,
  normalizePatternRaceGuess,
  type PatternRaceState,
} from '../lib/pattern-race';
import { validatePatternRaceGuess } from './pattern-dictionary';
import {
  applyMinesweeperMove,
  newMinesweeperState,
  publicMinesweeperState,
} from '../lib/minesweeper';
import {
  PROTOCOL_VERSION,
  parseClientMessage,
  parseCreateRoomRequest,
  type ClientMessage,
  type JoinRejectedReason,
  type ServerMessage,
} from '../lib/protocol';
import {
  createPasswordVerifier,
  hashSessionToken,
  verifyPassword,
} from './crypto';
import type { Env } from './env';
import { errorResponse, jsonResponse } from './http';
import {
  CREATOR_RESERVATION_MS,
  DISCONNECT_GRACE_MS,
  ROOM_STORAGE_KEY,
  playerView,
  type RoomPlayer,
  type SocketAttachment,
  type StoredRoom,
} from './room-state';

const MAX_MESSAGE_BYTES = 8 * 1024;
const JOIN_ATTEMPT_LIMIT = 5;
const JOIN_ATTEMPT_WINDOW_MS = 60_000;

type InitializeRoomRequest = {
  roomCode: string;
  creator: unknown;
};

export class ArcadeRoom extends DurableObject<Env> {
  override async alarm() {
    await this.ctx.blockConcurrencyWhile(async () => {
      const room = await this.ctx.storage.get<StoredRoom>(ROOM_STORAGE_KEY);
      if (!room) return;
      const now = Date.now();
      const expired = room.players.filter(
        (player) =>
          !player.connected &&
          (player.reservedUntil === null || player.reservedUntil <= now),
      );
      const remaining = room.players.filter(
        (player) =>
          player.connected ||
          (player.reservedUntil !== null && player.reservedUntil > now),
      );
      if (remaining.length !== room.players.length) {
        room.players = remaining;
        const exitedActivities = new Set(
          expired.flatMap((player) =>
            player.selectedActivity ? [player.selectedActivity] : [],
          ),
        );
        for (const player of room.players) {
          if (
            player.selectedActivity &&
            exitedActivities.has(player.selectedActivity)
          )
            player.ready = false;
        }
        if (
          room.players.length < 2 &&
          room.activeActivity === 'minesweeper' &&
          room.minesweeper &&
          room.players.length > 0
        ) {
          this.abandonMinesweeper(room);
        } else if (room.players.length < 2) {
          room.activeActivity = null;
          room.activeActivityInstanceId = null;
          delete room.converge;
          delete room.patternRace;
          delete room.minesweeper;
          delete room.colorPicker;
        }
        room.revision += 1;
        await this.ctx.storage.put(ROOM_STORAGE_KEY, room);
        this.broadcastSnapshot(room);
        if (room.minesweeper) this.broadcastMinesweeperState(room);
      }
      if (room.booth?.autoStartAt != null && room.booth.autoStartAt <= now) {
        room.booth.autoStartAt = null;
        this.startBoothTake(room, now);
        await this.ctx.storage.put(ROOM_STORAGE_KEY, room);
        this.broadcast({
          type: 'booth_state',
          protocolVersion: PROTOCOL_VERSION,
          requestId: crypto.randomUUID(),
          serverTime: Date.now(),
          state: room.booth,
        });
      }
      if (room.converge?.deadline != null && room.converge.deadline <= now) {
        this.expireConvergeRound(room, now);
        await this.ctx.storage.put(ROOM_STORAGE_KEY, room);
        this.broadcastConvergeState(room);
      }
      if (room.colorPicker?.deadline != null && room.colorPicker.deadline <= now) {
        this.advanceColorPicker(room, now);
        await this.ctx.storage.put(ROOM_STORAGE_KEY, room);
        this.broadcastColorPickerState(room);
      }
      if (
        room.patternRace?.deadline != null &&
        room.patternRace.deadline <= now
      ) {
        this.finishPatternRace(room);
        await this.ctx.storage.put(ROOM_STORAGE_KEY, room);
        this.broadcastPatternRaceState(room);
      }
      if (
        room.patternRace?.nextProblemAt != null &&
        room.patternRace.nextProblemAt <= now
      ) {
        const state = room.patternRace;
        state.usedPatterns ??= [patternRaceKey(state.pattern)];
        const nextPattern = generatePatternRacePattern(
          state.settings,
          Math.random,
          state.usedPatterns,
        );
        if (nextPattern) {
          state.round += 1;
          state.phase = 'playing';
          state.pattern = nextPattern;
          state.usedPatterns.push(patternRaceKey(nextPattern));
        } else {
          this.finishPatternRace(room);
        }
        state.roundWinnerId = null;
        state.winningWord = null;
        state.skipIds = [];
        state.nextProblemAt = null;
        await this.ctx.storage.put(ROOM_STORAGE_KEY, room);
        this.broadcastPatternRaceState(room);
      }
      await this.scheduleNextAlarm(room);
    });
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/internal/initialize') {
      return this.initialize(request);
    }

    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return errorResponse(
        426,
        'websocket_required',
        'Expected a WebSocket upgrade.',
      );
    }

    const room = await this.ctx.storage.get<StoredRoom>(ROOM_STORAGE_KEY);
    if (!room)
      return errorResponse(404, 'room_not_found', 'Arcade room not found.');

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const attachment: SocketAttachment = {
      connectionId: crypto.randomUUID(),
      playerId: null,
      authenticated: false,
      clientKey: await hashSessionToken(
        `ip:${request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'}`,
        this.env.ROOM_PASSWORD_PEPPER,
      ),
    };
    server.serializeAttachment(attachment);
    this.ctx.acceptWebSocket(server, ['room-socket']);
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer,
  ) {
    if (
      typeof message !== 'string' ||
      new TextEncoder().encode(message).byteLength > MAX_MESSAGE_BYTES
    ) {
      this.sendProtocolError(
        ws,
        'invalid_message',
        'Messages must be UTF-8 JSON under 8 KiB.',
      );
      ws.close(1009, 'Invalid message');
      return;
    }

    const parsed = parseClientMessage(message);
    if (!parsed.success) {
      this.sendProtocolError(
        ws,
        parsed.error,
        'The message does not match protocol version 1.',
      );
      return;
    }

    const attachment = this.getAttachment(ws);
    if (!attachment?.authenticated) {
      if (
        parsed.data.type !== 'join_room' &&
        parsed.data.type !== 'reconnect'
      ) {
        this.sendProtocolError(
          ws,
          'invalid_message',
          'Authenticate before sending room commands.',
        );
        return;
      }
      const authenticationMessage: Extract<
        ClientMessage,
        { type: 'join_room' | 'reconnect' }
      > = parsed.data;
      await this.ctx.blockConcurrencyWhile(() =>
        this.authenticate(ws, attachment, authenticationMessage),
      );
      return;
    }

    if (parsed.data.type === 'heartbeat') {
      this.send(ws, {
        type: 'heartbeat_ack',
        protocolVersion: PROTOCOL_VERSION,
        serverTime: Date.now(),
      });
      return;
    }

    if (parsed.data.type === 'leave_room') {
      await this.leaveRoom(ws, attachment);
      return;
    }

    if (parsed.data.type === 'booth_command') {
      await this.handleBoothCommand(ws, attachment, parsed.data);
      return;
    }

    if (parsed.data.type === 'converge_command') {
      await this.handleConvergeCommand(ws, attachment, parsed.data);
      return;
    }
    if (parsed.data.type === 'color_picker_command') {
      await this.handleColorPickerCommand(ws, attachment, parsed.data);
      return;
    }

    if (parsed.data.type === 'minesweeper_command') {
      await this.handleMinesweeperCommand(ws, attachment, parsed.data);
      return;
    }

    if (parsed.data.type === 'pattern_race_command') {
      await this.handlePatternRaceCommand(ws, attachment, parsed.data);
      return;
    }

    if (
      parsed.data.type === 'set_game_settings' ||
      parsed.data.type === 'set_color_picker_settings' ||
      parsed.data.type === 'set_pattern_race_settings' ||
      parsed.data.type === 'set_minesweeper_settings' ||
      parsed.data.type === 'set_booth_settings' ||
      parsed.data.type === 'select_activity' ||
      parsed.data.type === 'set_ready' ||
      parsed.data.type === 'exit_activity'
    ) {
      await this.handleActivityCommand(ws, attachment, parsed.data);
      return;
    }

    this.sendProtocolError(
      ws,
      'unsupported_message',
      'This room command is not enabled yet.',
    );
  }

  override async webSocketClose(ws: WebSocket, code: number, reason: string) {
    await this.markDisconnected(ws);
    try {
      ws.close(code, reason);
    } catch {
      // The peer may have already completed the closing handshake.
    }
  }

  override async webSocketError(ws: WebSocket) {
    await this.markDisconnected(ws);
  }

  private async initialize(request: Request) {
    let body: InitializeRoomRequest;
    try {
      body = (await request.json()) as InitializeRoomRequest;
    } catch {
      return errorResponse(
        400,
        'invalid_json',
        'Expected a JSON room creation request.',
      );
    }

    const creator = parseCreateRoomRequest(body?.creator);
    if (!creator.success || typeof body.roomCode !== 'string') {
      return errorResponse(
        400,
        creator.success ? 'invalid_message' : creator.error,
        'Invalid room creation request.',
      );
    }

    return this.ctx.blockConcurrencyWhile(async () => {
      const existing = await this.ctx.storage.get<StoredRoom>(ROOM_STORAGE_KEY);
      const sessionTokenHash = await hashSessionToken(
        creator.data.sessionToken,
        this.env.ROOM_PASSWORD_PEPPER,
      );

      if (existing) {
        const sameCreator =
          existing.creationRequestId === creator.data.requestId &&
          existing.players[0]?.sessionTokenHash === sessionTokenHash;
        return sameCreator
          ? jsonResponse({
              protocolVersion: PROTOCOL_VERSION,
              roomCode: existing.roomCode,
              selfId: existing.players[0].id,
            })
          : errorResponse(
              409,
              'room_code_collision',
              'Generated room code is already in use.',
            );
      }

      const now = Date.now();
      const password = await createPasswordVerifier(
        creator.data.password,
        this.env.ROOM_PASSWORD_PEPPER,
      );
      const player: RoomPlayer = {
        id: crypto.randomUUID(),
        name: creator.data.name,
        avatarId: creator.data.avatarId,
        sessionTokenHash,
        connected: false,
        activeConnectionId: null,
        lastSeenAt: now,
        reservedUntil: now + CREATOR_RESERVATION_MS,
        selectedActivity: null,
        ready: false,
      };
      const room: StoredRoom = {
        schemaVersion: 1,
        creationRequestId: creator.data.requestId,
        roomCode: body.roomCode,
        passwordSalt: password.salt,
        passwordHash: password.hash,
        createdAt: now,
        revision: 1,
        activeActivity: null,
        activeActivityInstanceId: null,
        failedJoinAttempts: {},
        players: [player],
      };
      await this.ctx.storage.put(ROOM_STORAGE_KEY, room);
      await this.scheduleNextAlarm(room);
      return jsonResponse(
        {
          protocolVersion: PROTOCOL_VERSION,
          roomCode: room.roomCode,
          selfId: player.id,
        },
        { status: 201 },
      );
    });
  }

  private async authenticate(
    ws: WebSocket,
    attachment: SocketAttachment | null,
    message: Extract<ClientMessage, { type: 'join_room' | 'reconnect' }>,
  ) {
    if (!attachment) {
      this.sendProtocolError(
        ws,
        'invalid_message',
        'Socket metadata is unavailable.',
      );
      ws.close(1011, 'Socket metadata unavailable');
      return;
    }

    const room = await this.ctx.storage.get<StoredRoom>(ROOM_STORAGE_KEY);
    if (!room) return this.reject(ws, message.requestId, 'room_not_found');
    room.failedJoinAttempts ??= {};
    const attemptExpiry = Date.now() - JOIN_ATTEMPT_WINDOW_MS;
    for (const [key, attempt] of Object.entries(room.failedJoinAttempts)) {
      if (attempt.windowStartedAt < attemptExpiry)
        delete room.failedJoinAttempts[key];
    }

    if (message.type === 'join_room') {
      const attempt = room.failedJoinAttempts[attachment.clientKey];
      const now = Date.now();
      if (
        attempt &&
        now - attempt.windowStartedAt < JOIN_ATTEMPT_WINDOW_MS &&
        attempt.count >= JOIN_ATTEMPT_LIMIT
      ) {
        return this.reject(ws, message.requestId, 'rate_limited');
      }
      const passwordMatches = await verifyPassword(
        message.password,
        this.env.ROOM_PASSWORD_PEPPER,
        room.passwordSalt,
        room.passwordHash,
      );
      if (!passwordMatches) {
        room.failedJoinAttempts[attachment.clientKey] =
          !attempt || now - attempt.windowStartedAt >= JOIN_ATTEMPT_WINDOW_MS
            ? { windowStartedAt: now, count: 1 }
            : { ...attempt, count: attempt.count + 1 };
        await this.ctx.storage.put(ROOM_STORAGE_KEY, room);
        return this.reject(ws, message.requestId, 'bad_password');
      }
      delete room.failedJoinAttempts[attachment.clientKey];
    }

    const tokenHash = await hashSessionToken(
      message.sessionToken,
      this.env.ROOM_PASSWORD_PEPPER,
    );
    const now = Date.now();
    room.players = room.players.filter(
      (player) =>
        player.connected ||
        (player.reservedUntil !== null && player.reservedUntil > now),
    );
    // A join can arrive before the expiry alarm. Reconcile this game's
    // participants here as well so a replacement never inherits a live board.
    if (
      room.minesweeper &&
      room.activeActivity === 'minesweeper' &&
      !room.minesweeper.playerIds.every((id) =>
        room.players.some((candidate) => candidate.id === id),
      )
    ) {
      this.abandonMinesweeper(room);
      for (const candidate of room.players) candidate.ready = false;
      if (room.players.length === 0) {
        room.activeActivity = null;
        room.activeActivityInstanceId = null;
        delete room.minesweeper;
      }
    }
    let player = room.players.find(
      (candidate) => candidate.sessionTokenHash === tokenHash,
    );

    if (!player && message.type === 'reconnect') {
      return this.reject(ws, message.requestId, 'session_expired');
    }
    if (!player && room.players.length >= 2) {
      return this.reject(ws, message.requestId, 'room_full');
    }
    if (!player) {
      if (message.type !== 'join_room') {
        return this.reject(ws, message.requestId, 'session_expired');
      }
      player = {
        id: crypto.randomUUID(),
        name: message.name,
        avatarId: message.avatarId,
        sessionTokenHash: tokenHash,
        connected: false,
        activeConnectionId: null,
        lastSeenAt: now,
        reservedUntil: null,
        selectedActivity: null,
        ready: false,
      };
      room.players.push(player);
    }

    const previousConnectionId = player.activeConnectionId;
    player.connected = true;
    player.activeConnectionId = attachment.connectionId;
    player.lastSeenAt = now;
    player.reservedUntil = null;
    if (
      room.patternRace?.phase === 'round_won' &&
      room.patternRace.nextProblemAt == null &&
      room.players.every((candidate) => candidate.connected)
    ) {
      room.patternRace.nextProblemAt = now + 3000;
    }
    if (
      room.converge?.phase === 'playing' &&
      room.converge.deadline === null &&
      room.converge.pausedRemainingMs !== null &&
      room.players.length === 2 &&
      room.players.every((candidate) => candidate.connected)
    ) {
      room.converge.deadline = now + room.converge.pausedRemainingMs;
      room.converge.pausedRemainingMs = null;
    }
    if (
      room.patternRace?.phase !== 'finished' &&
      room.patternRace?.deadline === null &&
      room.patternRace?.pausedRemainingMs !== null &&
      room.players.length === 2 &&
      room.players.every((candidate) => candidate.connected)
    ) {
      room.patternRace.deadline = now + room.patternRace.pausedRemainingMs;
      room.patternRace.pausedRemainingMs = null;
    }
    room.revision += 1;
    attachment.authenticated = true;
    attachment.playerId = player.id;
    ws.serializeAttachment(attachment);
    await this.ctx.storage.put(ROOM_STORAGE_KEY, room);
    await this.scheduleNextAlarm(room);

    if (
      previousConnectionId &&
      previousConnectionId !== attachment.connectionId
    ) {
      for (const candidate of this.ctx.getWebSockets()) {
        const candidateAttachment = this.getAttachment(candidate);
        if (candidateAttachment?.connectionId === previousConnectionId) {
          candidate.close(4001, 'Connected from another tab');
        }
      }
    }

    this.send(ws, {
      type:
        message.type === 'reconnect' ? 'reconnect_accepted' : 'join_accepted',
      protocolVersion: PROTOCOL_VERSION,
      serverTime: now,
      requestId: message.requestId,
      roomCode: room.roomCode,
      selfId: player.id,
      revision: room.revision,
      players: room.players.map(playerView),
    });
    this.broadcastSnapshot(room);
    if (room.converge) this.broadcastConvergeState(room);
    if (room.patternRace) this.broadcastPatternRaceState(room);
    if (room.minesweeper) this.broadcastMinesweeperState(room);
    if (room.colorPicker) this.broadcastColorPickerState(room);
  }

  private async markDisconnected(ws: WebSocket) {
    const attachment = this.getAttachment(ws);
    if (!attachment?.authenticated || !attachment.playerId) return;
    await this.ctx.blockConcurrencyWhile(async () => {
      const room = await this.ctx.storage.get<StoredRoom>(ROOM_STORAGE_KEY);
      const player = room?.players.find(
        (candidate) => candidate.id === attachment.playerId,
      );
      if (
        !room ||
        !player ||
        player.activeConnectionId !== attachment.connectionId
      )
        return;
      player.connected = false;
      player.activeConnectionId = null;
      player.lastSeenAt = Date.now();
      player.reservedUntil = player.lastSeenAt + DISCONNECT_GRACE_MS;
      if (room.patternRace) room.patternRace.nextProblemAt = null;
      if (room.converge?.deadline != null) {
        room.converge.pausedRemainingMs = Math.max(
          1,
          room.converge.deadline - player.lastSeenAt,
        );
        room.converge.deadline = null;
      }
      if (room.patternRace?.deadline != null) {
        room.patternRace.pausedRemainingMs = Math.max(
          1,
          room.patternRace.deadline - player.lastSeenAt,
        );
        room.patternRace.deadline = null;
      }
      if (room.booth) {
        room.booth.readyIds = [];
        room.booth.takeId = null;
        room.booth.startsAt = null;
        room.booth.autoStartAt = null;
      }
      room.revision += 1;
      await this.ctx.storage.put(ROOM_STORAGE_KEY, room);
      await this.scheduleNextAlarm(room);
      this.broadcastSnapshot(room);
      if (room.converge) this.broadcastConvergeState(room);
      if (room.patternRace) this.broadcastPatternRaceState(room);
      if (room.colorPicker) this.broadcastColorPickerState(room);
    });
  }

  private async leaveRoom(ws: WebSocket, attachment: SocketAttachment) {
    await this.ctx.blockConcurrencyWhile(async () => {
      const room = await this.ctx.storage.get<StoredRoom>(ROOM_STORAGE_KEY);
      if (!room || !attachment.playerId) return;
      const player = room.players.find(
        (candidate) => candidate.id === attachment.playerId,
      );
      if (!player || player.activeConnectionId !== attachment.connectionId)
        return;
      room.players = room.players.filter(
        (candidate) => candidate.id !== player.id,
      );
      if (player.selectedActivity) {
        for (const remaining of room.players) {
          if (remaining.selectedActivity === player.selectedActivity)
            remaining.ready = false;
        }
      }
      if (
        room.players.length < 2 &&
        room.activeActivity === 'minesweeper' &&
        room.minesweeper &&
        room.players.length > 0
      ) {
        this.abandonMinesweeper(room);
      } else if (room.players.length < 2) {
        room.activeActivity = null;
        room.activeActivityInstanceId = null;
        delete room.converge;
        delete room.patternRace;
        delete room.minesweeper;
      }
      room.revision += 1;
      attachment.authenticated = false;
      attachment.playerId = null;
      ws.serializeAttachment(attachment);
      await this.ctx.storage.put(ROOM_STORAGE_KEY, room);
      await this.scheduleNextAlarm(room);
      this.broadcastSnapshot(room);
      ws.close(1000, 'Left room');
      if (room.minesweeper) this.broadcastMinesweeperState(room);
    });
  }

  private async handleActivityCommand(
    ws: WebSocket,
    attachment: SocketAttachment,
    command: Extract<
      ClientMessage,
      {
        type:
          | 'select_activity'
          | 'set_ready'
          | 'exit_activity'
          | 'set_game_settings'
          | 'set_pattern_race_settings'
          | 'set_minesweeper_settings'
          | 'set_booth_settings'
          | 'set_color_picker_settings';
      }
    >,
  ) {
    await this.ctx.blockConcurrencyWhile(async () => {
      const room = await this.ctx.storage.get<StoredRoom>(ROOM_STORAGE_KEY);
      const player = room?.players.find(
        (candidate) => candidate.id === attachment.playerId,
      );
      if (
        !room ||
        !player ||
        player.activeConnectionId !== attachment.connectionId
      ) {
        this.sendCommandRejected(ws, command.requestId, 'player_not_found');
        return;
      }
      if (
        room.activeActivity &&
        !(
          command.type === 'exit_activity' &&
          command.activityId === room.activeActivity
        )
      ) {
        this.sendCommandRejected(
          ws,
          command.requestId,
          'activity_already_started',
        );
        return;
      }

      if (command.type === 'set_minesweeper_settings') {
        if (player.selectedActivity !== 'minesweeper') {
          this.sendCommandRejected(ws, command.requestId, 'not_in_activity');
          return;
        }
        const previous =
          room.minesweeperSettings ?? DEFAULT_MINESWEEPER_SETTINGS;
        if (
          previous.rows === command.settings.rows &&
          previous.columns === command.settings.columns &&
          previous.difficulty === command.settings.difficulty &&
          previous.startingPlayer === command.settings.startingPlayer
        )
          return;
        room.minesweeperSettings = command.settings;
        for (const candidate of room.players) {
          if (candidate.selectedActivity === 'minesweeper')
            candidate.ready = false;
        }
      } else if (command.type === 'set_booth_settings') {
        if (player.selectedActivity !== 'photo-booth') {
          this.sendCommandRejected(ws, command.requestId, 'not_in_activity');
          return;
        }
        if ((room.boothCountdownSeconds ?? 10) === command.countdownSeconds)
          return;
        room.boothCountdownSeconds = command.countdownSeconds;
        for (const candidate of room.players) {
          if (candidate.selectedActivity === 'photo-booth')
            candidate.ready = false;
        }
      } else if (command.type === 'set_game_settings') {
        if (player.selectedActivity !== command.activityId) {
          this.sendCommandRejected(ws, command.requestId, 'not_in_activity');
          return;
        }
        const previous = room.convergeSettings ?? DEFAULT_CONVERGE_SETTINGS;
        if (
          previous.timeLimitSeconds === command.settings.timeLimitSeconds &&
          previous.mode === command.settings.mode &&
          previous.maxRounds === command.settings.maxRounds
        )
          return;
        room.convergeSettings = command.settings;
        for (const candidate of room.players) {
          if (candidate.selectedActivity === command.activityId)
            candidate.ready = false;
        }
      } else if (command.type === 'set_color_picker_settings') {
        if (player.selectedActivity !== 'color-picker') {
          this.sendCommandRejected(ws, command.requestId, 'not_in_activity');
          return;
        }
        room.colorPickerSettings = command.settings;
        for (const candidate of room.players) if (candidate.selectedActivity === 'color-picker') candidate.ready = false;
      } else if (command.type === 'set_pattern_race_settings') {
        if (player.selectedActivity !== 'pattern-race') {
          this.sendCommandRejected(ws, command.requestId, 'not_in_activity');
          return;
        }
        const previous = isPatternRaceSettings(room.patternRaceSettings)
          ? room.patternRaceSettings
          : DEFAULT_PATTERN_RACE_SETTINGS;
        if (
          previous.mode === command.settings.mode &&
          previous.timeLimitMinutes === command.settings.timeLimitMinutes &&
          previous.problemCount === command.settings.problemCount &&
          previous.wordLengthMode === command.settings.wordLengthMode
        )
          return;
        room.patternRaceSettings = command.settings;
        for (const candidate of room.players) {
          if (candidate.selectedActivity === 'pattern-race')
            candidate.ready = false;
        }
      } else if (command.type === 'select_activity') {
        const previousActivity = player.selectedActivity;
        if (previousActivity && previousActivity !== command.activityId) {
          for (const candidate of room.players) {
            if (candidate.selectedActivity === previousActivity)
              candidate.ready = false;
          }
        }
        player.selectedActivity = command.activityId;
        player.ready = false;
      } else if (command.type === 'set_ready') {
        if (player.selectedActivity !== command.activityId) {
          this.sendCommandRejected(ws, command.requestId, 'not_in_activity');
          return;
        }
        player.ready = command.ready;
      } else {
        if (player.selectedActivity !== command.activityId) {
          this.sendCommandRejected(ws, command.requestId, 'not_in_activity');
          return;
        }
        for (const candidate of room.players) {
          if (candidate.selectedActivity === command.activityId)
            candidate.ready = false;
        }
        player.selectedActivity = null;
        room.activeActivity = null;
        room.activeActivityInstanceId = null;
        delete room.booth;
        delete room.converge;
        delete room.patternRace;
        delete room.minesweeper;
        delete room.colorPicker;
      }

      room.revision += 1;
      const bothReady =
        room.players.length === 2 &&
        room.players.every(
          (candidate) =>
            candidate.connected &&
            candidate.selectedActivity === command.activityId &&
            candidate.ready,
        );
      let started = false;
      if (bothReady) {
        room.activeActivity = command.activityId;
        room.activeActivityInstanceId = crypto.randomUUID();
        if (command.activityId === 'converge') {
          room.converge = this.newConvergeState(
            room.activeActivityInstanceId,
            room.convergeSettings ?? DEFAULT_CONVERGE_SETTINGS,
          );
        } else if (command.activityId === 'minesweeper') {
          room.minesweeper = newMinesweeperState(
            room.activeActivityInstanceId,
            room.minesweeperSettings ?? DEFAULT_MINESWEEPER_SETTINGS,
            [room.players[0].id, room.players[1].id],
          );
        } else if (command.activityId === 'pattern-race') {
          room.patternRace = this.newPatternRaceState(
            room.activeActivityInstanceId,
            isPatternRaceSettings(room.patternRaceSettings)
              ? room.patternRaceSettings
              : DEFAULT_PATTERN_RACE_SETTINGS,
            room.players.map((candidate) => candidate.id),
          );
        }
        if (command.activityId === 'color-picker') {
          room.colorPicker = this.newColorPickerState(room.activeActivityInstanceId, room.colorPickerSettings ?? DEFAULT_COLOR_PICKER_SETTINGS, room.players.map((candidate) => candidate.id));
        }
        started = true;
      }
      await this.ctx.storage.put(ROOM_STORAGE_KEY, room);
      await this.scheduleNextAlarm(room);
      this.broadcastSnapshot(room);
      if (started && room.activeActivityInstanceId) {
        this.broadcast({
          type: 'activity_started',
          protocolVersion: PROTOCOL_VERSION,
          serverTime: Date.now(),
          activityId: command.activityId,
          activityInstanceId: room.activeActivityInstanceId,
          revision: room.revision,
        });
        if (command.activityId === 'converge')
          this.broadcastConvergeState(room);
        if (command.activityId === 'color-picker') this.broadcastColorPickerState(room);
        else if (command.activityId === 'pattern-race')
          this.broadcastPatternRaceState(room);
        else if (command.activityId === 'minesweeper')
          this.broadcastMinesweeperState(room);
      }
    });
  }

  private async scheduleNextAlarm(room: StoredRoom) {
    const deadlines = room.players.flatMap((player) =>
      !player.connected && player.reservedUntil !== null
        ? [player.reservedUntil]
        : [],
    );
    if (room.booth?.autoStartAt != null) deadlines.push(room.booth.autoStartAt);
    if (room.converge?.deadline != null) deadlines.push(room.converge.deadline);
    if (room.patternRace?.deadline != null)
      deadlines.push(room.patternRace.deadline);
    if (room.patternRace?.nextProblemAt != null)
      deadlines.push(room.patternRace.nextProblemAt);
    if (room.colorPicker?.deadline != null) deadlines.push(room.colorPicker.deadline);
    if (deadlines.length === 0) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    await this.ctx.storage.setAlarm(Math.min(...deadlines));
  }

  private reject(ws: WebSocket, requestId: string, reason: JoinRejectedReason) {
    this.send(ws, {
      type: 'join_rejected',
      protocolVersion: PROTOCOL_VERSION,
      serverTime: Date.now(),
      requestId,
      reason,
    });
    ws.close(1008, reason);
  }

  private broadcastSnapshot(room: StoredRoom) {
    const message: ServerMessage = {
      type: 'room_snapshot',
      convergeSettings: room.convergeSettings ?? DEFAULT_CONVERGE_SETTINGS,
      minesweeperSettings:
        room.minesweeperSettings ?? DEFAULT_MINESWEEPER_SETTINGS,
      colorPickerSettings: isColorPickerSettings(room.colorPickerSettings) ? room.colorPickerSettings : DEFAULT_COLOR_PICKER_SETTINGS,
      patternRaceSettings: isPatternRaceSettings(room.patternRaceSettings)
        ? room.patternRaceSettings
        : DEFAULT_PATTERN_RACE_SETTINGS,
      boothCountdownSeconds: room.boothCountdownSeconds ?? 10,
      protocolVersion: PROTOCOL_VERSION,
      serverTime: Date.now(),
      roomCode: room.roomCode,
      revision: room.revision,
      players: room.players.map(playerView),
      activeActivity: room.activeActivity,
      activityInstanceId: room.activeActivityInstanceId,
    };
    this.broadcast(message);
  }

  private abandonMinesweeper(room: StoredRoom) {
    const state = room.minesweeper;
    if (!state || state.phase === 'finished') return;
    state.phase = 'finished';
    state.result = 'abandoned';
    state.winnerId = null;
    state.replayReadyIds = [];
    state.revision += 1;
  }

  private broadcastMinesweeperState(
    room: StoredRoom,
    requestId: string = crypto.randomUUID(),
  ) {
    if (!room.minesweeper) return;
    this.broadcast({
      type: 'minesweeper_state',
      protocolVersion: PROTOCOL_VERSION,
      requestId,
      serverTime: Date.now(),
      state: publicMinesweeperState(room.minesweeper),
    });
  }

  private async handleMinesweeperCommand(
    ws: WebSocket,
    attachment: SocketAttachment,
    message: Extract<ClientMessage, { type: 'minesweeper_command' }>,
  ) {
    await this.ctx.blockConcurrencyWhile(async () => {
      const room = await this.ctx.storage.get<StoredRoom>(ROOM_STORAGE_KEY);
      const player = room?.players.find(
        (candidate) => candidate.id === attachment.playerId,
      );
      if (
        !room ||
        !player ||
        player.activeConnectionId !== attachment.connectionId
      ) {
        this.sendCommandRejected(ws, message.requestId, 'player_not_found');
        return;
      }
      const state = room.minesweeper;
      if (
        !state ||
        room.activeActivity !== 'minesweeper' ||
        room.activeActivityInstanceId !== message.instanceId ||
        player.selectedActivity !== 'minesweeper' ||
        !state.playerIds.includes(player.id)
      ) {
        this.sendCommandRejected(ws, message.requestId, 'not_in_activity');
        return;
      }
      const command = message.command;
      if (command.kind === 'sync') {
        this.send(ws, {
          type: 'minesweeper_state',
          protocolVersion: PROTOCOL_VERSION,
          requestId: message.requestId,
          serverTime: Date.now(),
          state: publicMinesweeperState(state),
        });
        return;
      }
      if (command.round !== state.round) {
        this.sendCommandRejected(ws, message.requestId, 'stale_round');
        return;
      }
      if (command.kind === 'return_to_setup') {
        if (state.phase !== 'finished') {
          this.sendCommandRejected(ws, message.requestId, 'game_not_playing');
          return;
        }
        room.minesweeperSettings = state.settings;
        room.activeActivity = null;
        room.activeActivityInstanceId = null;
        delete room.minesweeper;
        for (const candidate of room.players) candidate.ready = false;
        room.revision += 1;
        await this.ctx.storage.put(ROOM_STORAGE_KEY, room);
        this.broadcastSnapshot(room);
        return;
      }
      if (
        room.players.length !== 2 ||
        !room.players.every(
          (candidate) =>
            candidate.connected &&
            candidate.selectedActivity === 'minesweeper' &&
            state.playerIds.includes(candidate.id),
        )
      ) {
        this.sendCommandRejected(ws, message.requestId, 'game_not_playing');
        return;
      }
      if (command.kind === 'replay_ready') {
        if (state.phase !== 'finished' || state.result === 'abandoned') {
          this.sendCommandRejected(ws, message.requestId, 'game_not_playing');
          return;
        }
        state.replayReadyIds = state.replayReadyIds.filter(
          (id) => id !== player.id,
        );
        if (command.ready) state.replayReadyIds.push(player.id);
        state.revision += 1;
        if (state.playerIds.every((id) => state.replayReadyIds.includes(id))) {
          room.minesweeper = newMinesweeperState(
            state.instanceId,
            state.settings,
            state.playerIds,
            state.round + 1,
          );
        }
      } else {
        const rejection = applyMinesweeperMove(state, player.id, command);
        if (rejection) {
          this.sendCommandRejected(ws, message.requestId, rejection);
          // Return the authoritative board so a stale client can recover.
          this.send(ws, {
            type: 'minesweeper_state',
            protocolVersion: PROTOCOL_VERSION,
            requestId: message.requestId,
            serverTime: Date.now(),
            state: publicMinesweeperState(state),
          });
          return;
        }
      }
      await this.ctx.storage.put(ROOM_STORAGE_KEY, room);
      this.broadcastMinesweeperState(room, message.requestId);
    });
  }

  private newPatternRaceState(
    instanceId: string,
    settings: PatternRaceState['settings'],
    playerIds: string[],
  ): PatternRaceState {
    const pattern = generatePatternRacePattern(settings)!;
    return {
      instanceId,
      settings,
      phase: 'playing',
      round: 1,
      pattern,
      usedPatterns: [patternRaceKey(pattern)],
      nextProblemAt: null,
      skipIds: [],
      scores: Object.fromEntries(playerIds.map((id) => [id, 0])),
      deadline:
        settings.mode === 'time'
          ? Date.now() + settings.timeLimitMinutes * 60_000
          : null,
      pausedRemainingMs: null,
      roundWinnerId: null,
      winningWord: null,
      gameWinnerIds: [],
      history: [],
    };
  }

  private broadcastPatternRaceState(
    room: StoredRoom,
    requestId = crypto.randomUUID(),
  ) {
    if (!room.patternRace) return;
    this.broadcast({
      type: 'pattern_race_state',
      protocolVersion: PROTOCOL_VERSION,
      requestId,
      serverTime: Date.now(),
      state: room.patternRace,
    });
  }

  private finishPatternRace(room: StoredRoom) {
    const state = room.patternRace;
    if (!state || state.phase === 'finished') return;
    const bestScore = Math.max(0, ...Object.values(state.scores));
    state.phase = 'finished';
    state.nextProblemAt = null;
    state.deadline = null;
    state.pausedRemainingMs = null;
    state.gameWinnerIds = Object.entries(state.scores)
      .filter(([, score]) => score === bestScore)
      .map(([id]) => id);
  }

  private async handlePatternRaceCommand(
    ws: WebSocket,
    attachment: SocketAttachment,
    message: Extract<ClientMessage, { type: 'pattern_race_command' }>,
  ) {
    await this.ctx.blockConcurrencyWhile(async () => {
      const room = await this.ctx.storage.get<StoredRoom>(ROOM_STORAGE_KEY);
      const player = room?.players.find(
        (candidate) => candidate.id === attachment.playerId,
      );
      if (!room || !player) {
        this.sendCommandRejected(ws, message.requestId, 'player_not_found');
        return;
      }
      const state = room.patternRace;
      if (
        room.activeActivity !== 'pattern-race' ||
        room.activeActivityInstanceId !== message.instanceId ||
        player.selectedActivity !== 'pattern-race' ||
        !state
      ) {
        this.sendCommandRejected(ws, message.requestId, 'not_in_activity');
        return;
      }

      const now = Date.now();
      if (
        state.phase !== 'finished' &&
        state.deadline !== null &&
        state.deadline <= now
      ) {
        this.finishPatternRace(room);
        await this.ctx.storage.put(ROOM_STORAGE_KEY, room);
        await this.scheduleNextAlarm(room);
        this.broadcastPatternRaceState(room);
      }

      if (message.command.kind === 'sync') {
        this.send(ws, {
          type: 'pattern_race_state',
          protocolVersion: PROTOCOL_VERSION,
          requestId: message.requestId,
          serverTime: Date.now(),
          state,
        });
        return;
      }

      if (message.command.kind === 'return_to_setup') {
        if (state.phase !== 'finished') {
          this.sendCommandRejected(ws, message.requestId, 'game_not_playing');
          return;
        }
        room.patternRaceSettings = state.settings;
        room.activeActivity = null;
        room.activeActivityInstanceId = null;
        delete room.patternRace;
        for (const candidate of room.players) candidate.ready = false;
        room.revision += 1;
        await this.ctx.storage.put(ROOM_STORAGE_KEY, room);
        await this.scheduleNextAlarm(room);
        this.broadcastSnapshot(room);
        return;
      }

      if (state.phase === 'finished') {
        this.sendCommandRejected(ws, message.requestId, 'game_not_playing');
        return;
      }
      if (message.command.round !== state.round) {
        this.sendCommandRejected(ws, message.requestId, 'stale_round');
        return;
      }

      if (!room.players.every((candidate) => candidate.connected)) {
        this.sendCommandRejected(ws, message.requestId, 'game_not_playing');
        return;
      }
      if (message.command.kind === 'skip') {
        if (state.phase !== 'playing') {
          this.sendCommandRejected(ws, message.requestId, 'game_not_playing');
          return;
        }
        state.skipIds ??= [];
        if (!state.skipIds.includes(player.id)) state.skipIds.push(player.id);
        if (
          room.players.length === 2 &&
          room.players.every((candidate) =>
            state.skipIds.includes(candidate.id),
          )
        ) {
          state.phase = 'round_won';
          state.nextProblemAt = now + 3000;
          state.roundWinnerId = null;
          state.winningWord = null;
        }
      } else {
        if (state.phase !== 'playing') {
          this.sendCommandRejected(ws, message.requestId, 'stale_round');
          return;
        }
        const rejection = validatePatternRaceGuess(
          message.command.word,
          state.pattern,
        );
        if (rejection) {
          this.send(ws, {
            type: 'pattern_race_guess_rejected',
            protocolVersion: PROTOCOL_VERSION,
            requestId: message.requestId,
            serverTime: now,
            reason: rejection,
          });
          return;
        }
        const winningWord = normalizePatternRaceGuess(message.command.word);
        state.roundWinnerId = player.id;
        state.winningWord = winningWord;
        state.scores[player.id] = (state.scores[player.id] ?? 0) + 1;
        state.history.push({
          round: state.round,
          winnerId: player.id,
          word: winningWord,
        });
        if (
          state.settings.mode === 'problems' &&
          state.scores[player.id] >= state.settings.problemCount
        ) {
          this.finishPatternRace(room);
        } else {
          state.phase = 'round_won';
          state.nextProblemAt = now + 3000;
        }
      }

      await this.ctx.storage.put(ROOM_STORAGE_KEY, room);
      await this.scheduleNextAlarm(room);
      this.broadcastPatternRaceState(room, message.requestId);
    });
  }

  private newConvergeState(
    instanceId: string,
    settings: StoredRoom['convergeSettings'],
  ): ConvergeState {
    return {
      instanceId,
      settings: settings ?? DEFAULT_CONVERGE_SETTINGS,
      phase: 'playing',
      round: 1,
      baseWords: null,
      submittedIds: [],
      deadline: null,
      pausedRemainingMs: null,
      history: [],
      replayReadyIds: [],
      submissions: {},
    };
  }

  private broadcastConvergeState(
    room: StoredRoom,
    requestId = crypto.randomUUID(),
  ) {
    if (!room.converge) return;
    const message: ServerMessage = {
      type: 'converge_state',
      protocolVersion: PROTOCOL_VERSION,
      requestId,
      serverTime: Date.now(),
      state: publicConvergeState(room.converge),
    };
    this.broadcast(message);
  }

  private expireConvergeRound(room: StoredRoom, now: number) {
    const state = room.converge;
    if (!state || state.phase !== 'playing') return;
    state.history.push({
      round: state.round,
      words: null,
      matched: false,
      timedOut: true,
    });
    state.submissions = {};
    state.submittedIds = [];
    state.deadline = null;
    state.pausedRemainingMs = null;
    if (
      state.settings.mode === 'limited' &&
      state.round >= state.settings.maxRounds
    ) {
      state.phase = 'lost';
      return;
    }
    state.round += 1;
    state.deadline = now + state.settings.timeLimitSeconds * 1000;
  }

  private async handleConvergeCommand(
    ws: WebSocket,
    attachment: SocketAttachment,
    message: Extract<ClientMessage, { type: 'converge_command' }>,
  ) {
    await this.ctx.blockConcurrencyWhile(async () => {
      const room = await this.ctx.storage.get<StoredRoom>(ROOM_STORAGE_KEY);
      const player = room?.players.find(
        (candidate) => candidate.id === attachment.playerId,
      );
      if (!room || !player) {
        this.sendCommandRejected(ws, message.requestId, 'player_not_found');
        return;
      }
      const state = room.converge;
      if (
        room.activeActivity !== 'converge' ||
        room.activeActivityInstanceId !== message.instanceId ||
        player.selectedActivity !== 'converge' ||
        !state
      ) {
        this.sendCommandRejected(ws, message.requestId, 'not_in_activity');
        return;
      }
      if (message.command.kind === 'sync') {
        this.send(ws, {
          type: 'converge_state',
          protocolVersion: PROTOCOL_VERSION,
          requestId: message.requestId,
          serverTime: Date.now(),
          state: publicConvergeState(state),
        });
        return;
      }
      if (message.command.kind === 'return_to_setup') {
        if (state.phase === 'playing') {
          this.sendCommandRejected(ws, message.requestId, 'game_not_playing');
          return;
        }
        room.convergeSettings = state.settings;
        room.activeActivity = null;
        room.activeActivityInstanceId = null;
        delete room.converge;
        for (const candidate of room.players) candidate.ready = false;
        room.revision += 1;
        await this.ctx.storage.put(ROOM_STORAGE_KEY, room);
        await this.scheduleNextAlarm(room);
        this.broadcastSnapshot(room);
        return;
      } else {
        if (state.phase !== 'playing') {
          this.sendCommandRejected(ws, message.requestId, 'game_not_playing');
          return;
        }
        const now = Date.now();
        if (state.deadline !== null && state.deadline <= now) {
          this.expireConvergeRound(room, now);
          this.sendCommandRejected(ws, message.requestId, 'stale_round');
        } else if (message.command.round !== state.round) {
          this.sendCommandRejected(ws, message.requestId, 'stale_round');
          return;
        } else if (state.submissions[player.id]) {
          this.sendCommandRejected(ws, message.requestId, 'already_submitted');
          return;
        } else {
          state.submissions[player.id] = message.command.word;
          state.submittedIds = Object.keys(state.submissions);
          if (
            room.players.every((candidate) => state.submissions[candidate.id])
          ) {
            const words = room.players.map(
              (candidate) => state.submissions[candidate.id],
            ) as [string, string];
            const matched = convergeWordsMatch(words[0], words[1]);
            state.history.push({
              round: state.round,
              words,
              matched,
              timedOut: false,
            });
            state.submissions = {};
            state.submittedIds = [];
            state.deadline = null;
            if (matched) state.phase = 'won';
            else if (
              state.settings.mode === 'limited' &&
              state.round >= state.settings.maxRounds
            )
              state.phase = 'lost';
            else {
              state.baseWords = words;
              state.round += 1;
              state.deadline = now + state.settings.timeLimitSeconds * 1000;
            }
          }
        }
      }
      await this.ctx.storage.put(ROOM_STORAGE_KEY, room);
      await this.scheduleNextAlarm(room);
      this.broadcastConvergeState(room, message.requestId);
    });
  }

  private async handleBoothCommand(
    ws: WebSocket,
    attachment: SocketAttachment,
    message: Extract<ClientMessage, { type: 'booth_command' }>,
  ) {
    await this.ctx.blockConcurrencyWhile(async () => {
      const room = await this.ctx.storage.get<StoredRoom>(ROOM_STORAGE_KEY);
      const player = room?.players.find(
        (p) =>
          p.id === attachment.playerId &&
          p.activeConnectionId === attachment.connectionId,
      );
      if (
        !room ||
        !player ||
        room.activeActivity !== 'photo-booth' ||
        room.activeActivityInstanceId !== message.instanceId ||
        player.selectedActivity !== 'photo-booth'
      ) {
        this.sendCommandRejected(ws, message.requestId, 'not_in_activity');
        return;
      }
      const state =
        room.booth?.instanceId === message.instanceId
          ? room.booth
          : {
              instanceId: message.instanceId,
              frame: 'classic' as const,
              countdownSeconds: room.boothCountdownSeconds ?? 10,
              leftId: room.players[0].id,
              readyIds: [],
              takeId: null,
              startsAt: null,
              autoStartAt: null,
            };
      const command = message.command;
      if (command.kind === 'signal') {
        const target = room.players.find(
          (p) =>
            p.id === command.targetId &&
            p.id !== player.id &&
            p.selectedActivity === 'photo-booth',
        );
        if (!target) return;
        for (const socket of this.ctx.getWebSockets()) {
          const a = this.getAttachment(socket);
          if (
            a?.authenticated &&
            a.playerId === target.id &&
            a.connectionId === target.activeConnectionId
          )
            this.send(socket, {
              type: 'booth_signal',
              protocolVersion: PROTOCOL_VERSION,
              serverTime: Date.now(),
              instanceId: message.instanceId,
              fromId: player.id,
              signal: command.signal,
            });
        }
        return;
      }
      const capturing =
        state.startsAt !== null &&
        Date.now() < state.startsAt + takeDuration(state.countdownSeconds);
      if (command.kind === 'sync') {
        // A new camera connection invalidates consent and any unfinished take.
        state.readyIds = [];
        if (capturing) {
          state.takeId = null;
          state.startsAt = null;
        }
        const iceServers: RTCIceServer[] = [
          { urls: 'stun:stun.l.google.com:19302' },
        ];
        if (this.env.TURN_URLS && this.env.TURN_SHARED_SECRET) {
          const username = `${Math.floor(Date.now() / 1000) + 3600}:${player.id}`;
          const key = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(this.env.TURN_SHARED_SECRET),
            { name: 'HMAC', hash: 'SHA-1' },
            false,
            ['sign'],
          );
          const signature = new Uint8Array(
            await crypto.subtle.sign(
              'HMAC',
              key,
              new TextEncoder().encode(username),
            ),
          );
          iceServers.push({
            urls: this.env.TURN_URLS.split(',').map((u) => u.trim()),
            username,
            credential: btoa(String.fromCharCode(...signature)),
          });
        }
        this.send(ws, {
          type: 'booth_ice',
          protocolVersion: PROTOCOL_VERSION,
          serverTime: Date.now(),
          iceServers,
        });
      } else if (command.kind === 'reset') {
        state.takeId = null;
        state.startsAt = null;
        state.readyIds = [];
      } else if (command.kind === 'ready' && !capturing) {
        state.readyIds = state.readyIds.filter((id) => id !== player.id);
        if (command.ready) state.readyIds.push(player.id);
      } else if (command.kind === 'frame' && !capturing) {
        state.frame = command.frame;
      } else if (command.kind === 'swap' && !state.takeId) {
        state.leftId =
          room.players.find((p) => p.id !== state.leftId)?.id ?? state.leftId;
        state.readyIds = [];
      } else if (
        command.kind === 'start' &&
        !state.takeId &&
        room.players.length === 2 &&
        room.players.every((p) => p.connected && state.readyIds.includes(p.id))
      ) {
        room.booth = state;
        this.startBoothTake(room, Date.now());
      }
      const bothReady =
        room.players.length === 2 &&
        room.players.every((p) => p.connected && state.readyIds.includes(p.id));
      if (!state.takeId && bothReady)
        state.autoStartAt ??= Date.now() + AUTO_START_MS;
      else state.autoStartAt = null;
      room.booth = state;
      await this.ctx.storage.put(ROOM_STORAGE_KEY, room);
      await this.scheduleNextAlarm(room);
      this.broadcast({
        type: 'booth_state',
        protocolVersion: PROTOCOL_VERSION,
        requestId: message.requestId,
        serverTime: Date.now(),
        state,
      });
    });
  }

  private startBoothTake(room: StoredRoom, now: number) {
    const state = room.booth;
    if (
      !state ||
      state.takeId ||
      room.activeActivity !== 'photo-booth' ||
      room.activeActivityInstanceId !== state.instanceId ||
      room.players.length !== 2 ||
      !room.players.every(
        (p) =>
          p.connected &&
          p.selectedActivity === 'photo-booth' &&
          state.readyIds.includes(p.id),
      )
    )
      return;
    state.takeId = crypto.randomUUID();
    state.startsAt = now + 1000;
    state.autoStartAt = null;
  }

  private broadcast(message: ServerMessage) {
    for (const socket of this.ctx.getWebSockets()) {
      if (this.getAttachment(socket)?.authenticated) this.send(socket, message);
    }
  }

  private newColorPickerState(
    instanceId: string,
    settings: NonNullable<StoredRoom['colorPickerSettings']>,
    playerIds: string[],
  ): ColorPickerState {
    return {
      instanceId,
      settings,
      playerIds,
      phase: 'memorize',
      round: 1,
      target: randomTarget(),
      deadline: Date.now() + settings.memorizeSeconds * 1000,
      guesses: {},
      drafts: Object.fromEntries(playerIds.map((id) => [id, { r: 255, g: 255, b: 255 }])),
      totals: Object.fromEntries(playerIds.map((id) => [id, 0])),
      history: [],
      readyIds: [],
    };
  }

  private finishColorPickerRound(state: ColorPickerState) {
    for (const id of state.playerIds) state.guesses[id] ??= state.drafts[id] ?? { r: 255, g: 255, b: 255 };
    const scores = Object.fromEntries(state.playerIds.map((id) => [id, colorScore(state.target, state.guesses[id])]));
    for (const id of state.playerIds) state.totals[id] = Math.round(((state.totals[id] ?? 0) + scores[id]) * 10) / 10;
    const [left, right] = state.playerIds;
    const winnerId = scores[left] === scores[right] ? null : scores[left] > scores[right] ? left : right;
    state.history.push({ round: state.round, target: state.target, guesses: { ...state.guesses }, scores, winnerId });
    state.phase = state.round >= state.settings.rounds ? 'finished' : 'reveal';
    state.deadline = state.phase === 'reveal' ? Date.now() + 5000 : null;
    state.readyIds = [];
  }

  private advanceColorPicker(room: StoredRoom, now: number) {
    const state = room.colorPicker;
    if (!state) return;
    if (state.phase === 'memorize') {
      state.phase = 'pick';
      state.deadline = now + state.settings.pickSeconds * 1000;
    } else if (state.phase === 'pick') this.finishColorPickerRound(state);
    else if (state.phase === 'reveal') {
      state.round += 1;
      state.phase = 'memorize';
      state.target = randomTarget();
      state.guesses = {};
      state.drafts = Object.fromEntries(state.playerIds.map((id) => [id, { r: 255, g: 255, b: 255 }]));
      state.readyIds = [];
      state.deadline = now + state.settings.memorizeSeconds * 1000;
    }
  }

  private broadcastColorPickerState(room: StoredRoom, requestId = crypto.randomUUID()) {
    if (!room.colorPicker) return;
    this.broadcast({ type: 'color_picker_state', protocolVersion: PROTOCOL_VERSION, requestId, serverTime: Date.now(), state: publicColorPickerState(room.colorPicker) });
  }

  private async handleColorPickerCommand(
    ws: WebSocket,
    attachment: SocketAttachment,
    message: Extract<ClientMessage, { type: 'color_picker_command' }>,
  ) {
    await this.ctx.blockConcurrencyWhile(async () => {
      const room = await this.ctx.storage.get<StoredRoom>(ROOM_STORAGE_KEY);
      const state = room?.colorPicker;
      const player = room?.players.find((candidate) => candidate.id === attachment.playerId);
      if (!room || !state || !player || room.activeActivity !== 'color-picker' || message.instanceId !== state.instanceId) {
        this.sendCommandRejected(ws, message.requestId, 'not_in_activity');
        return;
      }
      if (message.command.kind === 'sync') {
        this.send(ws, { type: 'color_picker_state', protocolVersion: PROTOCOL_VERSION, requestId: message.requestId, serverTime: Date.now(), state: publicColorPickerState(state) });
        return;
      }
      if (message.command.kind === 'return_to_setup') {
        for (const candidate of room.players) candidate.ready = false;
        room.colorPickerSettings = state.settings;
        delete room.colorPicker;
        room.activeActivity = null;
        room.activeActivityInstanceId = null;
        room.revision += 1;
      } else if (message.command.kind === 'submit' || message.command.kind === 'preview') {
        if (state.phase !== 'pick') return this.sendCommandRejected(ws, message.requestId, 'game_not_playing');
        if (message.command.round !== state.round) return this.sendCommandRejected(ws, message.requestId, 'stale_round');
        if (state.guesses[player.id]) return this.sendCommandRejected(ws, message.requestId, 'already_submitted');
        state.drafts[player.id] = message.command.color;
        if (message.command.kind === 'preview') {
          await this.ctx.storage.put(ROOM_STORAGE_KEY, room);
          return;
        }
        state.guesses[player.id] = message.command.color;
        if (state.playerIds.every((id) => state.guesses[id])) this.finishColorPickerRound(state);
      } else {
        if (state.phase !== 'reveal') return this.sendCommandRejected(ws, message.requestId, 'game_not_playing');
        if (!state.readyIds.includes(player.id)) state.readyIds.push(player.id);
        if (state.playerIds.every((id) => state.readyIds.includes(id))) {
          state.round += 1;
          state.phase = 'memorize';
          state.target = randomTarget();
          state.guesses = {};
          state.drafts = Object.fromEntries(state.playerIds.map((id) => [id, { r: 255, g: 255, b: 255 }]));
          state.readyIds = [];
          state.deadline = Date.now() + state.settings.memorizeSeconds * 1000;
        }
      }
      await this.ctx.storage.put(ROOM_STORAGE_KEY, room);
      await this.scheduleNextAlarm(room);
      this.broadcastSnapshot(room);
      this.broadcastColorPickerState(room, message.requestId);
    });
  }

  private sendCommandRejected(
    ws: WebSocket,
    requestId: string,
    reason: Extract<ServerMessage, { type: 'command_rejected' }>['reason'],
  ) {
    this.send(ws, {
      type: 'command_rejected',
      protocolVersion: PROTOCOL_VERSION,
      serverTime: Date.now(),
      requestId,
      reason,
    });
  }

  private sendProtocolError(
    ws: WebSocket,
    code: Extract<ServerMessage, { type: 'protocol_error' }>['code'],
    message: string,
  ) {
    this.send(ws, {
      type: 'protocol_error',
      protocolVersion: PROTOCOL_VERSION,
      serverTime: Date.now(),
      code,
      message,
    });
  }

  private send(ws: WebSocket, message: ServerMessage) {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // Disconnect/error callbacks reconcile persisted connection state.
    }
  }

  private getAttachment(ws: WebSocket): SocketAttachment | null {
    return (ws.deserializeAttachment() as SocketAttachment | null) ?? null;
  }
}
