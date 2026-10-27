import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/migration-worker.mjs';
const env = { DB: { prepare: () => ({ first: async () => ({ ok: 1 }) }) } };
test('health checks D1 without exposing rows', async () => {
 const r=await worker.fetch(new Request('https://example.com/health'),env);
 assert.equal(r.status,200);
 assert.deepEqual(await r.json(),{service:'scum-hub-migration',database:'ok'});
});
test('API fails closed until auth is implemented',async()=>{
 const r=await worker.fetch(new Request('https://example.com/api/squads'),env);
 assert.equal(r.status,401);
 assert.equal(r.headers.get('cache-control'),'no-store');
});
test('health does not leak DB exceptions',async()=>{
 const r=await worker.fetch(new Request('https://example.com/health'),{DB:{prepare(){throw Error('private database error')}}});
 assert.equal(r.status,503);
 assert.doesNotMatch(await r.text(),/private database error/);
});
