import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/migration-worker.mjs';
import {issueSession} from '../src/issue-session.mjs';
const key='test-secret-for-squad-data-api-123456789';
const steam='76561198000000000';
const token=await issueSession(steam,{SESSION_HMAC_KEY:key});
function environment(allowed){
 return {SESSION_HMAC_KEY:key,DB:{prepare(sql){
  if(sql.includes('scum_verified_steam_links'))return {bind(id,squad){return {first:async()=>allowed&&squad==='own'?{member_id:'m1',squad_id:'own',access_role:'member'}:null}}};
  return {bind(squad){assert.equal(squad,'own');return {all:async()=>({results:[{item:'C4',quantity:3}]})}}};
 }}};
}
test('foreign squad cannot read stash or explosives',async()=>{
 for(const path of ['stashes','explosives']){
  const res=await worker.fetch(new Request('https://test/api/'+path+'?squad_id=foreign',{headers:{authorization:'Bearer '+token}}),environment(true));
  assert.equal(res.status,403);
 }
});
test('authorized squad can read explosives',async()=>{
 const res=await worker.fetch(new Request('https://test/api/explosives?squad_id=own',{headers:{authorization:'Bearer '+token}}),environment(true));
 assert.equal(res.status,200);
 assert.deepEqual((await res.json()).items,[{item:'C4',quantity:3}]);
});
test('unlinked Steam user denied',async()=>{
 const res=await worker.fetch(new Request('https://test/api/stashes?squad_id=own',{headers:{authorization:'Bearer '+token}}),environment(false));
 assert.equal(res.status,403);
});
