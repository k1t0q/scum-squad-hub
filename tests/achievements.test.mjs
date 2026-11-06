import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {buildAchievements,getSquadAchievements,leaderboardBoundaries} from '../src/achievements.mjs';
import {legacyApi} from '../src/legacy-api.mjs';
const migration=readFileSync(new URL('../migrations/20261106_achievements.sql',import.meta.url),'utf8');
function setup(seed=''){
 const sql=new DatabaseSync(':memory:');sql.exec(`
 CREATE TABLE members(id TEXT PRIMARY KEY,squad_id TEXT,nick TEXT,is_active INTEGER);
 INSERT INTO members VALUES('u','a','Player',1),('v','a','Other',1),('x','b','Private',1);
 CREATE TABLE presence_history(id INTEGER PRIMARY KEY,squad_id TEXT,member_id TEXT,day TEXT,status TEXT,updated_at TEXT);
 CREATE TABLE squad_place_posts(id INTEGER PRIMARY KEY,squad_id TEXT,kind TEXT,created_by TEXT,created_at TEXT,comment TEXT,stash_checked_by TEXT,stash_checked_at TEXT,map_marker_name TEXT,images TEXT);
 CREATE TABLE squad_map_markers(id TEXT PRIMARY KEY,squad_id TEXT,type TEXT,created_by TEXT,updated_at TEXT,x NUMERIC,y NUMERIC,name TEXT,note TEXT,locked INTEGER,icon TEXT,color TEXT,size NUMERIC,show_label INTEGER,enemy_nicks TEXT);
 CREATE TABLE protect_updates(id INTEGER PRIMARY KEY,squad_id TEXT,member_id TEXT,updated_at TEXT);
 CREATE TABLE tasks(id INTEGER PRIMARY KEY,squad_id TEXT,assignee_id TEXT,status TEXT,created_at TEXT);
 ${seed}`);sql.exec(migration);
 const DB={prepare(q){let args=[];return {bind(...a){args=a;return this},async all(){return {results:sql.prepare(q).all(...args)}},async run(){return {meta:sql.prepare(q).run(...args)}}}},async batch(statements){return statements.map(s=>s.all()).reduce(async(p,r)=>[...await p,await r],Promise.resolve([]))}};
 return {sql,DB,count:(metric)=>sql.prepare('SELECT COUNT(*) AS n FROM hub_achievement_events WHERE metric=?').get(metric).n};
}
test('presence toggles and repeated updates count once; answers and willing days are independent',()=>{
 const {sql,count}=setup();sql.exec("INSERT INTO presence_history VALUES(1,'a','u','2026-11-06','Не буду','2026-11-06T12:00:00Z');UPDATE presence_history SET status='Буду';UPDATE presence_history SET status='Под вопросом';UPDATE presence_history SET status='Буду'");assert.equal(count('presence'),1);assert.equal(count('ready'),1);
 sql.exec("DELETE FROM presence_history;INSERT INTO presence_history VALUES(2,'a','u','2026-11-06','Буду','2026-11-06T13:00:00Z')");assert.equal(count('presence'),1);
});
test('one stash check per Moscow day across all members; deletion preserves progress',()=>{
 const {sql,count}=setup();sql.exec("INSERT INTO squad_place_posts(id,squad_id,kind,created_by,created_at) VALUES(1,'a','stash','u','2026-11-05T12:00:00Z');UPDATE squad_place_posts SET stash_checked_at='2026-11-06T20:59:00Z',stash_checked_by='u';UPDATE squad_place_posts SET stash_checked_at='2026-11-06T20:59:30Z',stash_checked_by='v';UPDATE squad_place_posts SET stash_checked_at='2026-11-06T21:01:00Z',stash_checked_by='v'");assert.equal(count('refresh'),2);assert.equal(count('stash'),1);assert.equal(count('marker'),1);sql.exec('DELETE FROM squad_place_posts');assert.equal(count('refresh'),2);assert.equal(count('stash'),1);
});
test('home feed posts and canonical marker copies do not inflate map counters',()=>{
 const {sql,count}=setup();sql.exec("INSERT INTO squad_place_posts(id,squad_id,kind,created_by) VALUES(1,'a','home','u'),(2,'a','stash','u');INSERT INTO squad_map_markers(id,squad_id,type,created_by) VALUES('stash-post-2','a','stash','u'),('car','a','vehicle','u');UPDATE squad_map_markers SET created_by='v' WHERE id='car'");assert.equal(count('marker'),2);assert.equal(count('stash'),1);assert.equal(count('vehicle'),1);
});
test('task reopening and reassignment cannot award the same task twice',()=>{
 const {sql,count}=setup();sql.exec("INSERT INTO tasks VALUES(1,'a','u','В процессе','2026-11-01');UPDATE tasks SET status='Выполнено';UPDATE tasks SET assignee_id='v';UPDATE tasks SET status='В процессе';UPDATE tasks SET status='Выполнено'");assert.equal(count('task'),1);assert.equal(sql.prepare("SELECT member_id FROM hub_achievement_events WHERE metric='task'").get().member_id,'u');
});
test('protect ignores repeated presses within a full nine-hour cycle',()=>{
 const {sql,count}=setup();sql.exec("INSERT INTO protect_updates VALUES(1,'a','u','2026-11-06T00:00:00Z'),(2,'a','u','2026-11-06T08:59:59Z'),(3,'a','u','2026-11-06T09:00:00Z')");assert.equal(count('protect'),2);
});
test('historical seed is idempotent and credits known actors only',()=>{
 const {sql,count}=setup("INSERT INTO squad_place_posts(id,squad_id,kind,created_by) VALUES(1,'a','stash','u'),(2,'a','stash','x');INSERT INTO tasks VALUES(1,'a','u','Выполнено','2026-01-01');");sql.exec(migration);assert.equal(count('stash'),1);assert.equal(count('task'),1);assert.equal(sql.prepare("SELECT occurred_at FROM hub_achievement_events WHERE metric='task'").get().occurred_at,'0000-unknown');
});
test('best streak and five levels survive a later missed day; collection excludes itself',()=>{
 const events=Array.from({length:15},(_,i)=>{const day=new Date(Date.UTC(2026,0,i<14?i+1:20)).toISOString().slice(0,10);return {member_id:'u',metric:'presence',event_key:day,occurred_at:day+'T12:00:00Z'}});
 const p=buildAchievements([{id:'u',nick:'Player'}],events).members[0].items;assert.equal(p.steady.value,14);assert.equal(p.steady.level,2);assert.equal(p.connected.level,1);assert.equal(p.collector.value,0);
});
test('rankings use current Moscow day, Monday and month boundaries, and isolate squads',async()=>{
 const {sql,DB}=setup();sql.exec("INSERT INTO presence_history VALUES(1,'a','u','2026-11-06','Буду','2026-11-05T21:00:00Z'),(2,'b','x','2026-11-06','Буду','2026-11-05T21:01:00Z');INSERT INTO tasks VALUES(1,'a','u','В процессе','2026-11-05');UPDATE tasks SET status='Выполнено';UPDATE hub_achievement_events SET occurred_at='2026-11-06T12:00:00Z' WHERE metric='task';");
 const snapshot=await getSquadAchievements(DB,'a',new Date('2026-11-06T20:00:00Z'));assert.equal(snapshot.members.length,2);assert.equal(snapshot.leaderboard.find(x=>x.id==='u').day,22);assert.equal(snapshot.leaderboard.some(x=>x.id==='x'),false);assert.deepEqual(leaderboardBoundaries(new Date('2026-11-01T22:00:00Z')),{day:'2026-11-01T21:00:00.000Z',week:'2026-11-01T21:00:00.000Z',month:'2026-10-31T21:00:00.000Z'});
 const rpc=await legacyApi({rpc:'get_squad_achievements',args:{squad_id:'b'}},{DB},{squad_id:'a',id:'u'});assert.equal(rpc.members.some(x=>x.id==='x'),false);
});
test('four added cards derive Moscow days, Monday weeks, distinct activities and weighted points',()=>{
 const rows=[
  ['presence','2026-11-01T20:59:00Z'],['marker','2026-11-01T21:01:00Z'],
  ['stash','2026-11-02T12:00:00Z'],['refresh','2026-11-02T13:00:00Z'],
  ['vehicle','2026-11-02T14:00:00Z'],['enemy','2026-11-02T15:00:00Z'],
  ['protect','2026-11-02T16:00:00Z'],['task','2026-11-02T17:00:00Z'],
  ['ready','2026-11-02T18:00:00Z'],['task','0000-unknown'],
 ].map(([metric,occurred_at],i)=>({member_id:'u',metric,occurred_at,event_key:String(i)}));
 const data=buildAchievements([{id:'u',nick:'Player'}],rows),p=data.members[0].items;
 assert.equal(data.definitions.length,15);assert.equal(data.definitions.at(-1).id,'collector');assert.equal(p.collector.max,14);
 assert.equal(p.regular.value,2);assert.equal(p.rhythm.value,2);assert.equal(p.versatile.value,8);assert.equal(p.versatile.level,5);assert.equal(p.contributor.value,70);
});
