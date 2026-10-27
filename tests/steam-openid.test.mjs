import test from 'node:test';
import assert from 'node:assert/strict';
import { createSteamLoginUrl } from '../src/steam-openid.mjs';
import { verifySteamAssertion } from '../src/steam-verify.mjs';
const origin='https://test.example';
const login=new URL(createSteamLoginUrl(origin,'state123'));
const callback=new URL(login.searchParams.get('openid.return_to'));
callback.searchParams.set('openid.ns','http://specs.openid.net/auth/2.0');
callback.searchParams.set('openid.mode','id_res');
callback.searchParams.set('openid.op_endpoint','https://steamcommunity.com/openid/login');
callback.searchParams.set('openid.return_to',login.searchParams.get('openid.return_to'));
callback.searchParams.set('openid.claimed_id','https://steamcommunity.com/openid/id/76561198000000000');
callback.searchParams.set('openid.identity','https://steamcommunity.com/openid/id/76561198000000000');
const valid=async()=>({ok:true,text:async()=> 'ns:http://specs.openid.net/auth/2.0\nis_valid:true\n'});
test('login redirects to Steam with callback state',()=>{
 assert.equal(login.hostname,'steamcommunity.com');
 assert.equal(login.searchParams.get('openid.mode'),'checkid_setup');
 assert.equal(callback.searchParams.get('state'),'state123');
});
test('Steam verified assertion returns SteamID',async()=>{
 assert.equal(await verifySteamAssertion(callback.toString(),origin,valid),'76561198000000000');
});
test('invalid Steam signature is rejected',async()=>{
 assert.equal(await verifySteamAssertion(callback.toString(),origin,async()=>({ok:true,text:async()=> 'is_valid:false'})),null);
});
test('forged Steam identity is rejected',async()=>{
 const forged=new URL(callback);
 forged.searchParams.set('openid.identity','https://steamcommunity.com/openid/id/76561198000000001');
 assert.equal(await verifySteamAssertion(forged.toString(),origin,valid),null);
});
test('foreign return_to origin is rejected',async()=>{
 const forged=new URL(callback);
 forged.searchParams.set('openid.return_to','https://attacker.example/auth/steam/callback?state=state123');
 assert.equal(await verifySteamAssertion(forged.toString(),origin,valid),null);
});
