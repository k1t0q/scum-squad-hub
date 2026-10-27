import test from 'node:test';
import assert from 'node:assert/strict';
import {updateExplosives} from '../src/explosives-update.mjs';
const headers={'content-type':'application/json'};
const request=(data)=>new Request('https://test/api/explosives',{method:'PATCH',headers,body:JSON.stringify(data)});
const member={memberId:'member1',role:'member'};
const admin={memberId:'member1',role:'admin'};
const db={DB:{prepare(sql){assert.match(sql,/WHERE squad_id = \? AND item = \?/);return {bind(q,id,squad,item){assert.equal(q,3);assert.equal(id,'member1');assert.equal(squad,'own');assert.equal(item,'C4');return {run:async()=>({meta:{changes:1}})};}};}}};
test('ordinary member cannot edit inventory',async()=>{
 const response=await updateExplosives(request({item:'C4',quantity:3}),db,member,'own',headers);
 assert.equal(response.status,403);
});
test('admin can update an existing item in own squad',async()=>{
 const response=await updateExplosives(request({item:'C4',quantity:3}),db,admin,'own',headers);
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{item:'C4',quantity:3});
});
test('invalid quantities rejected',async()=>{
 for(const quantity of [-1,1.5,1000001,'3']){
  const response=await updateExplosives(request({item:'C4',quantity}),db,admin,'own',headers);
  assert.equal(response.status,400);
 }
});
test('nonexistent item is not silently created',async()=>{
 const response=await updateExplosives(request({item:'C4',quantity:3}),{DB:{prepare(){return {bind(){return {run:async()=>({meta:{changes:0}})}}}}}},admin,'own',headers);
 assert.equal(response.status,404);
});
