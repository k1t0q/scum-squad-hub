import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {refreshMemberSession} from '../src/refresh-session.mjs';
import {createMemberSession,verifyMemberSession,memberCookie} from '../src/member-session.mjs';
import {createAdminSession,verifyAdminSession,adminCookie} from '../src/admin-code-login.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const member={id:'member-a',squad_id:'squad-a',nick:'Player',access_role:'member'};
const admin={...member,id:'admin-a',nick:'k1t0',access_role:'admin'};
function fixture(who=member){return {MEMBER_SESSION_KEY:'m'.repeat(32),ADMIN_SESSION_KEY:'a'.repeat(32),DB:{prepare(){return {bind(){return {first:async()=>who}}}}}};}
function request(cookie,patch={}){return new Request('https://scum-hub.ru/api/member/refresh',{method:'POST',headers:{origin:'https://scum-hub.ru',cookie},...patch});}
test('active sessions rotate across eight hours without another login',async()=>{
 const original=Date.now;let now=original();Date.now=()=>now;
 try{const env=fixture();let cookie=memberCookie(await createMemberSession(member,env));
  for(let i=0;i<16;i++){now+=30*60*1000;const r=await refreshMemberSession(request(cookie),env);assert.equal(r.status,200);cookie=r.headers.get('set-cookie');assert.match(cookie,/HttpOnly; Secure; SameSite=Lax/);assert.deepEqual(await verifyMemberSession(request(cookie),env),member);}
 }finally{Date.now=original;}
});
test('administrator renewal retains admin scope and identity',async()=>{const env=fixture(admin);const cookie=adminCookie(await createAdminSession(admin,env));const r=await refreshMemberSession(request(cookie),env);assert.equal(r.status,200);const renewed=r.headers.get('set-cookie');assert.match(renewed,/^scum_admin_session=/);assert.deepEqual(await verifyAdminSession(request(renewed),env),admin);assert.equal(await verifyMemberSession(request(renewed),env),null);});
test('expired, tampered, missing and revoked sessions cannot renew',async()=>{const env=fixture();const old=memberCookie(await createMemberSession(member,env,Math.floor(Date.now()/1000)-3601));assert.equal((await refreshMemberSession(request(old),env)).status,401);assert.equal((await refreshMemberSession(request('scum_member_session=invalid'),env)).status,401);assert.equal((await refreshMemberSession(request(''),env)).status,401);const current=memberCookie(await createMemberSession(member,env));assert.equal((await refreshMemberSession(request(current),fixture(null))).status,401);});
test('renewal rejects foreign origins and GET requests',async()=>{const env=fixture();const cookie=memberCookie(await createMemberSession(member,env));assert.equal((await refreshMemberSession(request(cookie,{headers:{origin:'https://other.example',cookie}}),env)).status,403);assert.equal((await refreshMemberSession(request(cookie,{method:'GET'}),env)).status,405);});
