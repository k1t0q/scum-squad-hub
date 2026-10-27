import test from 'node:test';
import assert from 'node:assert/strict';
import {createLoginState,verifyLoginState} from '../src/steam-state.mjs';
import {issueSession} from '../src/issue-session.mjs';
import {verifySession} from '../src/session-auth.mjs';
const env={SESSION_HMAC_KEY:'testing-session-key-that-is-long-enough-123456'};
test('login state verifies and expires',async()=>{
 const state=await createLoginState(env);
 assert.equal(await verifyLoginState(state,env),true);
 assert.equal(await verifyLoginState(state.slice(0,-2)+'aa',env),false);
 assert.equal(await verifyLoginState(state,env,Date.now()+301000),false);
});
test('issued Steam session verifies, tampering fails',async()=>{
 const token=await issueSession('76561198000000000',env);
 const request=new Request('https://example.test/api',{headers:{authorization:'Bearer '+token}});
 assert.deepEqual(await verifySession(request,env),{steamId:'76561198000000000'});
 const tampered=new Request('https://example.test/api',{headers:{authorization:'Bearer '+token.slice(0,-3)+'abc'}});
 assert.equal(await verifySession(tampered,env),null);
});
