import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/migration-worker.mjs';
import {issueSession} from '../src/issue-session.mjs';
const key='test-secret-for-map-markers-long-enough';
const steam='76561198000000000';
const token=await issueSession(steam,{SESSION_HMAC_KEY:key});
const headers={authorization:'Bearer '+token};
function env(allowed=true){
 return {SESSION_HMAC_KEY:key,DB:{prepare(sql){
  if(sql.includes('scum_verified_steam_links'))return {bind(id,squad){assert.equal(id,steam);return {first:async()=>allowed&&squad==='own'?{member_id:'m1',squad_id:'own',access_role:'member'}:null}}};
  assert.match(sql,/FROM squad_map_markers WHERE squad_id = \?/);
  return {bind(squad){assert.equal(squad,'own');return {all:async()=>({results:[{id:'marker1',name:'Enemy base'}]})}}};
 }}};
}
test('linked squad reads only its markers',async()=>{
 const res=await worker.fetch(new Request('https://test/api/map-markers?squad_id=own',{headers}),env());
 assert.equal(res.status,200);
 assert.deepEqual((await res.json()).items,[{id:'marker1',name:'Enemy base'}]);
});
test('foreign squad markers are forbidden',async()=>{
 const res=await worker.fetch(new Request('https://test/api/map-markers?squad_id=foreign',{headers}),env());
 assert.equal(res.status,403);
});
test('unauthenticated markers access is denied',async()=>{
 const res=await worker.fetch(new Request('https://test/api/map-markers?squad_id=own'),env());
 assert.equal(res.status,401);
});
