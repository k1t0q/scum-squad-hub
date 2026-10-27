import test from 'node:test';
import assert from 'node:assert/strict';
import {updateMapMarker} from '../src/map-marker-update.mjs';
const headers={'content-type':'application/json'};
const request=body=>new Request('https://test/api/map-markers',{method:'PATCH',headers,body:JSON.stringify(body)});
const body={id:'marker1',name:'Enemy',note:'Watch'};
test('marker edit is scoped to squad and unlocked markers',async()=>{
 const env={DB:{prepare(sql){assert.match(sql,/WHERE id = \? AND squad_id = \? AND locked = 0/);return {bind(name,note,id,squad){assert.equal(name,'Enemy');assert.equal(note,'Watch');assert.equal(id,'marker1');assert.equal(squad,'own');return {run:async()=>({meta:{changes:1}})};}};}}};
 const res=await updateMapMarker(request(body),env,{memberId:'m1'},'own',headers);
 assert.equal(res.status,200);
});
test('foreign or locked marker cannot be edited',async()=>{
 const env={DB:{prepare(){return {bind(){return {run:async()=>({meta:{changes:0}})}}}}}};
 assert.equal((await updateMapMarker(request(body),env,{memberId:'m1'},'own',headers)).status,404);
});
test('invalid marker edits rejected',async()=>{
 for(const input of [{...body,id:''},{...body,note:'x'.repeat(2001)},{...body,name:null}]){
  assert.equal((await updateMapMarker(request(input),{}, {memberId:'m1'},'own',headers)).status,400);
 }
});
