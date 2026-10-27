import test from 'node:test';
import assert from 'node:assert/strict';
import {createMapMarker} from '../src/map-marker-create.mjs';
const headers={'content-type':'application/json'};
const request=body=>new Request('https://test/api/map-markers',{method:'POST',headers,body:JSON.stringify(body)});
const member={memberId:'m1'};
const valid={x:25,y:75,name:'Enemy base',note:''};
test('marker creation writes only to authenticated squad',async()=>{
 const env={DB:{prepare(sql){assert.match(sql,/INSERT INTO squad_map_markers/);return {bind(id,squad,x,y,type,name,note){assert.equal(squad,'own');assert.equal(x,25);assert.equal(y,75);assert.equal(type,'enemy_base');assert.equal(name,'Enemy base');return {run:async()=>({success:true})};}};}}};
 const res=await createMapMarker(request(valid),env,member,'own',headers);
 assert.equal(res.status,201);
 assert.equal((await res.json()).squad_id,'own');
});
test('coordinates outside map rejected',async()=>{
 for(const input of [{...valid,x:-1},{...valid,y:101},{...valid,x:'25'},{...valid,name:''}]){
  assert.equal((await createMapMarker(request(input),{},member,'own',headers)).status,400);
 }
});
test('database error does not claim marker created',async()=>{
 const res=await createMapMarker(request(valid),{DB:{prepare(){throw Error('offline')}}},member,'own',headers);
 assert.equal(res.status,503);
});
