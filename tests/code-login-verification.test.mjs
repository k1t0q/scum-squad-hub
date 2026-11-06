import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { verifySquadCode } from '../src/code-login-verification.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const encoder=new TextEncoder();
async function hash(s){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function fixture(member={id:'m1',squad_id:'s1',nick:'Player',game_role:'Rifler',access_role:'member'}){
 const pepper='test-pepper',code='sample-secret-code';
 const env={CODE_LOGIN_LIMITER:{async limit(){return {success:true}}},DB:{prepare(sql){return {bind(){return this},async all(){return {results:sql.includes('FROM squads')?[]:[{...member,invite_code:code}]}}}}}};
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
 delete env.DB;
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
test('unknown nickname with invalid code never grants a session',async()=>{
 const {env,request,code}=await fixture();
 env.DB.prepare=()=>({bind(){return this},all:async()=>({results:[]})});
 const r=await verifySquadCode(request({nick:'Unknown',code:'wrong-code',role:'Rifler'}),env);
 assert.equal(r.status,401);
 assert.equal(r.headers.get('set-cookie'),null);
});
test('valid code registers a new nickname with the chosen role',async()=>{
 const {env,request,code}=await fixture();let inserted;
 env.DB.prepare=sql=>({bind(...args){this.args=args;return this},
  async all(){return {results:sql.includes('FROM members m')?[]:[{id:'s1',invite_code:code}]}},
  async first(){return null},async run(){inserted=this.args;return {meta:{changes:1}}}});
 const response=await verifySquadCode(request({nick:'NewPlayer',code,role:'Builder'}),env);
 assert.equal(response.status,200);
 const data=await response.json();
 assert.equal(data.member.nick,'NewPlayer');assert.equal(data.member.game_role,'Builder');
 assert.equal(data.member.squad_id,'s1');assert.equal(inserted[3],'Builder');
 assert.equal(inserted[4],'member');assert.equal(response.headers.get('set-cookie'),null);
});
test('registration requires role and does not overwrite existing nickname',async()=>{
 const {env,request,code}=await fixture();
 env.DB.prepare=sql=>({bind(){return this},async all(){return {results:sql.includes('FROM members m')?[]:[{id:'s1',invite_code:code}]}},async first(){return {id:'inactive-member'}}});
 assert.equal((await verifySquadCode(request({nick:'NewPlayer',code}),env)).status,400);
 assert.equal((await verifySquadCode(request({nick:'NewPlayer',code,role:'Helper'}),env)).status,409);
});
