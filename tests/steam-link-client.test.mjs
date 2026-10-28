import test from 'node:test';
import assert from 'node:assert/strict';
import {steamLinkClient} from '../src/steam-link-client.mjs';
test('link status uses authenticated Steam token',async()=>{
 const client=steamLinkClient('https://worker.example',()=> 'steam-session',async(url,options)=>{
  assert.equal(new URL(url).pathname,'/api/link-status');
  assert.equal(options.headers.authorization,'Bearer steam-session');
  return {ok:true,json:async()=>({linked:false})};
 });
 assert.deepEqual(await client.status(),{linked:false});
});
test('legacy token is sent only to linking endpoint',async()=>{
 const client=steamLinkClient('https://worker.example',()=> 'steam-session',async(url,options)=>{
  assert.equal(new URL(url).pathname,'/api/link-legacy-account');
  assert.equal(options.method,'POST');
  assert.equal(JSON.parse(options.body).legacy_access_token,'legacy-token');
  return {ok:true,json:async()=>({linked:true})};
 });
 assert.deepEqual(await client.link('legacy-token'),{linked:true});
});
test('no Steam token refuses requests',async()=>{
 const client=steamLinkClient('https://worker.example',()=>null,async()=>{throw Error('unexpected fetch')});
 await assert.rejects(client.status(),/Steam session required/);
});
test('insecure API endpoints are rejected',()=>{
 assert.throws(()=>steamLinkClient('http://worker.example',()=>null),/HTTPS required/);
});
