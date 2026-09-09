import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { patternRaceWords } from '../lib/pattern-race.ts';

const port = 8791;
const httpBase = `http://127.0.0.1:${port}`;
const wsBase = `ws://127.0.0.1:${port}`;
const stateDirectory = await mkdtemp(join(tmpdir(), 'same-page-pattern-race-'));
const worker = spawn(
  './node_modules/.bin/wrangler',
  [
    'dev',
    '--config',
    'wrangler.realtime.jsonc',
    '--port',
    String(port),
    '--persist-to',
    stateDirectory,
    '--var',
    'ROOM_PASSWORD_PEPPER:pattern-race-smoke-pepper',
    '--var',
    'ALLOWED_ORIGINS:http://localhost:3000',
    '--log-level',
    'error',
    '--show-interactive-dev-session=false',
  ],
  {
    env: {
      ...process.env,
      WRANGLER_WRITE_LOGS: 'false',
      WRANGLER_LOG_PATH: '.wrangler/logs',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);

let workerOutput = '';
worker.stdout.on('data', (chunk) => (workerOutput += chunk));
worker.stderr.on('data', (chunk) => (workerOutput += chunk));
const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function waitForMessage(socket, predicate, timeoutMs = 5_000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.removeEventListener('message', onMessage);
      reject(new Error(`Timed out waiting for a message.\n${workerOutput}`));
    }, timeoutMs);
    function onMessage(event) {
      const message = JSON.parse(String(event.data));
      if (!predicate(message)) return;
      clearTimeout(timeout);
      socket.removeEventListener('message', onMessage);
      resolve(message);
    }
    socket.addEventListener('message', onMessage);
  });
}

function command(type, fields = {}) {
  return {
    type,
    protocolVersion: 1,
    requestId: crypto.randomUUID(),
    ...fields,
  };
}

function token() {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll('-', '_');
}

async function connect(roomCode, message) {
  const socket = new WebSocket(`${wsBase}/api/rooms/${roomCode}/socket`);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  const accepted = waitForMessage(socket, (value) =>
    ['join_accepted', 'reconnect_accepted'].includes(value.type),
  );
  socket.send(JSON.stringify(message));
  return { socket, accepted: await accepted };
}

async function sendAndWait(socket, payload, predicate) {
  const response = waitForMessage(socket, predicate);
  socket.send(JSON.stringify(payload));
  return response;
}

function validWord(pattern) {
  return patternRaceWords.find(
    (word) =>
      word.startsWith(pattern.firstLetter.toLowerCase()) &&
      word.endsWith(pattern.lastLetter.toLowerCase()) &&
      (pattern.length === null || word.length === pattern.length),
  );
}

