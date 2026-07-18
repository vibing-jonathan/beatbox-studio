import assert from 'node:assert/strict';
import {
  channelIsAudible,
  normalizeChannelMixer,
  normalizeMasterMixer,
  panLabel,
  resetChannelEffects,
} from '../src/mixer.js';

const channel = normalizeChannelMixer({ volume: 120, pan: -130, eqLow: 20, compRatio: 0, reverbSend: 48 }, { id: 'kicks', volume: 82 });
assert.equal(channel.id, 'kicks');
assert.equal(channel.volume, 100);
assert.equal(channel.pan, -100);
assert.equal(channel.eqLow, 12);
assert.equal(channel.compRatio, 1);
assert.equal(channel.reverbSend, 48);

const reset = resetChannelEffects({ ...channel, eqMid: 8, delaySend: 90, bypass: true });
assert.equal(reset.eqMid, 0);
assert.equal(reset.delaySend, 0);
assert.equal(reset.bypass, false);
assert.equal(reset.volume, 100);

assert.equal(channelIsAudible({ muted: false, solo: false, cleared: false }, [{ solo: false }]), true);
assert.equal(channelIsAudible({ muted: false, solo: false, cleared: false }, [{ solo: true }]), false);
assert.equal(channelIsAudible({ muted: false, solo: true, cleared: false }, [{ solo: true }]), true);
assert.equal(panLabel(-24), 'L24');
assert.equal(panLabel(0), 'C');
assert.equal(panLabel(18), 'R18');

assert.deepEqual(normalizeMasterMixer({ volume: -4, balance: 140, ceiling: -20, limiter: false }), {
  volume: 0,
  balance: 100,
  limiter: false,
  ceiling: -12,
});

console.log('mixer model tests passed');
