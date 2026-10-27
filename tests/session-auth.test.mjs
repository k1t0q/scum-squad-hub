import test from 'node:test';
import assert from 'node:assert/strict';
import {verifySession} from '../src/session-auth.mjs';
import worker from '../src/migration-worker.mjs';
const secret='a-long-random-testing-key-with-at-least-32-chars';
const env={SESSION_HMAC_KEY:secret};
function base64url(bytes){return Buffer.from(bytes).toString('base64url')}
async function signed(claims){
 const payload=base64url(JSON.stringify(claims));
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signature=base64url(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(payload)));
 return 'Bearer '+payload+'.'+signature;
}
const now=Math.floor(Date.now()/1000);
test('missing and malformed tokens rejected',async()=>{
 assert.equal(await verifySession(new Request('https://test/api'),env),null);
 assert.equal(await verifySession(new Request('https://test/api',{headers:{authorization:'Bearer abc.xyz'}}),env),null);
});
test('valid signature verifies Steam identity only',async()=>{
 const token=await signed({v:1,sub:'76561198000000000',iat:now,exp:now+300});
 assert.deepEqual(await verifySession(new Request('https://test/api',{headers:{authorization:token}}),env),{steamId:'76561198000000000'});
});
test('expired and forged tokens rejected',async()=>{
 const expired=await signed({v:1,sub:'76561198000000000',iat:now-500,exp:now-100});
 assert.equal(await verifySession(new Request('https://test/api',{headers:{authorization:expired}}),env),null);
 const token=await signed({v:1,sub:'76561198000000000',iat:now,exp:now+300});
 assert.equal(await verifySession(new Request('https://test/api',{headers:{authorization:token.slice(0,-3)+'xyz'}}),env),null);
});
test('even signed users cannot read unimplemented squad API',async()=>{
 const token=await signed({v:1,sub:'76561198000000000',iat:now,exp:now+300});
 const response=await worker.fetch(new Request('https://test/api/squads',{headers:{authorization:token}}),env);
 assert.equal(response.status,501);
});
