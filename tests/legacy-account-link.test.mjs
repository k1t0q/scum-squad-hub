import test from 'node:test';
import assert from 'node:assert/strict';
import {linkLegacyAccount} from '../src/legacy-account-link.mjs';
const headers={'content-type':'application/json'};
const req=token=>new Request('https://worker.example/api/link-legacy-account',{method:'POST',headers,body:JSON.stringify({legacy_access_token:token})});
const token='valid-legacy-session-token-for-testing';
const steam='76561198000000000';
function env(changes=1){
 return {LEGACY_SUPABASE_URL:'https://legacy.example/',LEGACY_SUPABASE_ANON_KEY:'public-key',DB:{prepare(sql){
  if(sql.startsWith('SELECT'))return {bind:()=>({first:async()=>({id:'member-1'})})};
  assert.match(sql,/m\.user_id = \?/);
  assert.match(sql,/NOT EXISTS/);
  return {bind:(...args)=>{assert.deepEqual(args,[steam,'user-1',steam,'member-1','user-1']);return {run:async()=>({meta:{changes}})}}};
 }}};
}
const verified=async()=>({ok:true,json:async()=>({id:'user-1'})});
test('verified legacy user may link to Steam once',async()=>{
 const res=await linkLegacyAccount(req(token),env(),steam,headers,verified);
 assert.equal(res.status,201);assert.deepEqual(await res.json(),{linked:true});
});
test('duplicate Steam or member link is refused',async()=>{
 assert.equal((await linkLegacyAccount(req(token),env(0),steam,headers,verified)).status,409);
});
test('invalid legacy session cannot link',async()=>{
 let queried=false;
 const e=env();
 const res=await linkLegacyAccount(req(token),e,steam,headers,async()=>{queried=true;return {ok:false}});
 assert.equal(res.status,401);assert.equal(queried,true);
});
test('missing legacy configuration refuses link',async()=>{
 assert.equal((await linkLegacyAccount(req(token),{},steam,headers,verified)).status,503);
});
