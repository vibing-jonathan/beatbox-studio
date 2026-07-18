import assert from 'node:assert/strict';

import { findNextEmptySlot, normalizationGainDb, remapPatternEventSlots, waveformPeaks } from '../src/sample-editor.js';

const channel = new Float32Array([0, 0.25, -0.5, 0.1, 0.95, -0.2, 0.05, 0]);
const buffer = { sampleRate: 8, getChannelData: () => channel };
assert.deepEqual(waveformPeaks(buffer, 4), [25, 50, 95, 8]);
assert.equal(normalizationGainDb(buffer, 0, 0.5), 6);
assert.equal(normalizationGainDb(buffer, 0.5, 1), 0);

const patterns = [{ events: [{ slot: 'Bank A:r' }, { slot: 'Bank A:a' }, { type: 'kick' }] }];
remapPatternEventSlots(patterns, 'Bank A:r', 'Bank A:a', true);
assert.equal(patterns[0].events[0].slot, 'Bank A:a');
assert.equal(patterns[0].events[1].slot, 'Bank A:r');

const banks = { 'Bank A': [['Kick'], null, null], 'Bank B': [null, null, null] };
assert.equal(findNextEmptySlot(banks, ['1', '2', '3'], ['Bank A:2'], 'Bank A:3'), 'Bank B:1');

console.log('sample editor model tests passed');
