import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {legacyApi} from '../src/legacy-api.mjs';
function setup(){const sql=new DatabaseSync(':memory:');sql.exec(`
CREATE TABLE squad_map_markers(id TEXT PRIMARY KEY,squad_id TEXT,x REAL,y REAL,type TEXT,name TEXT,note TEXT,show_label INTEGER,enemy_nicks TEXT,locked INTEGER,created_by TEXT,updated_at TEXT,icon TEXT,color TEXT,size INTEGER);
CREATE TABLE squad_notification_events(id INTEGER PRIMARY KEY,squad_id TEXT,category TEXT,actor_id TEXT,title TEXT,body TEXT,source_key TEXT,created_at TEXT);
CREATE TABLE squad_place_posts(id INTEGER PRIMARY KEY,squad_id TEXT,kind TEXT,map_marker_name TEXT,comment TEXT,created_at TEXT,created_by TEXT,stash_checked_at TEXT,stash_checked_by TEXT,images TEXT);
INSERT INTO squad_map_markers VALUES('old','s',.2,.3,'stash','Before','Note',1,'[]',0,'author','2026-10-01T00:00:00Z','','',30);
INSERT INTO squad_map_markers VALUES('stash-post-7','s',.2,.3,'stash','Linked','Note',1,'[]',0,'author','2026-10-01T00:00:00Z','','',30);
INSERT INTO squad_place_posts VALUES(7,'s','stash','Linked','Note','2026-09-01T00:00:00Z','author','2026-10-03T00:00:00Z','checker','[]');
`);const env={DB:{async batch(statements){return Promise.all(statements.map(s=>s.run()))},prepare(q){let args=[];return {bind(...a){args=a;return this},async all(){return {results:sql.prepare(q).all(...args)}},async run(){return {meta:sql.prepare(q).run(...args)}}}}}};return {sql,env,m:{id:'editor',squad_id:'s',access_role:'member'}}}
test('legacy stash receives one linked publication without renewing its timer',async()=>{
 const {sql,env,m}=setup();for(const name of ['Renamed','Renamed again']){const result=await legacyApi({rpc:'convert_map_marker_to_stash',args:{p_marker:{id:'old',x:.4,y:.5,type:'stash',name,note:'Updated note'}}},env,m);assert.equal(result.existing,true);const row=sql.prepare("SELECT * FROM squad_map_markers WHERE id='"+result.marker_id+"'").get();assert.equal(row.name,name);assert.equal(row.updated_at,'2026-10-01T00:00:00Z');assert.equal(row.created_by,'author');assert.equal(sql.prepare('SELECT count(*) AS n FROM squad_place_posts').get().n,2)}
});
test('renaming a linked stash preserves check time, checker and creation date; refresh changes only check metadata',async()=>{
 const {sql,env,m}=setup();const before=sql.prepare('SELECT * FROM squad_place_posts WHERE id=7').get();
 await legacyApi({rpc:'squad_map_sync',args:{p_action:'save',p_marker:{id:'stash-post-7',x:.2,y:.3,type:'stash',name:'Renamed',note:'Edited'}}},env,m);
 const after=sql.prepare('SELECT * FROM squad_place_posts WHERE id=7').get();assert.equal(after.map_marker_name,'Renamed');for(const k of ['created_at','stash_checked_at','stash_checked_by'])assert.equal(after[k],before[k]);
 await legacyApi({rpc:'refresh_stash',args:{p_post_id:7}},env,m);const checked=sql.prepare('SELECT * FROM squad_place_posts WHERE id=7').get();assert.notEqual(checked.stash_checked_at,before.stash_checked_at);assert.equal(checked.stash_checked_by,'editor');assert.equal(checked.created_at,before.created_at);
});

 test('PATCH marker endpoint also preserves the legacy stash timer',async()=>{
 const {updateMapMarker}=await import('../src/map-marker-update.mjs');const {sql,env}=setup();
 const request=new Request('https://example/api/map-markers',{method:'PATCH',body:JSON.stringify({id:'old',name:'Via PATCH',note:'Description'})});
 assert.equal((await updateMapMarker(request,env,{},'s',{})).status,200);
 assert.equal(sql.prepare("SELECT updated_at FROM squad_map_markers WHERE id='old'").get().updated_at,'2026-10-01T00:00:00Z','','',30);
 });
 test('new raw stash writes create one publication and retries keep the refreshed deadline',async()=>{
 const {sql,env,m}=setup();
 const input={id:'new-stash',type:'stash',name:'New stash',note:'Details',x:.1,y:.2};
 const [saved]=await legacyApi({table:'squad_map_markers',action:'insert',values:input},env,m);
 assert.match(saved.id,/^stash-post-\d+$/);const id=Number(saved.id.slice(11));
 const post=sql.prepare('SELECT * FROM squad_place_posts WHERE id=?').get(id);assert.equal(post.map_marker_name,'New stash');assert.match(post.comment,/Координаты: X=/);
 await legacyApi({rpc:'refresh_stash',args:{p_post_id:id}},env,m);const checked=sql.prepare('SELECT stash_checked_at FROM squad_place_posts WHERE id=?').get(id).stash_checked_at;
 await legacyApi({table:'squad_map_markers',action:'upsert',values:{...input,name:'Renamed'}},env,m);
 const after=sql.prepare('SELECT * FROM squad_place_posts WHERE id=?').get(id);assert.equal(after.stash_checked_at,checked);assert.equal(after.map_marker_name,'Renamed');assert.equal(sql.prepare("SELECT count(*) AS n FROM squad_notification_events WHERE category='stash'").get().n,1);
 });
 test('transport insertion emits one named event; renaming does not emit another',async()=>{
 const {sql,env,m}=setup();const marker={id:'minimap-car',x:.2,y:.3,type:'vehicle',name:'Pickup',icon:'🚗'};
 await legacyApi({table:'squad_map_markers',action:'insert',values:marker},env,m);
 await legacyApi({table:'squad_map_markers',action:'upsert',values:{...marker,name:'Renamed pickup'}},env,m);
 const events=sql.prepare("SELECT * FROM squad_notification_events WHERE category='transport'").all();assert.equal(events.length,1);assert.equal(events[0].title,'Добавлен транспорт');assert.equal(events[0].body,'Pickup');
 });
 test('locked and foreign legacy stashes cannot be published by another member',async()=>{
 const {sql,env,m}=setup();sql.exec("UPDATE squad_map_markers SET locked=1 WHERE id='old'");
 await assert.rejects(legacyApi({rpc:'convert_map_marker_to_stash',args:{p_marker:{id:'old',type:'stash',x:.2,y:.3,name:'No'}}},env,m),/forbidden/);
 sql.exec("UPDATE squad_map_markers SET locked=0,squad_id='elsewhere' WHERE id='old'");
 await assert.rejects(legacyApi({table:'squad_map_markers',action:'insert',values:{id:'old',type:'stash',x:.2,y:.3,name:'No'}},env,m),/forbidden/);
 assert.equal(sql.prepare('SELECT count(*) AS n FROM squad_place_posts').get().n,1);
 });
 test('Discord-style car publication produces a transport event',async()=>{
 const {sql,env,m}=setup();await legacyApi({table:'squad_place_posts',action:'insert',values:{kind:'other',images:[],comment:'Машина: Pickup\nКоординаты: X=1 Y=2'}},env,m);
 const e=sql.prepare('SELECT category,title FROM squad_notification_events').get();assert.equal(e.category,'transport');assert.equal(e.title,'Добавлен транспорт');
 });
