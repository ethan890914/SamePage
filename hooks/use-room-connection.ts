'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PROTOCOL_VERSION,
  type ActivityId,
  type AvatarId,
  type ClientMessage,
  type PlayerView,
  type ServerMessage,
} from '@/lib/protocol';

const SESSION_STORAGE_KEY = 'same-page.room-session.v1';
const REALTIME_URL =
  process.env.NEXT_PUBLIC_REALTIME_URL ?? 'ws://localhost:8787';

export type ConnectionStatus =
  | 'idle'
  | 'creating'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error'
  | 'expired';

type StoredSession = {
  roomCode: string;
  sessionToken: string;
  name: string;
  avatarId: AvatarId;
};

type ConnectionCredentials = StoredSession & {
  mode: 'join' | 'reconnect';
  password?: string;
};

const rejectionMessages: Record<string, string> = {
  bad_password: 'That room password is incorrect.',
  room_full: 'That arcade already has two players.',
  rate_limited: 'Too many attempts. Wait a moment and try again.',
  invalid_message: 'The connection request was invalid.',
  room_not_found: 'That arcade could not be found.',
  session_expired: 'Your saved place in this arcade has expired.',
};

function requestId() {
  return crypto.randomUUID();
}

function sessionToken() {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll('-', '_');
}

function normalizeRoomCode(value: string) {
  return value.trim().toUpperCase();
}

function apiUrl(path: string) {
  const url = new URL(REALTIME_URL);
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
  url.pathname = path;
  url.search = '';
  url.hash = '';
  return url.toString();
}

function socketUrl(roomCode: string) {
  const url = new URL(REALTIME_URL);
  url.protocol =
    url.protocol === 'https:'
      ? 'wss:'
      : url.protocol === 'http:'
        ? 'ws:'
        : url.protocol;
  url.pathname = `/api/rooms/${encodeURIComponent(roomCode)}/socket`;
  url.search = '';
  url.hash = '';
  return url.toString();
}

function readStoredSession(): StoredSession | null {
  try {
    const value = JSON.parse(
      localStorage.getItem(SESSION_STORAGE_KEY) ?? 'null',
    ) as Partial<StoredSession> | null;
    return value &&
      typeof value.roomCode === 'string' &&
      typeof value.sessionToken === 'string' &&
      typeof value.name === 'string'
      ? {
          roomCode: value.roomCode,
          sessionToken: value.sessionToken,
          name: value.name,
          avatarId: value.avatarId ?? 'avatar-1',
        }
      : null;
  } catch {
    return null;
  }
}

