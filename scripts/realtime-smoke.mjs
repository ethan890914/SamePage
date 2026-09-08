import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';

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
    '--var',
    'TURN_URLS:turn:relay.example.com:3478',
    '--var',
    'TURN_SHARED_SECRET:smoke-turn-secret',
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

  const settingsSynced = [creator.socket, second.socket].map((socket) =>
    waitForMessage(
      socket,
      (message) =>
        message.type === 'room_snapshot' &&
        message.convergeSettings?.timeLimitSeconds === 30 &&
        message.convergeSettings?.mode === 'limited' &&
        message.convergeSettings?.maxRounds === 5 &&
        message.players.every((player) => !player.ready),
    ),
  );
  second.socket.send(
    JSON.stringify(
      command('set_game_settings', {
        activityId: 'converge',
        settings: { timeLimitSeconds: 30, mode: 'limited', maxRounds: 5 },
      }),
    ),
  );
  await Promise.all(settingsSynced);

  const invalidSettings = waitForMessage(
    second.socket,
    (message) => message.type === 'protocol_error',
  );
  second.socket.send(
    JSON.stringify(
      command('set_game_settings', {
        activityId: 'converge',
        settings: { timeLimitSeconds: -1, mode: 'limited', maxRounds: 5 },
      }),
    ),
  );
  await invalidSettings;

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

  const convergeInstanceId = firstStart.activityInstanceId;
  async function convergeCommand(socket, value) {
    const payload = command('converge_command', {
      instanceId: convergeInstanceId,
      command: value,
    });
    const response = waitForMessage(
      socket,
      (message) =>
        message.type === 'converge_state' &&
        message.requestId === payload.requestId,
    );
    socket.send(JSON.stringify(payload));
    return (await response).state;
  }

  const opening = await convergeCommand(creator.socket, {
    kind: 'submit',
    round: 1,
    word: 'ocean',
  });
  if (
    opening.history.length !== 0 ||
    !opening.submittedIds.includes(created.selfId) ||
    JSON.stringify(opening).includes('ocean')
  )
    throw new Error('Converge exposed a private submission');

  const connectedRound = await convergeCommand(second.socket, {
    kind: 'submit',
    round: 1,
    word: 'mountain',
  });
  if (
    connectedRound.round !== 2 ||
    connectedRound.phase !== 'playing' ||
    connectedRound.baseWords?.[0] !== 'ocean' ||
    connectedRound.baseWords?.[1] !== 'mountain' ||
    connectedRound.deadline <= Date.now()
  )
    throw new Error('Converge did not reveal and start the timed round');

  await convergeCommand(creator.socket, {
    kind: 'submit',
    round: 2,
    word: 'running',
  });
  const normalizedWin = await convergeCommand(second.socket, {
    kind: 'submit',
    round: 2,
    word: 'run',
  });
  if (normalizedWin.phase !== 'won' || !normalizedWin.history.at(-1)?.matched)
    throw new Error('Converge normalization did not recognize word forms');

  const returnedToSetup = waitForMessage(
    creator.socket,
    (message) =>
      message.type === 'room_snapshot' &&
      message.activeActivity === null &&
      message.players.every(
        (player) => player.selectedActivity === 'converge' && !player.ready,
      ),
  );
  second.socket.send(
    JSON.stringify(
      command('converge_command', {
        instanceId: convergeInstanceId,
        command: { kind: 'return_to_setup' },
      }),
    ),
  );
  const setupSnapshot = await returnedToSetup;
  if (
    setupSnapshot.convergeSettings?.timeLimitSeconds !== 30 ||
    setupSnapshot.convergeSettings?.mode !== 'limited' ||
    setupSnapshot.convergeSettings?.maxRounds !== 5
  )
    throw new Error('Converge retry did not preserve game settings');

  async function snapshotCommand(socket, type, fields, predicate) {
    const response = waitForMessage(
      socket,
      (m) => m.type === 'room_snapshot' && predicate(m),
    );
    socket.send(JSON.stringify(command(type, fields)));
    return response;
  }
  await snapshotCommand(
    creator.socket,
    'exit_activity',
    { activityId: 'converge' },
    (m) => m.activeActivity === null,
  );
  await snapshotCommand(
    creator.socket,
    'select_activity',
    { activityId: 'photo-booth' },
    (m) =>
      m.players.some(
        (p) => p.id === created.selfId && p.selectedActivity === 'photo-booth',
      ),
  );
  await snapshotCommand(
    second.socket,
    'select_activity',
    { activityId: 'photo-booth' },
    (m) => m.players.every((p) => p.selectedActivity === 'photo-booth'),
  );
  await snapshotCommand(
    creator.socket,
    'set_ready',
    { activityId: 'photo-booth', ready: true },
    (m) => m.players.some((p) => p.id === created.selfId && p.ready),
  );
  const boothStarted = waitForMessage(
    creator.socket,
    (m) => m.type === 'activity_started',
  );
  await snapshotCommand(
    second.socket,
    'set_booth_settings',
    { activityId: 'photo-booth', countdownSeconds: 15 },
    (m) => m.boothCountdownSeconds === 15 && m.players.every((p) => !p.ready),
  );
  await snapshotCommand(
    creator.socket,
    'set_ready',
    { activityId: 'photo-booth', ready: true },
    (m) => m.players.some((p) => p.id === created.selfId && p.ready),
  );
  second.socket.send(
    JSON.stringify(
      command('set_ready', { activityId: 'photo-booth', ready: true }),
    ),
  );
  const { activityInstanceId: instanceId } = await boothStarted;
  async function boothCommand(socket, value) {
    const payload = command('booth_command', { instanceId, command: value });
    const response = waitForMessage(
      socket,
      (m) => m.type === 'booth_state' && m.requestId === payload.requestId,
    );
    socket.send(JSON.stringify(payload));
    return (await response).state;
  }
  const ice = waitForMessage(creator.socket, (m) => m.type === 'booth_ice');
  const initial = await boothCommand(creator.socket, { kind: 'sync' });
  if (initial.countdownSeconds !== 15)
    throw new Error('Booth countdown was not carried into the session');
  const iceConfig = await ice;
  if (!iceConfig.iceServers.length || initial.leftId !== created.selfId)
    throw new Error('Booth initialization failed');
  const relay = iceConfig.iceServers[1];
  if (
    !relay ||
    relay.credential !==
      createHmac('sha1', 'smoke-turn-secret')
        .update(relay.username)
        .digest('base64') ||
    Number(relay.username.split(':')[0]) < Date.now() / 1000 + 3500
  )
    throw new Error('Temporary TURN credentials are invalid');
  const premature = await boothCommand(creator.socket, { kind: 'start' });
  if (premature.takeId)
    throw new Error('Booth started without both participants ready');
  const swapped = await boothCommand(second.socket, { kind: 'swap' });
  if (swapped.leftId !== second.message.selfId)
    throw new Error('Booth side swap failed');
  const framed = await boothCommand(creator.socket, {
    kind: 'frame',
    frame: 'hearts',
  });
  if (framed.frame !== 'hearts') throw new Error('Frame did not synchronize');
  await boothCommand(creator.socket, { kind: 'ready', ready: true });
  const manualArmed = await boothCommand(second.socket, {
    kind: 'ready',
    ready: true,
  });
  if (
    manualArmed.autoStartAt < Date.now() + 2500 ||
    manualArmed.autoStartAt > Date.now() + 3000 ||
    manualArmed.takeId
  )
    throw new Error('Both ready did not arm a three-second countdown');
  const started = await boothCommand(creator.socket, { kind: 'start' });
  if (started.autoStartAt !== null)
    throw new Error('Manual start did not clear the automatic countdown');
  if (
    !started.takeId ||
    started.startsAt < Date.now() ||
    started.startsAt > Date.now() + 1500
  )
    throw new Error('Invalid capture schedule');
  const duplicateStart = await boothCommand(second.socket, { kind: 'start' });
  if (
    duplicateStart.takeId !== started.takeId ||
    duplicateStart.startsAt !== started.startsAt
  )
    throw new Error('Duplicate start changed the active take');
  if (
    (await boothCommand(second.socket, { kind: 'swap' })).leftId !==
    swapped.leftId
  )
    throw new Error('Sides changed during capture');
  if (
    (await boothCommand(second.socket, { kind: 'frame', frame: 'arcade' }))
      .frame !== 'hearts'
  )
    throw new Error('Frame changed during capture');
  const signal = waitForMessage(
    second.socket,
    (m) => m.type === 'booth_signal',
  );
  creator.socket.send(
    JSON.stringify(
      command('booth_command', {
        instanceId,
        command: {
          kind: 'signal',
          targetId: second.message.selfId,
          signal: { type: 'hello', value: '' },
        },
      }),
    ),
  );
  if ((await signal).fromId !== created.selfId)
    throw new Error('Signal sender identity incorrect');
  const invalid = waitForMessage(
    creator.socket,
    (m) => m.type === 'protocol_error',
  );
  creator.socket.send(
    JSON.stringify(
      command('booth_command', {
        instanceId,
        command: { kind: 'frame', frame: 'invalid' },
      }),
    ),
  );
  await invalid;
  const stale = waitForMessage(
    creator.socket,
    (m) => m.type === 'command_rejected',
  );
  creator.socket.send(
    JSON.stringify(
      command('booth_command', {
        instanceId: crypto.randomUUID(),
        command: { kind: 'reset' },
      }),
    ),
  );
  await stale;
  const reset = await boothCommand(second.socket, { kind: 'reset' });
  if (reset.takeId || reset.startsAt || reset.readyIds.length)
    throw new Error('Retake did not reset capture');
  if (reset.frame !== 'hearts' || reset.leftId !== swapped.leftId)
    throw new Error('Retake lost frame or positions');
  await boothCommand(creator.socket, { kind: 'ready', ready: true });
  const armed = await boothCommand(second.socket, {
    kind: 'ready',
    ready: true,
  });
  const readyRepeated = await boothCommand(second.socket, {
    kind: 'ready',
    ready: true,
  });
  if (readyRepeated.autoStartAt !== armed.autoStartAt)
    throw new Error('Repeated ready postponed automatic start');
  const unready = await boothCommand(creator.socket, {
    kind: 'ready',
    ready: false,
  });
  if (unready.autoStartAt !== null)
    throw new Error('Cancel ready did not cancel automatic start');
  await wait(3200);
  const cancelled = await boothCommand(second.socket, {
    kind: 'frame',
    frame: 'hearts',
  });
  if (cancelled.takeId || cancelled.autoStartAt)
    throw new Error('Cancelled countdown started a take');
  const autoFirst = waitForMessage(
    creator.socket,
    (m) => m.type === 'booth_state' && m.state.takeId,
  );
  const autoSecond = waitForMessage(
    second.socket,
    (m) => m.type === 'booth_state' && m.state.takeId,
  );
  const rearmed = await boothCommand(creator.socket, {
    kind: 'ready',
    ready: true,
  });
  const [automaticFirst, automaticSecond] = await Promise.all([
    autoFirst,
    autoSecond,
  ]);
  if (
    automaticFirst.state.takeId !== automaticSecond.state.takeId ||
    automaticFirst.state.startsAt !== automaticSecond.state.startsAt ||
    automaticFirst.state.autoStartAt !== null ||
    automaticFirst.serverTime < rearmed.autoStartAt
  )
    throw new Error('Automatic start was early or not synchronized');
  const lateClick = await boothCommand(second.socket, { kind: 'start' });
  if (lateClick.takeId !== automaticFirst.state.takeId)
    throw new Error('Late click duplicated the automatically started take');
  await boothCommand(creator.socket, { kind: 'reset' });
  await boothCommand(creator.socket, { kind: 'ready', ready: true });
  await boothCommand(second.socket, { kind: 'ready', ready: true });
  await boothCommand(creator.socket, { kind: 'start' });
  const disconnected = waitForMessage(
    creator.socket,
    (m) => m.type === 'room_snapshot' && m.players.some((p) => !p.connected),
  );
  second.socket.close();
  await disconnected;
  const reclaimed = await authenticate(
    created.roomCode,
    command('reconnect', { sessionToken: secondToken }),
  );
  if (reclaimed.message.selfId !== second.message.selfId)
    throw new Error('Reconnecting player lost their identity');
  second.socket = reclaimed.socket;
  const resumed = await boothCommand(second.socket, { kind: 'sync' });
  if (
    resumed.takeId ||
    resumed.readyIds.length ||
    resumed.leftId !== swapped.leftId ||
    resumed.frame !== 'hearts'
  )
    throw new Error(
      'Reconnect did not cancel the take and preserve positioning',
    );
  const exitedBooth = await snapshotCommand(
    creator.socket,
    'exit_activity',
    { activityId: 'photo-booth' },
    (m) => m.activeActivity === null,
  );
  if (
    exitedBooth.activityInstanceId ||
    exitedBooth.players.some((p) => p.ready)
  )
    throw new Error('Exiting booth did not reset the activity');

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
      photoBooth:
        'passed: shared frames, side swap, readiness, three-second auto-start, immediate start, countdown cancellation, timed capture, duplicate start, capture locks, signaling, validation, retake, exit',
    }),
  );
} finally {
  const exited = new Promise((resolve) => worker.once('exit', resolve));
  worker.kill('SIGTERM');
  await Promise.race([exited, wait(2_000)]);
  await rm(stateDirectory, { recursive: true, force: true });
}
