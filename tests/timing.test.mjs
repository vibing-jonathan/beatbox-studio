import assert from 'node:assert/strict';

import { loopPositionAtTime, quantizeLoopPosition } from '../src/timing.js';

assert.equal(loopPositionAtTime(1.25, 0.25, 0.25), 4);
assert.equal(loopPositionAtTime(0.125, 0.25, 0.125), 63);

assert.deepEqual(quantizeLoopPosition(10.34, '1/16'), { step: 10, offset: 0 });
assert.deepEqual(quantizeLoopPosition(10.7, '1/16'), { step: 11, offset: 0 });
assert.deepEqual(quantizeLoopPosition(11.2, '1/8'), { step: 12, offset: 0 });
assert.deepEqual(quantizeLoopPosition(63.8, '1/8'), { step: 0, offset: 0 });

const unquantized = quantizeLoopPosition(10.34, 'Off');
assert.equal(unquantized.step, 10);
assert.ok(Math.abs(unquantized.offset - 0.34) < 1e-9);

assert.deepEqual(quantizeLoopPosition(2.5, '1/8 swing'), { step: 2, offset: 0 });
assert.deepEqual(quantizeLoopPosition(3.8, '1/8 swing'), { step: 4, offset: 0 });

console.log('overdub timing tests passed');
