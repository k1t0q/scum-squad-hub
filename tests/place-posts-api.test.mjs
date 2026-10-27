import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/migration-worker.mjs';
import {issueSession} from '../src/issue-session.mjs';
const key='test-place-posts-key-long-enough-for-hmac';
const token=await issueSession('76561198000000000',{SESSION_HMAC_KEY:key});
const headers={authorization:'Bearer '+token};
function env(){
 return {SESSION_HMAC_KEY:key,DB:{prepare(sql){
  if(sql.includes('scum_verified_steam_links'))return {bind(id,squad){return {first:async()=>squad==='own'?{member_id:'m1',squad_id:'own',access_role:'member'}:null}}};
  assert.match(sql,/WHERE squad_id = \? AND kind = \?/);
  return {bind(squad,kind){assert.equal(squad,'own');assert.equal(kind,'stash');return {all:async()=>({results:[{id:5,kind:'stash',images:'["https://example.com/pic.jpg"]'}]})}}};
 }}};
}
test('place posts decode D1 JSON images for own squad',async()=>{
 const res=await worker.fetch(new Request('https://test/api/place-posts?squad_id=own&kind=stash',{headers}),env());
 assert.equal(res.status,200);
 assert.deepEqual((await res.json()).items[0].images,['https://example.com/pic.jpg']);
});
test('foreign squad cannot read posts',async()=>{
 const res=await worker.fetch(new Request('https://test/api/place-posts?squad_id=other&kind=stash',{headers}),env());
 assert.equal(res.status,403);
});
test('unrecognized post kind rejected',async()=>{
 const res=await worker.fetch(new Request('https://test/api/place-posts?squad_id=own&kind=secret',{headers}),env());
 assert.equal(res.status,400);
});
test('unauthenticated requests rejected',async()=>{
 const res=await worker.fetch(new Request('https://test/api/place-posts?squad_id=own&kind=stash'),env());
 assert.equal(res.status,401);
});
