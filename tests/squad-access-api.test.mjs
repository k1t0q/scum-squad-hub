import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/migration-worker.mjs';
import {issueSession} from '../src/issue-session.mjs';
const secret='test-secret-for-migration-sessions-long-enough';
const steam='76561198000000000';
const headers=async()=>({authorization:'Bearer '+await issueSession(steam,{SESSION_HMAC_KEY:secret})});
function env(member){
 return {SESSION_HMAC_KEY:secret,DB:{prepare(sql){
  assert.match(sql,/scum_verified_steam_links/);
  return {bind(id,squad){assert.equal(id,steam);return {first:async()=>member?.squad_id===squad?member:null}}};
 }}};
}
test('linked squad returns only own membership',async()=>{
 const response=await worker.fetch(new Request('https://test/api/squad-access?squad_id=own',{headers:await headers()}),env({member_id:'m1',squad_id:'own',access_role:'member'}));
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{member_id:'m1',squad_id:'own',access_role:'member'});
});
test('foreign squad returns forbidden',async()=>{
 const response=await worker.fetch(new Request('https://test/api/squad-access?squad_id=foreign',{headers:await headers()}),env({member_id:'m1',squad_id:'own'}));
 assert.equal(response.status,403);
});
test('no token is unauthorized',async()=>{
 const response=await worker.fetch(new Request('https://test/api/squad-access?squad_id=own'),env(null));
 assert.equal(response.status,401);
});
