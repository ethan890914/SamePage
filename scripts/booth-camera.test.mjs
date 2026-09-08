import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(
  new URL('../lib/booth-camera.ts', import.meta.url),
  'utf8',
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
  },
});
const { BoothCamera, captureBoothFrame } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
);

function channel(mid, direction) {
  return {
    mid,
    direction,
    receiver: { track: { kind: 'video' } },
    sender: {
      track: null,
      async replaceTrack(track) {
        this.track = track;
      },
    },
  };
}

// Model the WebRTC association rule behind the regression: a remote offer
// creates its own transceiver, leaving addTransceiver-created ones unassociated.
class Peer {
  transceivers = [];
  addTransceiver(kind, { direction }) {
    assert.equal(kind, 'video');
    const next = channel(null, direction);
    this.transceivers.push(next);
    return next;
  }
  getTransceivers() {
    return this.transceivers;
  }
  receiveOffer() {
    this.transceivers.push(channel('0', 'recvonly'));
  }
}

for (const offererEarly of [true, false]) {
  for (const answererEarly of [true, false]) {
    test(`both negotiated senders carry video (offerer early=${offererEarly}, answerer early=${answererEarly})`, async () => {
      const offererPeer = new Peer(),
        answererPeer = new Peer();
      const offerer = new BoothCamera(offererPeer),
        answerer = new BoothCamera(answererPeer);
      const firstTrack = { kind: 'video', id: 'first-camera' };
      const secondTrack = { kind: 'video', id: 'second-camera' };
      if (offererEarly) await offerer.setTrack(firstTrack);
      if (answererEarly) await answerer.setTrack(secondTrack);
      // Camera permission on the answerer must not create an orphan channel.
      assert.equal(answererPeer.transceivers.length, 0);
      await offerer.prepareOffer();
      offererPeer.transceivers[0].mid = '0';
      answererPeer.receiveOffer();
      await answerer.prepareAnswer();
      if (!offererEarly) await offerer.setTrack(firstTrack);
      if (!answererEarly) await answerer.setTrack(secondTrack);
      for (const [peer, track] of [
        [offererPeer, firstTrack],
        [answererPeer, secondTrack],
      ]) {
        assert.equal(peer.transceivers.length, 1);
        assert.equal(peer.transceivers[0].mid, '0');
        assert.equal(peer.transceivers[0].direction, 'sendrecv');
        assert.equal(peer.transceivers[0].sender.track, track);
      }
    });
  }
}

test('answer attaches to the negotiated channel, not an unrelated local sender', async () => {
  const peer = new Peer();
  const orphan = peer.addTransceiver('video', { direction: 'sendrecv' });
  peer.receiveOffer();
  const camera = new BoothCamera(peer);
  await camera.prepareAnswer();
  const track = { kind: 'video' };
  await camera.setTrack(track);
  assert.equal(orphan.sender.track, null);
  assert.equal(peer.transceivers[1].sender.track, track);
});

test('answer fails explicitly when the offer has no negotiated video', async () => {
  await assert.rejects(
    new BoothCamera(new Peer()).prepareAnswer(),
    /did not offer a video/,
  );
});

test('a hidden page with a live camera captures despite a briefly delayed timer', () => {
  const previousDocument = globalThis.document;
  let drawn = 0;
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({}),
    toDataURL: () => 'data:image/jpeg;base64,cGhvdG8=',
  };
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    writable: true,
    value: {
      hidden: true,
      visibilityState: 'hidden',
      createElement: () => canvas,
    },
  });
  try {
    const video = { readyState: 2, videoWidth: 1280, videoHeight: 720 };
    const track = { readyState: 'live', muted: false, enabled: true };
    const stream = { getVideoTracks: () => [track] };
    const channel = { readyState: 'open' };
    for (const delay of [0, 2000, 5000]) {
      assert.equal(
        captureBoothFrame(video, stream, channel, delay, () => drawn++),
        'data:image/jpeg;base64,cGhvdG8=',
      );
    }
    assert.equal(drawn, 3);
    assert.equal(canvas.width, 600);
    assert.equal(canvas.height, 600);
    assert.throws(
      () => captureBoothFrame(video, stream, channel, 10_000, () => drawn++),
      /photo timer/,
    );
    assert.throws(
      () =>
        captureBoothFrame(
          video,
          stream,
          { readyState: 'closed' },
          0,
          () => drawn++,
        ),
      /photo connection closed/,
    );
    assert.throws(
      () =>
        captureBoothFrame(
          video,
          { getVideoTracks: () => [] },
          channel,
          0,
          () => drawn++,
        ),
      /camera stopped/,
    );
    track.muted = true;
    assert.throws(
      () => captureBoothFrame(video, stream, channel, 0, () => drawn++),
      /paused the camera/,
    );
    track.muted = false;
    video.readyState = 1;
    assert.throws(
      () => captureBoothFrame(video, stream, channel, 0, () => drawn++),
      /supplied a frame/,
    );
    assert.equal(
      drawn,
      3,
      'Unavailable cameras and suspended timers must not produce stale photos',
    );
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});
