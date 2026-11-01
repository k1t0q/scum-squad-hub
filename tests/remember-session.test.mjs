import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createMemberSession,verifyMemberSession,memberCookie} from '../src/member-session.mjs';
import {createAdminSession,verifyAdminSession,adminCookie} from '../src/admin-code-login.mjs';
import {issueSession} from '../src/issue-session.mjs';
import {verifySession} from '../src/session-auth.mjs';
import {rollingSessionHeaders} from '../src/refresh-session.mjs';
import {SESSION_SECONDS,steamCookie,sessionNeedsRenewal} from '../src/session-duration.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const member={id:'member-a',squad_id:'squad-a',nick:'Player',access_role:'member'};
const admin={...member,id:'admin-a',nick:'k1t0',access_role:'admin'};
function fixture(who=member){return {MEMBER_SESSION_KEY:'m'.repeat(32),ADMIN_SESSION_KEY:'a'.repeat(32),SESSION_HMAC_KEY:'s'.repeat(32),DB:{prepare(){return {bind(){return {first:async()=>who}}}}}};}
const request=cookie=>new Request('https://scum-hub.ru/api/member/me',{headers:{cookie}});
const claims=cookie=>JSON.parse(Buffer.from(cookie.split('=')[1].split('.')[0],'base64url').toString());
const cases=[['member',member,createMemberSession,memberCookie,verifyMemberSession],['admin',admin,createAdminSession,adminCookie,verifyAdminSession],['Steam','76561198000000000',issueSession,steamCookie,verifySession]];
for(const [name,identity,issue,cookie,verify] of cases){
 test(name+' stays signed in after 29 days, renews to 30 days, expires without activity',async()=>{
  const realNow=Date.now;let now=realNow();Date.now=()=>now;
  try{const env=fixture(typeof identity==='object'?identity:member);const token=await issue(identity,env);let saved=cookie(token);assert.equal(claims(saved).exp-claims(saved).iat,SESSION_SECONDS);assert.match(saved,/Max-Age=2592000/);
   now+=29*86400000;assert.ok(await verify(request(saved),env));const h=await rollingSessionHeaders(request(saved),env,{'cache-control':'no-store'});const next=h.get('set-cookie');assert.ok(next);assert.equal(claims(next).exp,Math.floor(now/1000)+SESSION_SECONDS);assert.ok(await verify(request(next),env));
   now+=2*86400000;assert.equal(await verify(request(saved),env),null);assert.ok(await verify(request(next),env));
  }finally{Date.now=realNow;}
 });
}
test('existing one-hour member login upgrades without asking for its code',async()=>{
 const env=fixture(),now=Math.floor(Date.now()/1000);const data={v:1,mid:member.id,sid:member.squad_id,iat:now,exp:now+3600};const p=Buffer.from(JSON.stringify(data)).toString('base64url');const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.MEMBER_SESSION_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign']);const sig=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(p))).toString('base64url');const req=request(memberCookie(p+'.'+sig));assert.ok(await verifyMemberSession(req,env));const next=(await rollingSessionHeaders(req,env,{})).get('set-cookie');assert.equal(claims(next).exp-claims(next).iat,SESSION_SECONDS);
});
test('fresh remembered sessions add no renewal database reads',async()=>{const env=fixture();const saved=memberCookie(await createMemberSession(member,env));env.DB.prepare=()=>{throw Error('Redundant database read');};const headers={'cache-control':'no-store'};assert.equal(sessionNeedsRenewal(request(saved)),false);assert.equal(await rollingSessionHeaders(request(saved),env,headers),headers);});
test('removed member or downgraded admin cannot renew an old remembered session',async()=>{const now=Math.floor(Date.now()/1000)-86400;const env=fixture();const saved=memberCookie(await createMemberSession(member,env,now));assert.equal((await rollingSessionHeaders(request(saved),fixture(null),{})).get('set-cookie'),null);const a=adminCookie(await createAdminSession(admin,fixture(admin),now));assert.equal((await rollingSessionHeaders(request(a),fixture(null),{})).get('set-cookie'),null);});
test('unsigned renewal hints grant no identity and produce no cookie',async()=>{const payload=Buffer.from(JSON.stringify({v:1,mid:member.id,sid:member.squad_id,iat:1,exp:3601})).toString('base64url');const req=request('scum_member_session='+payload+'.invalid');assert.equal((await rollingSessionHeaders(req,fixture(),{})).get('set-cookie'),null);});
