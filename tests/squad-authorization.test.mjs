import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizeSquad} from '../src/squad-authorization.mjs';
const steam='76561198000000000';
function database(row) {
 return {DB:{prepare(sql){
  assert.match(sql,/m\.is_active = 1/);
  return {bind(id,squad){assert.equal(id,steam);return {first:async()=>row?.squad_id===squad?row:null}}};
 }}};
}
test('valid linked member is authorized for own squad',async()=>{
 assert.deepEqual(await authorizeSquad(database({member_id:'m1',squad_id:'s1',access_role:'member'}),steam,'s1'),{memberId:'m1',squadId:'s1',role:'member'});
});
test('cross-squad access is rejected',async()=>{
 assert.equal(await authorizeSquad(database({member_id:'m1',squad_id:'s1'}),steam,'s2'),null);
});
test('missing mapping and DB failures deny access',async()=>{
 assert.equal(await authorizeSquad(database(null),steam,'s1'),null);
 assert.equal(await authorizeSquad({DB:{prepare(){throw Error('table missing')}}},steam,'s1'),null);
 assert.equal(await authorizeSquad({},steam,'s1'),null);
});
