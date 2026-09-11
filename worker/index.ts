import {
  PROTOCOL_VERSION,
  parseCreateRoomRequest,
  type CreateRoomResponse,
} from '../lib/protocol';
import { ArcadeRoom } from './arcade-room';
import type { Env } from './env';
import { errorResponse, jsonResponse } from './http';

export { ArcadeRoom };

const ROOM_CODE_PATTERN = /^[A-Z2-9]{4}-[A-Z2-9]{4}$/;
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_CREATE_BODY_BYTES = 1024;
const DEFAULT_LOCAL_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
];

function getRoomSocketCode(url: URL) {
  const match = /^\/api\/rooms\/([^/]+)\/socket$/.exec(url.pathname);
  if (!match) return null;
  const roomCode = decodeURIComponent(match[1]).trim().toUpperCase();
  return ROOM_CODE_PATTERN.test(roomCode) ? roomCode : null;
}

function allowedOrigins(env: Env) {
  return env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
    : DEFAULT_LOCAL_ORIGINS;
}

function requestOrigin(request: Request) {
  return request.headers.get('origin');
}

function originAllowed(request: Request, env: Env) {
  const origin = requestOrigin(request);
  return origin === null || allowedOrigins(env).includes(origin);
}

function addCors(response: Response, request: Request, env: Env) {
  const origin = requestOrigin(request);
  if (!origin || !allowedOrigins(env).includes(origin)) return response;
  const headers = new Headers(response.headers);
  headers.set('access-control-allow-origin', origin);
  headers.set('access-control-allow-credentials', 'true');
  headers.set('access-control-allow-methods', 'POST, OPTIONS');
  headers.set('access-control-allow-headers', 'content-type');
  headers.set('vary', 'Origin');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function roomCodeFor(
  requestId: string,
  sessionToken: string,
  attempt: number,
) {
  const input = new TextEncoder().encode(
    `${requestId}\u0000${sessionToken}\u0000${attempt}`,
  );
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', input));
  const characters = Array.from(
    bytes.slice(0, 8),
    (byte) => ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length],
  );
  return `${characters.slice(0, 4).join('')}-${characters.slice(4).join('')}`;
}

async function createRoom(request: Request, env: Env) {
  if (!originAllowed(request, env))
    return errorResponse(
      403,
      'origin_not_allowed',
      'Request origin is not allowed.',
    );
  if (!env.ROOM_PASSWORD_PEPPER)
    return errorResponse(
      503,
      'server_not_configured',
      'Room authentication is not configured.',
    );

  const clientIp =
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown';
  const rateLimit = await env.ROOM_CREATION_RATE_LIMITER.limit({
    key: clientIp,
  });
  if (!rateLimit.success) {
    return errorResponse(
      429,
      'rate_limited',
      'Too many rooms were created. Wait a minute and try again.',
    );
  }

  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_CREATE_BODY_BYTES)
    return errorResponse(
      413,
      'request_too_large',
      'Room creation payload is too large.',
    );

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_CREATE_BODY_BYTES)
    return errorResponse(
      413,
      'request_too_large',
      'Room creation payload is too large.',
    );

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return errorResponse(
      400,
      'invalid_json',
      'Expected a JSON room creation request.',
    );
  }
  const parsed = parseCreateRoomRequest(value);
  if (!parsed.success)
    return errorResponse(400, parsed.error, 'Invalid room creation request.');

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const roomCode = await roomCodeFor(
      parsed.data.requestId,
      parsed.data.sessionToken,
      attempt,
    );
    const room = env.ARCADE_ROOMS.getByName(roomCode);
    const response = await room.fetch(
      'https://room.internal/internal/initialize',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ roomCode, creator: parsed.data }),
      },
    );

    if (response.ok) {
      const result = (await response.json()) as CreateRoomResponse;
      return jsonResponse(result, { status: response.status });
    }
    if (response.status !== 409) return response;
  }

  return errorResponse(
    503,
    'room_creation_failed',
    'Could not allocate a room code. Please retry.',
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/api/health') {
      return jsonResponse({
        ok: true,
        service: 'same-page-realtime',
        protocolVersion: PROTOCOL_VERSION,
      });
    }

    if (url.pathname === '/api/rooms' && request.method === 'OPTIONS') {
      const response = originAllowed(request, env)
        ? new Response(null, { status: 204 })
        : errorResponse(
            403,
            'origin_not_allowed',
            'Request origin is not allowed.',
          );
      return addCors(response, request, env);
    }

    if (request.method === 'POST' && url.pathname === '/api/rooms') {
      return addCors(await createRoom(request, env), request, env);
    }

    if (request.method === 'GET') {
      const roomCode = getRoomSocketCode(url);
      if (roomCode) {
        if (!originAllowed(request, env))
          return errorResponse(
            403,
            'origin_not_allowed',
            'Request origin is not allowed.',
          );
        if (!env.ROOM_PASSWORD_PEPPER)
          return errorResponse(
            503,
            'server_not_configured',
            'Room authentication is not configured.',
          );
        return env.ARCADE_ROOMS.getByName(roomCode).fetch(request);
      }
    }

    return errorResponse(404, 'not_found', 'Realtime endpoint not found.');
  },
} satisfies ExportedHandler<Env>;
