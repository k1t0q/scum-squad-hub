import test from 'node:test';
import assert from 'node:assert/strict';
import {deleteMapMarker} from '../src/map-marker-delete.mjs';
const headers={'content-type':'application/json'};
const req=body=>new Request('https://test/api/map-markers',{method:'DELETE',headers,body:JSON.stringify(body)});
test('delete only unlocked marker in authenticated squad',async()=>{
 const env={DB:{prepare(sql){assert.match(sql,/DELETE FROM squad_map_markers WHERE id = \? AND squad_id = \? AND locked = 0/);return {bind(id,squad){assert.equal(id,'m1');assert.equal(squad,'own');return {run:async()=>({meta:{changes:1}})}}}}};
 const res=await deleteMapMarker(req({id:'m1',squad_id:'other'}),env,{memberId:'member1'},'own',headers);
 assert.equal(res.status,200);assert.deepEqual(await res.json(),{id:'m1',deleted:true});
});
test('missing or locked marker is not deleted',async()=>{
 const env={DB:{prepare(){return {bind(){return {run:async()=>({meta:{changes:0}})}}}}}};
 assert.equal((await deleteMapMarker(req({id:'locked'}),env,{},'own',headers)).status,404);
});
test('invalid marker id is rejected',async()=>{
 assert.equal((await deleteMapMarker(req({id:''}),{}, {},'own',headers)).status,400);
});
test('database failure is not reported as success',async()=>{
 const env={DB:{prepare(){throw Error('offline')}}};
 assert.equal((await deleteMapMarker(req({id:'m1'}),env,{},'own',headers)).status,503);
});
