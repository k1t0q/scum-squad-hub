import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {legacyApi} from '../src/legacy-api.mjs';
function setup(){const sql=new DatabaseSync(':memory:');sql.exec(`
CREATE TABLE squad_map_markers(id TEXT PRIMARY KEY,squad_id TEXT,x REAL,y REAL,type TEXT,name TEXT,note TEXT,show_label INTEGER,enemy_nicks TEXT,locked INTEGER,created_by TEXT,updated_at TEXT);
CREATE TABLE squad_place_posts(id INTEGER PRIMARY KEY,squad_id TEXT,kind TEXT,map_marker_name TEXT,comment TEXT,created_at TEXT,created_by TEXT,stash_checked_at TEXT,stash_checked_by TEXT);
INSERT INTO squad_map_markers VALUES('old','s',.2,.3,'stash','Before','Note',1,'[]',0,'author','2026-10-01T00:00:00Z');
INSERT INTO squad_map_markers VALUES('stash-post-7','s',.2,.3,'stash','Linked','Note',1,'[]',0,'author','2026-10-01T00:00:00Z');
INSERT INTO squad_place_posts VALUES(7,'s','stash','Linked','Note','2026-09-01T00:00:00Z','author','2026-10-03T00:00:00Z','checker');
`);const env={DB:{prepare(q){let args=[];return {bind(...a){args=a;return this},async all(){return {results:sql.prepare(q).all(...args)}},async run(){return {meta:sql.prepare(q).run(...args)}}}}}};return {sql,env,m:{id:'editor',squad_id:'s',access_role:'member'}}}
test('saving a legacy stash edits its name without conversion, new publication or renewed timer',async()=>{
 const {sql,env,m}=setup();for(const name of ['Renamed','Renamed again']){const result=await legacyApi({rpc:'convert_map_marker_to_stash',args:{p_marker:{id:'old',x:.4,y:.5,type:'stash',name,note:'Updated note'}}},env,m);assert.equal(result.existing,true);const row=sql.prepare("SELECT * FROM squad_map_markers WHERE id='old'").get();assert.equal(row.name,name);assert.equal(row.updated_at,'2026-10-01T00:00:00Z');assert.equal(row.created_by,'author');assert.equal(sql.prepare('SELECT count(*) AS n FROM squad_place_posts').get().n,1)}
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
 assert.equal(sql.prepare("SELECT updated_at FROM squad_map_markers WHERE id='old'").get().updated_at,'2026-10-01T00:00:00Z');
 });