try {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      if ((await fetch(`${httpBase}/api/health`)).ok) break;
    } catch {}
    if (attempt === 59)
      throw new Error(`Worker did not start.\n${workerOutput}`);
    await wait(100);
  }

  const firstToken = token();
  const createRequest = {
    protocolVersion: 1,
    requestId: crypto.randomUUID(),
    sessionToken: firstToken,
    name: 'First',
    avatarId: 'avatar-1',
    password: 'pattern-race-password',
  };
  const response = await fetch(`${httpBase}/api/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(createRequest),
  });
  const room = await response.json();
  const first = await connect(
    room.roomCode,
    command('reconnect', { sessionToken: firstToken }),
  );
  const second = await connect(
    room.roomCode,
    command('join_room', {
      sessionToken: token(),
      name: 'Second',
      avatarId: 'avatar-2',
      password: 'pattern-race-password',
    }),
  );

  for (const participant of [first, second]) {
    await sendAndWait(
      participant.socket,
      command('select_activity', { activityId: 'pattern-race' }),
      (message) =>
        message.type === 'room_snapshot' &&
        message.players.some(
          (player) =>
            player.id === participant.accepted.selfId &&
            player.selectedActivity === 'pattern-race',
        ),
    );
  }
  await sendAndWait(
    first.socket,
    command('set_pattern_race_settings', {
      activityId: 'pattern-race',
      settings: {
        mode: 'problems',
        timeLimitMinutes: 3,
        problemCount: 3,
        wordLengthMode: 'limited',
      },
    }),
    (message) =>
      message.type === 'room_snapshot' &&
      message.patternRaceSettings?.problemCount === 3,
  );
  await sendAndWait(
    first.socket,
    command('set_ready', { activityId: 'pattern-race', ready: true }),
    (message) =>
      message.type === 'room_snapshot' &&
      message.players.find((player) => player.id === first.accepted.selfId)
        ?.ready,
  );
  const started = waitForMessage(
    first.socket,
    (message) =>
      message.type === 'activity_started' &&
      message.activityId === 'pattern-race',
  );
  second.socket.send(
    JSON.stringify(
      command('set_ready', { activityId: 'pattern-race', ready: true }),
    ),
  );
  const { activityInstanceId } = await started;

  async function raceCommand(socket, value, type = 'pattern_race_state') {
    const payload = command('pattern_race_command', {
      instanceId: activityInstanceId,
      command: value,
    });
    return sendAndWait(
      socket,
      payload,
      (message) =>
        message.type === type && message.requestId === payload.requestId,
    );
  }

  let current = (await raceCommand(first.socket, { kind: 'sync' })).state;
  if (current.pattern.length === null)
    throw new Error('Limited mode did not include a word length');
  const rejected = await raceCommand(
    first.socket,
    {
      kind: 'submit',
      round: current.round,
      word: `${current.pattern.firstLetter === 'A' ? 'b' : 'a'}${'x'.repeat(current.pattern.length - 2)}${current.pattern.lastLetter}`,
    },
    'pattern_race_guess_rejected',
  );
  if (rejected.reason !== 'pattern_mismatch')
    throw new Error('Invalid pattern was not rejected privately');

  const firstSkip = (
    await raceCommand(first.socket, { kind: 'skip', round: current.round })
  ).state;
  const duplicateSkip = (
    await raceCommand(first.socket, { kind: 'skip', round: current.round })
  ).state;
  if (firstSkip.phase !== 'playing' || duplicateSkip.skipIds.length !== 1)
    throw new Error('One player or duplicate votes skipped a problem');
  const skipped = (
    await raceCommand(second.socket, { kind: 'skip', round: current.round })
  ).state;
  if (
    skipped.phase !== 'round_won' ||
    skipped.history.length !== 0 ||
    Object.values(skipped.scores).some(Boolean)
  )
    throw new Error('Mutual skip did not preserve scores');
  current = (
    await waitForMessage(
      first.socket,
      (message) =>
        message.type === 'pattern_race_state' &&
        message.state.round === 2 &&
        message.state.phase === 'playing',
    )
  ).state;
  if (current.skipIds.length)
    throw new Error('Skip votes survived the next problem');
  const seenPatterns = new Set(current.usedPatterns);
  for (let point = 1; point <= 5; point += 1) {
    const round = current.round;
    const answer = validWord(current.pattern);
    if (!answer) throw new Error('Server generated an unsolvable pattern');
    const won = await raceCommand(point % 2 ? first.socket : second.socket, {
      kind: 'submit',
      round,
      word: answer,
    });
    current = won.state;
    if (current.scores[first.accepted.selfId] !== Math.ceil(point / 2))
      throw new Error('The first valid answer did not score exactly once');
    if (point < 5) {
      if (current.phase === 'finished')
        throw new Error('Ended before a player reached three points');
      const stale = await raceCommand(
        second.socket,
        { kind: 'submit', round, word: answer },
        'command_rejected',
      );
      if (stale.reason !== 'stale_round')
        throw new Error('Late answer was not rejected');
      if (current.nextProblemAt < Date.now() + 2000)
        throw new Error('Missing three-second countdown');
      current = (
        await waitForMessage(
          first.socket,
          (message) =>
            message.type === 'pattern_race_state' &&
            message.state.round === round + 1 &&
            message.state.phase === 'playing',
        )
      ).state;
      const key = current.usedPatterns.at(-1);
      if (seenPatterns.has(key)) throw new Error('Repeated a question');
      seenPatterns.add(key);
    }
  }
  if (
    current.phase !== 'finished' ||
    current.gameWinnerIds[0] !== first.accepted.selfId ||
    current.history.length !== 5
  )
    throw new Error('Problem-count mode did not produce the correct winner');

  const returned = waitForMessage(
    first.socket,
    (message) =>
      message.type === 'room_snapshot' && message.activeActivity === null,
  );
  first.socket.send(
    JSON.stringify(
      command('pattern_race_command', {
        instanceId: activityInstanceId,
        command: { kind: 'return_to_setup' },
      }),
    ),
  );
  await returned;
  console.log(
    JSON.stringify({
      patternRace: 'passed',
      invalidGuess: 'private rejection',
      firstAnswer: 'serialized winner',
      problemCount: 'completed',
    }),
  );
  first.socket.close();
  second.socket.close();
} finally {
  worker.kill('SIGTERM');
  await rm(stateDirectory, { recursive: true, force: true });
}
