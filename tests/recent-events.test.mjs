import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {getSquadRecentEvents,mergeRecentEvents} from '../src/recent-events.mjs';
function setup(){const sql=new DatabaseSync(':memory:');sql.exec(`
 CREATE TABLE members(id TEXT,squad_id TEXT,nick TEXT);
 INSERT INTO members VALUES('u','a','k1t0'),('v','b','Private');
 CREATE TABLE hub_achievement_events(squad_id TEXT,member_id TEXT,metric TEXT,event_key TEXT,occurred_at TEXT);
 CREATE TABLE squad_notification_events(id INTEGER,squad_id TEXT,category TEXT,actor_id TEXT,title TEXT,body TEXT,source_key TEXT,created_at TEXT);
 `);const db={prepare(q){let args=[];return {bind(...a){args=a;return this},async all(){return {results:sql.prepare(q).all(...args)}}}}};return {sql,db};}
test('feed reflects actual awarded points, combines stash and map bonus and excludes unknown historical dates',async()=>{
 const {sql,db}=setup();sql.exec(`
 INSERT INTO hub_achievement_events VALUES
 ('a','u','stash','post:10','2026-11-06T12:00:00Z'),
 ('a','u','marker','post:10','2026-11-06T12:00:00Z'),
 ('a','u','ready','2026-11-06','2026-11-06T13:00:00Z'),
 ('a','u','protect','protect:1','2026-11-06T14:00:00Z'),
 ('a','u','task','task:old','0000-unknown'),
 ('b','v','protect','protect:2','2026-11-06T15:00:00Z');
 INSERT INTO squad_notification_events VALUES
 (1,'a','protect_updated','u','ПРОТЕКТ ОБНОВЛЕН','','protect-updated:1','2026-11-06T14:00:01Z'),
 (2,'a','raids','u','План на рейд','','raids:2','2026-11-06T14:10:00Z');
 `);
 const rows=await getSquadRecentEvents(db,'a');assert.equal(rows.length,3);assert.equal(rows[0].title,'План на рейд');assert.equal(rows[1].title,'k1t0 +10 очков');assert.equal(rows[1].body,'За обновление протекта');assert.equal(rows[2].points,15);assert.equal(rows[2].body,'За новый схрон');assert.equal(rows.some(x=>x.actor_nick==='Private'),false);
 assert.deepEqual(await getSquadRecentEvents(db,'a'),rows);assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM hub_achievement_events').get().n,6);
});
test('repeated actions without a new award stay ordinary events, without another points entry',()=>{
 const notices=[{id:1,actor_id:'u',title:'ПРОТЕКТ ОБНОВЛЕН',source_key:'protect-updated:2',created_at:'2026-11-06T14:01:00Z'}];
 const awards=[{actor_id:'u',actor_nick:'k1t0',event_key:'protect:1',points:10,protect:1,created_at:'2026-11-06T14:00:00Z'}];
 const rows=mergeRecentEvents(notices,awards);assert.equal(rows.length,2);assert.equal(rows.filter(x=>x.points).length,1);assert.equal(rows[0].id,1);
});
