import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { soundEngine } from '../src/audio/soundEngine.js';
import { getDemoTrack } from '../src/data/demoTracks.js';
import { SCENIC_SPOTS } from '../src/data/spots.js';

const spot = SCENIC_SPOTS.find(spot => spot.id === 'wuzhen');
function setup(play = async () => {}) {
  const events = [];
  soundEngine.listeners.clear();
  soundEngine.subscribe((event, data) => events.push({ event, data }));
  soundEngine.init = () => {};
  soundEngine.resumeContext = async () => {};
  soundEngine.currentSpot = null;
  soundEngine.currentTrack = null;
  soundEngine.isPlaying = false;
  soundEngine.referenceAudio = { src: '', currentTime: 0, play, pause() {}, load() {} };
  return events;
}

test('unmapped places do not borrow another place’s song', () => {
  assert.equal(getDemoTrack({ id: 'unmapped' }).url, '');
  assert.equal(getDemoTrack({ id: 'custom', audioTrack: { url: '/uploads/test.mp3' } }).url, '/uploads/test.mp3');
});

test('featured routes have local music and valid local or HTTPS cover sources', () => {
  for (const id of ['wuzhen', 'zhouzhuang', 'hongcun', 'meili', 'yulong', 'everest', 'sanya', 'maldives', 'santorini']) {
    const entry = SCENIC_SPOTS.find(spot => spot.id === id);
    assert.ok(entry, id);
    assert.ok(existsSync(new URL(`../public${getDemoTrack(entry).url}`, import.meta.url)), id);
    assert.ok(entry.photos[0].startsWith('https://') || existsSync(new URL(`../public${entry.photos[0]}`, import.meta.url)), id);
  }
});

test('playing is confirmed only after audio succeeds', async () => {
  let resolve;
  const events = setup(() => new Promise(done => { resolve = done; }));
  const pending = soundEngine.playSpot(spot);
  assert.equal(soundEngine.isPlaying, false);
  resolve();
  await pending;
  assert.equal(soundEngine.isPlaying, true);
  assert.equal(events.at(-1).data.isPlaying, true);
});

test('visualizer AudioContext cannot block HTML audio', async () => {
  setup();
  soundEngine.resumeContext = () => new Promise(() => {});
  await soundEngine.playSpot(spot);
  assert.equal(soundEngine.isPlaying, true);
});

test('blocked or missing media reports actionable failure without playing', async () => {
  for (const name of ['NotAllowedError', 'NotSupportedError']) {
    const events = setup(async () => { throw Object.assign(new Error('failed'), { name }); });
    await soundEngine.playSpot(spot);
    assert.equal(soundEngine.isPlaying, false);
    assert.equal(events.find(item => item.event === 'playbackError').data.reason, name === 'NotAllowedError' ? 'blocked' : 'unavailable');
  }
  const events = setup();
  await soundEngine.playSpot({ id: 'missing' });
  assert.equal(soundEngine.isPlaying, false);
  assert.ok(events.some(item => item.data.reason === 'missing'));
});

test('failed resume does not falsely show playing', async () => {
  setup(async () => { throw new Error('offline'); });
  soundEngine.currentSpot = spot;
  soundEngine.currentTrack = getDemoTrack(spot);
  soundEngine.referenceAudio.currentTime = 42;
  await soundEngine.playSpot(spot);
  assert.equal(soundEngine.isPlaying, false);
});

test('pause during pending playback invalidates stale completion', async () => {
  let resolve;
  setup(() => new Promise(done => { resolve = done; }));
  const pending = soundEngine.playSpot(spot);
  soundEngine.pause();
  resolve();
  await pending;
  assert.equal(soundEngine.isPlaying, false);
});

test('rapid track switching ignores stale completion and preserves latest metadata', async () => {
  let resolve;
  setup(() => new Promise(done => { resolve = done; }));
  const pending = soundEngine.playSpot(spot);
  soundEngine.referenceAudio.play = async () => {};
  const next = SCENIC_SPOTS.find(spot => spot.id === 'meili');
  await soundEngine.playSpot(next);
  resolve();
  await pending;
  assert.equal(soundEngine.currentSpot.id, next.id);
  assert.equal(soundEngine.currentTrack.id, getDemoTrack(next).id);
  assert.equal(soundEngine.isPlaying, true);
});
