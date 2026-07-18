import assert from 'node:assert/strict';

import {
  createInitialPatterns,
  duplicateEvents,
  loopStepsForBars,
  nudgeEvent,
  normalizeSequencerEvent,
  quantizeEvent,
  trackIdForType,
} from '../src/sequencer.js';

assert.equal(loopStepsForBars(1), 16);
assert.equal(loopStepsForBars(8), 128);
assert.equal(loopStepsForBars(3), 64);
assert.equal(trackIdForType('clap'), 'snares');
assert.equal(trackIdForType('hum'), 'bass');
assert.equal(trackIdForType('hat-open'), 'hats');

assert.equal(normalizeSequencerEvent({ step: -1 }), null);
assert.deepEqual(normalizeSequencerEvent({ step: 4, type: 'kick', velocity: 2 }, 'x'), {
  id: 'x', trackId: 'kicks', type: 'kick', name: 'kick', step: 4, offset: 0,
  velocity: 1, origin: 'preset', recorded: false,
});

const tracks = [{ id: 'kicks', type: 'kick', defaultName: 'Kick Deep', gain: 0.9, steps: [0, 16] }];
const migrated = createInitialPatterns({ customEvents: [{ step: 3, type: 'snare' }] }, tracks);
assert.equal(migrated.patterns[0].events.length, 3);
assert.equal(migrated.patterns[0].events.at(-1).origin, 'overdub');

assert.deepEqual(nudgeEvent({ id: 'a', step: 0, offset: 0 }, -0.25, 16), { id: 'a', step: 15, offset: 0.75 });
assert.deepEqual(quantizeEvent({ id: 'a', step: 7, offset: 0.8 }, '1/8', 16), { id: 'a', step: 8, offset: 0, quantize: '1/8' });
const copies = duplicateEvents([{ id: 'a', step: 8, offset: 0 }], ['a'], 16, 16);
assert.equal(copies[0].step, 8);
assert.equal(copies[0].origin, 'overdub');
assert.notEqual(copies[0].id, 'a');

console.log('sequencer model tests passed');
