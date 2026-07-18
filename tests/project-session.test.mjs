import assert from 'node:assert/strict';
import {
  cleanProjectName,
  createProjectRecord,
  duplicateProjectRecord,
  parseProjectBundle,
  projectFileName,
  serializeProjectBundle,
  uniqueProjectName,
} from '../src/project-session.js';

assert.equal(cleanProjectName('  Night   take  '), 'Night take');
assert.equal(uniqueProjectName('Night take', ['night take', 'Night take 2']), 'Night take 3');
assert.equal(projectFileName('Basement Cypher 03'), 'basement-cypher-03.beatbox');

const original = createProjectRecord({
  id: 'session-a',
  name: 'Basement Cypher 03',
  settings: { bpm: 96, patterns: [{ id: 'p1', events: [] }] },
  recordings: [{ slot: 'Bank A:r', name: 'Kick', duration: 0.2, blob: new Blob(['audio'], { type: 'audio/webm' }) }],
  now: 100,
});
const duplicate = duplicateProjectRecord(original, ['Basement Cypher 03 copy'], 200);
assert.equal(duplicate.name, 'Basement Cypher 03 copy 2');
assert.notEqual(duplicate.id, original.id);
assert.deepEqual(duplicate.settings, original.settings);

const serialized = await serializeProjectBundle(original);
const imported = parseProjectBundle(serialized, { now: 300, existingNames: ['Basement Cypher 03'] });
assert.equal(imported.name, 'Basement Cypher 03 2');
assert.equal(imported.settings.bpm, 96);
assert.equal(imported.recordings[0].slot, 'Bank A:r');
assert.equal(await imported.recordings[0].blob.text(), 'audio');

assert.throws(() => parseProjectBundle('{"format":"wrong"}'), /unsupported/i);
assert.throws(() => parseProjectBundle('not json'), /not a valid/i);

console.log('project-session tests passed');
