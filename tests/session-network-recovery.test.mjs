import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const start=source.indexOf('async function syncOnline(){');
const end=source.indexOf('async function bootOnline(){',start);
function fixture(result){let exits=0,removed=0;const state={sb:{rpc:async()=>result,auth:{signOut:async()=>{exits++;}}},onlineMember:{id:'m'},isD1HubHost:()=>true,toast:()=>{},localStorage:{removeItem:()=>{removed++;}},K:'profile',document:{documentElement:{classList:{add:()=>{}}}},authScreen:()=>{}};vm.createContext(state);vm.runInContext(source.slice(start,end),state);return {state,exits:()=>exits,removed:()=>removed};}
test('network and database failures keep the remembered login and profile',async()=>{for(const message of ['Failed to fetch','database_error','HTTP 503']){const f=fixture({error:{message},data:null});await f.state.syncOnline();assert.equal(f.exits(),0);assert.equal(f.removed(),0);assert.equal(f.state.onlineMember.id,'m');}});
test('expired or revoked access still clears local authenticated state',async()=>{for(const result of [{error:{message:'unauthorized'},data:null},{error:null,data:{id:'m',is_active:false}}]){const f=fixture(result);await f.state.syncOnline();assert.equal(f.exits(),1);assert.equal(f.removed(),1);assert.equal(f.state.onlineMember,null);}});
