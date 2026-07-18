import assert from 'node:assert/strict';

import { audioBufferToWav } from '../src/audio-engine.js';

const samples = [
  new Float32Array([-1, -0.5, 0.5, 1]),
  new Float32Array([1, 0.25, -0.25, -1]),
];
const buffer = {
  numberOfChannels: samples.length,
  length: samples[0].length,
  sampleRate: 44_100,
  getChannelData(channel) {
    return samples[channel];
  },
};

const wav = audioBufferToWav(buffer);
const bytes = await wav.arrayBuffer();
const view = new DataView(bytes);
const text = (offset, length) => String.fromCharCode(...new Uint8Array(bytes, offset, length));

assert.equal(wav.type, 'audio/wav');
assert.equal(wav.size, 44 + buffer.length * buffer.numberOfChannels * 2);
assert.equal(text(0, 4), 'RIFF');
assert.equal(text(8, 4), 'WAVE');
assert.equal(text(12, 4), 'fmt ');
assert.equal(text(36, 4), 'data');
assert.equal(view.getUint16(22, true), 2);
assert.equal(view.getUint32(24, true), 44_100);
assert.equal(view.getUint16(34, true), 16);
assert.equal(view.getInt16(44, true), -32_768);
assert.equal(view.getInt16(46, true), 32_767);

console.log('audio-engine WAV export test passed');
