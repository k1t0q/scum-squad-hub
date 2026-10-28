import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { verifySquadCode } from '../src/code-login-verification.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const encoder=new TextEncoder();
async function hash(s){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function fixture(member={id:'m1',squad_id:'s1',nick:'Player',game_role:'Rifler',access_role:'member'}){
 const pepper='test-pepper',code='sample-secret-code';
 const env={CODE_LOGIN_LIMITER:{async limit(){return {success:true}}},SQUAD_CODE_PEPPER:pepper,DB:{prepare(){return {bind(){return {async all(){return {results:[{...member,invite_code:code}]}}}}}}}};
 const request=(body,origin='https://scum-hub.example')=>new Request('https://scum-hub.example/api/code-login',{method:'POST',headers:{origin,'content-type':'application/json','cf-connecting-ip':'203.0.113.12'},body:JSON.stringify(body)});
 return {env,request,code};
}
test('valid member verification does not create session',async()=>{
 const {env,request,code}=await fixture();
 const r=await verifySquadCode(request({nick:'Player',code,role:'Rifler'}),env);
 assert.equal(r.status,200);
 assert.equal(r.headers.get('set-cookie'),null);
 assert.equal((await r.json()).member.access_role,undefined);
});
test('wrong code is rejected',async()=>{
 const {env,request}=await fixture();
 assert.equal((await verifySquadCode(request({nick:'Player',code:'wrong-code',role:'Rifler'}),env)).status,401);
});
test('shared code cannot authenticate admin',async()=>{
 const {env,request,code}=await fixture({id:'m1',squad_id:'s1',nick:'Player',game_role:'Rifler',access_role:'admin'});
 assert.equal((await verifySquadCode(request({nick:'Player',code,role:'Rifler'}),env)).status,403);
});
test('cross-origin requests are rejected',async()=>{
 const {env,request,code}=await fixture();
 assert.equal((await verifySquadCode(request({nick:'Player',code,role:'Rifler'},'https://attacker.example'),env)).status,403);
});
test('missing secret configuration fails closed',async()=>{
 const {env,request,code}=await fixture();
 delete env.SQUAD_CODE_PEPPER;
 assert.equal((await verifySquadCode(request({nick:'Player',code,role:'Rifler'}),env)).status,503);
});

test('rate limit rejects excess attempts',async()=>{
 const {env,request,code}=await fixture();
 env.CODE_LOGIN_LIMITER={async limit(){return {success:false}}};
 assert.equal((await verifySquadCode(request({nick:'Player',code,role:'Rifler'}),env)).status,429);
});
test('missing rate limiter fails closed',async()=>{
 const {env,request,code}=await fixture();
 delete env.CODE_LOGIN_LIMITER;
 assert.equal((await verifySquadCode(request({nick:'Player',code,role:'Rifler'}),env)).status,503);
});

test('same nickname in different squads uses the matching squad code',async()=>{
 const {env,request,code}=await fixture();
 const original=env.DB.prepare;
 env.DB.prepare=()=>({bind:()=>({all:async()=>({results:[
  {id:'m1',squad_id:'s1',nick:'Player',game_role:'Rifler',access_role:'member',invite_code:'different-code'},
  {id:'m2',squad_id:'s2',nick:'Player',game_role:'Rifler',access_role:'member',invite_code:code}
 ]})})});
 const r=await verifySquadCode(request({nick:'Player',code,role:'Rifler'}),env);
 assert.equal(r.status,200);
 assert.equal((await r.json()).member.squad_id,'s2');
});
test('unknown nickname never grants a session',async()=>{
 const {env,request,code}=await fixture();
 env.DB.prepare=()=>({bind:()=>({all:async()=>({results:[]})})});
 const r=await verifySquadCode(request({nick:'Unknown',code,role:'Rifler'}),env);
 assert.equal(r.status,401);
 assert.equal(r.headers.get('set-cookie'),null);
});
