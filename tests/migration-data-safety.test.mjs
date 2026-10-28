import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/migration-worker.mjs';
import { issueSession } from '../src/issue-session.mjs';

const secret = 'test-secret-for-migration-isolation-123456';
const steamId = '76561198000000000';
const token = await issueSession(steamId, { SESSION_HMAC_KEY: secret });
const auth = { authorization: 'Bearer ' + token };

function env({ membership = true, databaseError = false } = {}) {
  return {
    SESSION_HMAC_KEY: secret,
    DB: {
      prepare(sql) {
        if (sql.includes('scum_verified_steam_links')) {
          return { bind(id, squad) {
            assert.equal(id, steamId);
            return { first: async () => membership && squad === 'own'
              ? { member_id: 'm1', squad_id: 'own', access_role: 'member' } : null };
          } };
        }
        return { bind(squad) {
          assert.equal(squad, 'own');
          return { all: async () => {
            if (databaseError) throw Error('internal database connection details');
            return { results: [{ id: 'stash-1', kind: 'stash' }] };
          } };
        } };
      }
    }
  };
}

test('stash and explosive endpoints reject missing session', async () => {
  for (const path of ['stashes', 'explosives']) {
    const response = await worker.fetch(new Request('https://test/api/' + path + '?squad_id=own'), env());
    assert.equal(response.status, 401);
  }
});

test('stash and explosive endpoints require squad_id', async () => {
  for (const path of ['stashes', 'explosives']) {
    const response = await worker.fetch(new Request('https://test/api/' + path, { headers: auth }), env());
    assert.equal(response.status, 400);
  }
});

test('authorized stash read remains scoped to squad', async () => {
  const response = await worker.fetch(new Request('https://test/api/stashes?squad_id=own', { headers: auth }), env());
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).items, [{ id: 'stash-1', kind: 'stash' }]);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('database errors do not reveal internal details', async () => {
  const response = await worker.fetch(new Request('https://test/api/stashes?squad_id=own', { headers: auth }), env({ databaseError: true }));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'database_unavailable' });
});

test('write requests cannot modify stash or explosives yet', async () => {
  for (const path of ['stashes', 'explosives']) {
    const response = await worker.fetch(new Request('https://test/api/' + path + '?squad_id=own', {
      method: 'POST', headers: { ...auth, origin: 'https://test', 'content-type': 'application/json' }, body: '{}'
    }), env());
    assert.equal(response.status, 501);
  }
});
