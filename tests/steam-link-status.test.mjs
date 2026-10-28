import test from 'node:test';
import assert from 'node:assert/strict';
import {steamLinkStatus} from '../src/steam-link-status.mjs';
const steam='76561198000000000';
const headers={'content-type':'application/json'};
function db(row){
 return {DB:{prepare(sql){
  assert.match(sql,/WHERE l.steamid = \?/);
  assert.match(sql,/m.is_active = 1/);
  return {bind(id){
   assert.equal(id,steam);
   return {first:async()=>row};
  }};
 }}};
}
test('linked Steam sees only its own membership',async()=>{
 const res=await steamLinkStatus(db({member_id:'m1',squad_id:'s1',access_role:'member'}),steam,headers);
 assert.equal(res.status,200);
 assert.deepEqual(await res.json(),{linked:true,member_id:'m1',squad_id:'s1',access_role:'member'});
});
test('unlinked Steam receives no squad data',async()=>{
 const res=await steamLinkStatus(db(null),steam,headers);
 assert.equal(res.status,200);
 assert.deepEqual(await res.json(),{linked:false});
});
test('database unavailable does not pretend unlinked',async()=>{
 const res=await steamLinkStatus({},steam,headers);
 assert.equal(res.status,503);
});
