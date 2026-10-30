import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {issueSession} from '../src/issue-session.mjs';
import {verifiedSteamMember} from '../src/steam-hub-member.mjs';
import worker from '../src/migration-worker.mjs';
function setup(){
 const sql=new DatabaseSync(':memory:');
 sql.exec("CREATE TABLE members(id TEXT,squad_id TEXT,nick TEXT,game_role TEXT,access_role TEXT,is_active INTEGER);CREATE TABLE scum_verified_steam_links(steamid TEXT,member_id TEXT,squad_id TEXT);CREATE TABLE squads(id TEXT,name TEXT);INSERT INTO members VALUES('u','a','Player','Sniper','admin',1),('v','b','Private','Rifler','member',1);INSERT INTO squads VALUES('a','ДУБЛЬ'),('b','Private');INSERT INTO scum_verified_steam_links VALUES('76561198000000000','u','a');");
 return {sql,env:{SESSION_HMAC_KEY:'test-steam-key-with-more-than-32-characters',DB:{prepare(q){let args=[];return {bind(...a){args=a;return this},async first(){return sql.prepare(q).get(...args)||null}}}}}};
}
async function request(env,path='/api/steam/profile'){return new Request('https://scum-hub.ru'+path,{headers:{cookie:'scum_steam_session='+await issueSession('76561198000000000',env)}})}
test('verified Steam opens its linked original hub profile, including admin role',async()=>{
 const {env}=setup(),req=await request(env);
 assert.equal((await verifiedSteamMember(req,env)).nick,'Player');
 const r=await worker.fetch(req,env),data=await r.json();
 assert.equal(r.status,200);assert.equal(data.squad.name,'ДУБЛЬ');assert.equal(data.member.squad_id,'a');
 const me=await worker.fetch(await request(env,'/api/member/me'),env);
 assert.equal(me.status,200);assert.equal((await me.json()).member.access_role,'admin');
});
test('inactive and mismatched Steam links do not grant membership',async()=>{
 const {env,sql}=setup(),req=await request(env);
 sql.exec("UPDATE members SET is_active=0 WHERE id='u'");assert.equal(await verifiedSteamMember(req,env),null);
 sql.exec("UPDATE members SET is_active=1;UPDATE scum_verified_steam_links SET squad_id='b'");assert.equal(await verifiedSteamMember(req,env),null);
});
test('anonymous profile never exposes squad data',async()=>{const {env}=setup();assert.equal((await worker.fetch(new Request('https://scum-hub.ru/api/steam/profile'),env)).status,401)});
test('Steam logout rejects cross-origin and clears all login cookies',async()=>{
 const {env}=setup();
 const bad=await worker.fetch(new Request('https://scum-hub.ru/api/steam/logout',{method:'POST',headers:{origin:'https://foreign.test'}}),env);assert.equal(bad.status,403);
 const ok=await worker.fetch(new Request('https://scum-hub.ru/api/steam/logout',{method:'POST',headers:{origin:'https://scum-hub.ru'}}),env);
 assert.equal(ok.status,200);for(const name of ['scum_steam_session','scum_member_session','scum_admin_session'])assert.match(ok.headers.get('set-cookie'),new RegExp(name+'='));
});
