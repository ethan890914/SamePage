import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const port = 8790;
const httpBase = `http://127.0.0.1:${port}`;
const wsBase = `ws://127.0.0.1:${port}`;
const stateDirectory = await mkdtemp(join(tmpdir(), 'same-page-smoke-'));
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
    'ROOM_PASSWORD_PEPPER:realtime-smoke-test-pepper',
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

async function waitForWorker() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${httpBase}/api/health`);
      if (response.ok) return;
    } catch {
      // Wrangler is still starting.
    }
    await wait(100);
  }
  throw new Error(`Worker did not start.\n${workerOutput}`);
}

function token() {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll('-', '_');
}

function waitForMessage(socket, predicate, timeoutMs = 5_000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.removeEventListener('message', onMessage);
      reject(new Error('Timed out waiting for a WebSocket message'));
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

async function authenticate(roomCode, message) {
  const socket = new WebSocket(`${wsBase}/api/rooms/${roomCode}/socket`);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  const response = waitForMessage(
    socket,
    (candidate) =>
      candidate.type === 'join_accepted' ||
      candidate.type === 'reconnect_accepted' ||
      candidate.type === 'join_rejected',
  );
  socket.send(JSON.stringify(message));
  return { socket, message: await response };
}

function command(type, fields = {}) {
  return {
    type,
    protocolVersion: 1,
    requestId: crypto.randomUUID(),
    ...fields,
  };
}

try {
  await waitForWorker();
  const creatorToken = token();
  const createRequest = {
    protocolVersion: 1,
    requestId: crypto.randomUUID(),
    sessionToken: creatorToken,
    name: 'Creator',
    avatarId: 'avatar-2',
    password: 'smoke-test-password',
  };
  const create = () =>
    fetch(`${httpBase}/api/rooms`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(createRequest),
    }).then(async (response) => {
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    });

  const created = await create();
  const repeated = await create();
  if (
    created.roomCode !== repeated.roomCode ||
    created.selfId !== repeated.selfId
  )
    throw new Error('Room creation was not idempotent');

  const creator = await authenticate(
    created.roomCode,
    command('reconnect', { sessionToken: creatorToken }),
  );
  if (creator.message.type !== 'reconnect_accepted')
    throw new Error(JSON.stringify(creator.message));

  const secondToken = token();
  const second = await authenticate(
    created.roomCode,
    command('join_room', {
      sessionToken: secondToken,
      name: 'Second',
      avatarId: 'avatar-7',
      password: 'smoke-test-password',
    }),
  );
  if (second.message.type !== 'join_accepted')
    throw new Error(JSON.stringify(second.message));
  if (
    second.message.players.find((player) => player.id === created.selfId)
      ?.avatarId !== 'avatar-2' ||
    second.message.players.find((player) => player.id !== created.selfId)
      ?.avatarId !== 'avatar-7'
  )
    throw new Error('Avatar selections were not synchronized');

  const creatorSelected = waitForMessage(
    creator.socket,
    (message) =>
      message.type === 'room_snapshot' &&
      message.players.find((player) => player.id === created.selfId)
        ?.selectedActivity === 'converge',
  );
  creator.socket.send(
    JSON.stringify(command('select_activity', { activityId: 'converge' })),
  );
  await creatorSelected;

  const secondSelected = waitForMessage(
    second.socket,
    (message) =>
      message.type === 'room_snapshot' &&
      message.players.every((player) => player.selectedActivity === 'converge'),
  );
  second.socket.send(
    JSON.stringify(command('select_activity', { activityId: 'converge' })),
  );
  await secondSelected;

  const creatorReady = waitForMessage(
    creator.socket,
    (message) =>
      message.type === 'room_snapshot' &&
      message.players.some(
        (player) => player.id === created.selfId && player.ready,
      ),
  );
  creator.socket.send(
    JSON.stringify(
      command('set_ready', { activityId: 'converge', ready: true }),
    ),
  );
  await creatorReady;

  const exitedWaitingRoom = waitForMessage(
    creator.socket,
    (message) =>
      message.type === 'room_snapshot' &&
      message.players.some(
        (player) =>
          player.id !== created.selfId && player.selectedActivity === null,
      ) &&
      message.players.every((player) => !player.ready),
  );
  second.socket.send(
    JSON.stringify(command('exit_activity', { activityId: 'converge' })),
  );
  await exitedWaitingRoom;

  const bothReturned = waitForMessage(
    creator.socket,
    (message) =>
      message.type === 'room_snapshot' &&
      message.players.every((player) => player.selectedActivity === 'converge'),
  );
  second.socket.send(
    JSON.stringify(command('select_activity', { activityId: 'converge' })),
  );
  await bothReturned;

  const creatorReadyAgain = waitForMessage(
    creator.socket,
    (message) =>
      message.type === 'room_snapshot' &&
      message.players.some(
        (player) => player.id === created.selfId && player.ready,
      ),
  );
  creator.socket.send(
    JSON.stringify(
      command('set_ready', { activityId: 'converge', ready: true }),
    ),
  );
  await creatorReadyAgain;

  const creatorStarted = waitForMessage(
    creator.socket,
    (message) => message.type === 'activity_started',
  );
  const secondStarted = waitForMessage(
    second.socket,
    (message) => message.type === 'activity_started',
  );
  second.socket.send(
    JSON.stringify(
      command('set_ready', { activityId: 'converge', ready: true }),
    ),
  );
  const [firstStart, secondStart] = await Promise.all([
    creatorStarted,
    secondStarted,
  ]);
  if (firstStart.activityInstanceId !== secondStart.activityInstanceId)
    throw new Error('Players received different activity instances');

  const rateCreateRequest = {
    ...createRequest,
    requestId: crypto.randomUUID(),
    sessionToken: token(),
    name: 'Rate test creator',
  };
  const rateResponse = await fetch(`${httpBase}/api/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(rateCreateRequest),
  });
  if (!rateResponse.ok) throw new Error(await rateResponse.text());
  const rateRoom = await rateResponse.json();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const rejected = await authenticate(
      rateRoom.roomCode,
      command('join_room', {
        sessionToken: token(),
        name: 'Wrong password',
        avatarId: 'avatar-1',
        password: 'incorrect-password',
      }),
    );
    if (rejected.message.reason !== 'bad_password')
      throw new Error(JSON.stringify(rejected.message));
    rejected.socket.close();
  }
  const limited = await authenticate(
    rateRoom.roomCode,
    command('join_room', {
      sessionToken: token(),
      name: 'Rate limited',
      avatarId: 'avatar-1',
      password: 'incorrect-password',
    }),
  );
  if (limited.message.reason !== 'rate_limited')
    throw new Error(JSON.stringify(limited.message));
  limited.socket.close();

  creator.socket.close();
  second.socket.close();
  console.log(
    JSON.stringify({
      roomCode: created.roomCode,
      idempotentCreation: true,
      joinRateLimit: 'passed',
      waitingRoomExitReset: 'passed',
      synchronizedActivity: firstStart.activityId,
    }),
  );
} finally {
  const exited = new Promise((resolve) => worker.once('exit', resolve));
  worker.kill('SIGTERM');
  await Promise.race([exited, wait(2_000)]);
  await rm(stateDirectory, { recursive: true, force: true });
}
