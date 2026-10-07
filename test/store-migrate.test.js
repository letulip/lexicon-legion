import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCHEMA_VERSION, defaultStore, fillDefaults, looksLikeStore, migrate } from '../src/core/store-migrate.js';
test('defaultStore is at the current schema', () => { assert.equal(defaultStore().schemaVersion, SCHEMA_VERSION); });
test('fillDefaults never drops or overwrites user data', () => {
  const s = { progress: { ledge: { lvl: 4 } }, stats: { xp: 500, extra: 'kept' } };
  fillDefaults(s, defaultStore());
  assert.equal(s.progress.ledge.lvl, 4); assert.equal(s.stats.xp, 500); assert.equal(s.stats.extra, 'kept');
  assert.equal(s.settings.dailyNew, 10); assert.deepEqual(s.groups, {});
});
test('looksLikeStore rejects garbage', () => {
  assert.ok(looksLikeStore(defaultStore())); assert.equal(looksLikeStore({ foo: 1 }), false);
  assert.equal(looksLikeStore([]), false); assert.equal(looksLikeStore(null), false);
});
test('migrate v1 → current keeps progress and stamps the version', () => {
  const old = { schemaVersion: 1, progress: { ledge: { lvl: 2, due: 1, peak: 2, correct: 2, wrong: 0, lastSeen: 1 } }, stats: { xp: 20 } };
  const s = migrate(JSON.parse(JSON.stringify(old)));
  assert.equal(s.schemaVersion, SCHEMA_VERSION); assert.deepEqual(s.progress.ledge, old.progress.ledge); assert.equal(s.stats.xp, 20);
});
