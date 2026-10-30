import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/migration-worker.mjs';
const env={ASSETS:{fetch:async request=>new Response(new URL(request.url).pathname)}};
test('root displays landing and hub displays original app without redirect loop',async()=>{
 assert.equal(await (await worker.fetch(new Request('https://scum-hub.ru/'),env)).text(),'/landing-preview');
 assert.equal(await (await worker.fetch(new Request('https://scum-hub.ru/hub'),env)).text(),'/');
});
test('existing Discord deep links retain section and parameters',async()=>{
 for(const section of ['map','tasks','explosives']){
  const r=await worker.fetch(new Request('https://scum-hub.ru/?section='+section+'&x=1'),env);
  assert.equal(r.status,302);assert.equal(r.headers.get('location'),'https://scum-hub.ru/hub?section='+section+'&x=1');
 }
});
test('trailing slash hub normalizes to keep relative asset paths working',async()=>{
 const r=await worker.fetch(new Request('https://scum-hub.ru/hub/?section=map'),env);
 assert.equal(r.headers.get('location'),'https://scum-hub.ru/hub?section=map');
});