export function useRoomConnection() {
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [players, setPlayers] = useState<PlayerView[]>([]);
  const [activeActivity, setActiveActivity] = useState<ActivityId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const credentialsRef = useRef<ConnectionCredentials | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const heartbeatTimerRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const revisionRef = useRef(0);
  const deliberateCloseRef = useRef(false);
  const terminalCloseRef = useRef(false);
  const mountedRef = useRef(false);
  const connectRef = useRef<() => void>(() => undefined);

  const clearTimers = useCallback(() => {
    if (reconnectTimerRef.current !== null)
      window.clearTimeout(reconnectTimerRef.current);
    if (heartbeatTimerRef.current !== null)
      window.clearInterval(heartbeatTimerRef.current);
    reconnectTimerRef.current = null;
    heartbeatTimerRef.current = null;
  }, []);

  const openSocket = useCallback(
    (credentials: ConnectionCredentials, reconnecting = false) => {
      clearTimers();
      credentialsRef.current = credentials;
      deliberateCloseRef.current = false;
      terminalCloseRef.current = false;
      setError(null);
      setRoomCode(credentials.roomCode);
      setStatus(reconnecting ? 'reconnecting' : 'connecting');

      const socket = new WebSocket(socketUrl(credentials.roomCode));
      socketRef.current = socket;

      socket.addEventListener('open', () => {
        const message: ClientMessage =
          credentials.mode === 'join'
            ? {
                type: 'join_room',
                protocolVersion: PROTOCOL_VERSION,
                requestId: requestId(),
                sessionToken: credentials.sessionToken,
                name: credentials.name,
                avatarId: credentials.avatarId,
                password: credentials.password ?? '',
              }
            : {
                type: 'reconnect',
                protocolVersion: PROTOCOL_VERSION,
                requestId: requestId(),
                sessionToken: credentials.sessionToken,
              };
        socket.send(JSON.stringify(message));
      });

      socket.addEventListener('message', (event) => {
        let message: ServerMessage;
        try {
          message = JSON.parse(String(event.data)) as ServerMessage;
        } catch {
          return;
        }

        if (message.type === 'join_rejected') {
          terminalCloseRef.current = true;
          setError(
            rejectionMessages[message.reason] ?? 'Could not join this arcade.',
          );
          if (message.reason === 'session_expired') {
            localStorage.removeItem(SESSION_STORAGE_KEY);
            credentialsRef.current = null;
            setSelfId(null);
            setPlayers([]);
            setActiveActivity(null);
            setRoomCode(null);
            setStatus('expired');
          } else {
            setRoomCode(null);
            setStatus('error');
          }
          return;
        }

        if (message.type === 'protocol_error') {
          setError(message.message);
          return;
        }

        if (
          message.type === 'join_accepted' ||
          message.type === 'reconnect_accepted'
        ) {
          revisionRef.current = message.revision;
          reconnectAttemptsRef.current = 0;
          setRoomCode(message.roomCode);
          setSelfId(message.selfId);
          setPlayers(message.players);
          setStatus('connected');
          const stored: StoredSession = {
            roomCode: message.roomCode,
            sessionToken: credentials.sessionToken,
            name: credentials.name,
            avatarId: credentials.avatarId,
          };
          localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(stored));
          credentialsRef.current = { ...stored, mode: 'reconnect' };
          heartbeatTimerRef.current = window.setInterval(() => {
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(
                JSON.stringify({
                  type: 'heartbeat',
                  protocolVersion: PROTOCOL_VERSION,
                } satisfies ClientMessage),
              );
            }
          }, 20_000);
          return;
        }

        if (
          message.type === 'room_snapshot' &&
          message.revision >= revisionRef.current
        ) {
          revisionRef.current = message.revision;
          setPlayers(message.players);
          setActiveActivity(message.activeActivity);
          return;
        }

        if (message.type === 'activity_started') {
          revisionRef.current = Math.max(revisionRef.current, message.revision);
          setActiveActivity(message.activityId);
          return;
        }

        if (message.type === 'command_rejected') {
          setError(
            message.reason === 'not_in_activity'
              ? 'Choose that activity before changing your ready state.'
              : message.reason === 'activity_already_started'
                ? 'An activity has already started in this arcade.'
                : 'Your player session is no longer available.',
          );
        }
      });

      socket.addEventListener('close', () => {
        if (socketRef.current !== socket) return;
        socketRef.current = null;
        if (heartbeatTimerRef.current !== null)
          window.clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
        if (
          !mountedRef.current ||
          deliberateCloseRef.current ||
          terminalCloseRef.current
        )
          return;

        const nextCredentials = credentialsRef.current;
        if (!nextCredentials || nextCredentials.mode !== 'reconnect') {
          setStatus('error');
          setRoomCode(null);
          setError(
            (current) =>
              current ?? 'The arcade connection closed before you joined.',
          );
          return;
        }

        setStatus('reconnecting');
        const delay =
          Math.min(10_000, 500 * 2 ** reconnectAttemptsRef.current) +
          Math.floor(Math.random() * 250);
        reconnectAttemptsRef.current += 1;
        reconnectTimerRef.current = window.setTimeout(
          () => connectRef.current(),
          delay,
        );
      });

      socket.addEventListener('error', () => {
        if (
          socketRef.current === socket &&
          socket.readyState !== WebSocket.OPEN
        ) {
          setError('Could not reach the realtime service.');
        }
      });
    },
    [clearTimers],
  );

  useEffect(() => {
    mountedRef.current = true;
    connectRef.current = () => {
      const credentials = credentialsRef.current;
      if (credentials && mountedRef.current) openSocket(credentials, true);
    };
    const restoreTimer = window.setTimeout(() => {
      const stored = readStoredSession();
      if (stored && mountedRef.current)
        openSocket({ ...stored, mode: 'reconnect' }, true);
    }, 0);
    return () => {
      mountedRef.current = false;
      deliberateCloseRef.current = true;
      window.clearTimeout(restoreTimer);
      clearTimers();
      socketRef.current?.close(1000, 'Page closed');
      socketRef.current = null;
    };
  }, [clearTimers, openSocket]);

  const createRoom = useCallback(
    async (name: string, avatarId: AvatarId, password: string) => {
      deliberateCloseRef.current = true;
      socketRef.current?.close(1000, 'Starting another room');
      clearTimers();
      setStatus('creating');
      setError(null);
      const token = sessionToken();
      const payload = {
        protocolVersion: PROTOCOL_VERSION,
        requestId: requestId(),
        sessionToken: token,
        name: name.trim(),
        avatarId,
        password,
      };
      try {
        const response = await fetch(apiUrl('/api/rooms'), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const result = (await response.json()) as {
          roomCode?: string;
          error?: { message?: string };
        };
        if (!response.ok || !result.roomCode)
          throw new Error(
            result.error?.message ?? 'Could not create the arcade.',
          );
        localStorage.setItem('same-page.display-name', payload.name);
        openSocket({
          roomCode: result.roomCode,
          sessionToken: token,
          name: payload.name,
          avatarId: payload.avatarId,
          mode: 'reconnect',
        });
      } catch (cause) {
        setStatus('error');
        setRoomCode(null);
        setError(
          cause instanceof Error
            ? cause.message
            : 'Could not create the arcade.',
        );
      }
    },
    [clearTimers, openSocket],
  );

  const joinRoom = useCallback(
    (code: string, name: string, avatarId: AvatarId, password: string) => {
      deliberateCloseRef.current = true;
      socketRef.current?.close(1000, 'Joining another room');
      clearTimers();
      const normalizedName = name.trim();
      localStorage.setItem('same-page.display-name', normalizedName);
      openSocket({
        roomCode: normalizeRoomCode(code),
        sessionToken: sessionToken(),
        name: normalizedName,
        avatarId,
        password,
        mode: 'join',
      });
    },
    [clearTimers, openSocket],
  );

  const leaveRoom = useCallback(() => {
    deliberateCloseRef.current = true;
    clearTimers();
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type: 'leave_room',
          protocolVersion: PROTOCOL_VERSION,
          requestId: requestId(),
        } satisfies ClientMessage),
      );
      socketRef.current.close(1000, 'Left room');
    }
    socketRef.current = null;
    credentialsRef.current = null;
    localStorage.removeItem(SESSION_STORAGE_KEY);
    revisionRef.current = 0;
    setRoomCode(null);
    setSelfId(null);
    setPlayers([]);
    setActiveActivity(null);
    setError(null);
    setStatus('idle');
  }, [clearTimers]);

  const sendActivityCommand = useCallback(
    (
      command:
        | { type: 'select_activity'; activityId: ActivityId }
        | { type: 'set_ready'; activityId: ActivityId; ready: boolean }
        | { type: 'exit_activity'; activityId: ActivityId },
    ) => {
      const socket = socketRef.current;
      if (socket?.readyState !== WebSocket.OPEN || status !== 'connected') {
        setError('Reconnect before changing activities.');
        return;
      }
      socket.send(
        JSON.stringify({
          ...command,
          protocolVersion: PROTOCOL_VERSION,
          requestId: requestId(),
        } satisfies ClientMessage),
      );
    },
    [status],
  );

  return {
    status,
    roomCode,
    selfId,
    players,
    activeActivity,
    error,
    createRoom,
    joinRoom,
    leaveRoom,
    selectActivity: (activityId: ActivityId) =>
      sendActivityCommand({ type: 'select_activity', activityId }),
    setReady: (activityId: ActivityId, ready: boolean) =>
      sendActivityCommand({ type: 'set_ready', activityId, ready }),
    exitActivity: (activityId: ActivityId) =>
      sendActivityCommand({ type: 'exit_activity', activityId }),
    clearError: () => setError(null),
  };
}
