import test from 'node:test';
import assert from 'node:assert/strict';
import {checkStash} from '../src/stash-update.mjs';
const headers={'content-type':'application/json'};
const membership={memberId:'m1',role:'member'};
const request=(body)=>new Request('https://test/api/stashes/check',{method:'POST',headers,body:JSON.stringify(body)});
test('stash check-in records author and 14-day expiration',async()=>{
 const env={DB:{prepare(sql){assert.match(sql,/WHERE id = \? AND squad_id = \? AND kind = 'stash'/);return {bind(time,member,id,squad){assert.equal(member,'m1');assert.equal(id,15);assert.equal(squad,'own');return {run:async()=>({meta:{changes:1}})};}};}}};
 const response=await checkStash(request({id:15}),env,membership,'own',headers);
 assert.equal(response.status,200);
 const result=await response.json();
 assert.equal(Date.parse(result.expires_at)-Date.parse(result.stash_checked_at),14*86400000);
 assert.equal(result.stash_checked_by,'m1');
});
test('invalid stash ID is rejected',async()=>{
 for(const id of [-1,0,'15',1.5]){
  const response=await checkStash(request({id}),{},membership,'own',headers);
  assert.equal(response.status,400);
 }
});
test('missing or foreign stash cannot be updated',async()=>{
 const env={DB:{prepare(){return {bind(){return {run:async()=>({meta:{changes:0}})}}}}}};
 const response=await checkStash(request({id:15}),env,membership,'own',headers);
 assert.equal(response.status,404);
});
