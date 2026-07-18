import assert from 'node:assert/strict';
import { RecoverableSaveQueue } from '../src/save-queue.js';

const queue = new RecoverableSaveQueue();
const calls = [];

await assert.rejects(
  queue.enqueue(async () => {
    calls.push('failed save');
    throw new Error('storage temporarily unavailable');
  }),
  /temporarily unavailable/,
);

const recovered = await queue.enqueue(async () => {
  calls.push('successful retry');
  return 'saved';
});

assert.equal(recovered, 'saved');
assert.deepEqual(calls, ['failed save', 'successful retry']);

const orderedQueue = new RecoverableSaveQueue();
const order = [];
const first = orderedQueue.enqueue(async () => {
  await Promise.resolve();
  order.push('first');
});
const second = orderedQueue.enqueue(async () => {
  order.push('second');
});
await Promise.all([first, second]);
assert.deepEqual(order, ['first', 'second']);

console.log('save queue tests passed');
