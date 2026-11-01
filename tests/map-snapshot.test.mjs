import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {legacyApi} from '../src/legacy-api.mjs';
function setup(){
 const db=new DatabaseSync(':memory:');db.exec(`
 CREATE TABLE members(id TEXT PRIMARY KEY,nick TEXT);
 INSERT INTO members VALUES('m','Author'),('other','Other');
 CREATE TABLE squad_map_markers(id TEXT PRIMARY KEY,squad_id TEXT,x REAL,y REAL,name TEXT,type TEXT,show_label INTEGER,locked INTEGER,enemy_nicks TEXT);
 INSERT INTO squad_map_markers VALUES('custom','s',.2,.3,'Custom','base',1,0,'["rival"]'),('orphan-post','elsewhere',.1,.2,'Private','base',1,0,'[]');
 CREATE TABLE squad_place_posts(id INTEGER PRIMARY KEY,squad_id TEXT,kind TEXT,created_at TEXT,created_by TEXT,comment TEXT,images TEXT,map_marker_name TEXT,stash_checked_at TEXT);
 `);
 let id=1;for(const kind of ['stash','base','other','unrelated'])for(const squad of ['s','elsewhere'])db.prepare('INSERT INTO squad_place_posts VALUES(?,?,?,?,?,?,?,?,?)').run(id++,squad,kind,'2026-11-01','m','Details','["https://ik.imagekit.io/test/photo.jpg"]',kind+' marker','2026-11-01');
 const counts={batches:0,queries:0};
 const env={DB:{prepare(sql){let args=[];return {bind(...v){args=v;return this},async all(){counts.queries++;return {results:db.prepare(sql).all(...args)}}}},async batch(statements){counts.batches++;return Promise.all(statements.map(s=>s.all()))}}};
 return {db,env,counts,member:{id:'m',squad_id:'s',access_role:'member'}};
}
test('combined map snapshot exactly matches all four legacy reads with squad isolation',async()=>{
 const {env,member,counts}=setup();const markers=await legacyApi({rpc:'squad_map_sync',args:{p_action:'list'}},env,member);
 const parts=await Promise.all(['stash','base','other'].map(kind=>legacyApi({rpc:'get_squad_place_posts',args:{p_kind:kind}},env,member)));
 counts.queries=0;const combined=await legacyApi({rpc:'get_squad_map_snapshot',args:{squad_id:'elsewhere'}},env,member);
 assert.deepEqual(combined,{markers,posts:parts[0],basePosts:parts[1],otherPosts:parts[2]});assert.equal(counts.batches,1);assert.equal(counts.queries,2);
 assert.ok([...combined.posts,...combined.basePosts,...combined.otherPosts].every(p=>p.squad_id==='s'&&p.author_nick==='Author'&&p.nick==='Author'&&Array.isArray(p.images)));
});
test('map deletion and creation appear in the next snapshot; query failure rejects whole update',async()=>{
 const {db,env,member}=setup();db.exec("DELETE FROM squad_place_posts WHERE squad_id='s' AND kind='base'; DELETE FROM squad_map_markers WHERE id='custom'; INSERT INTO squad_map_markers VALUES('new','s',.4,.5,'New','stash',1,0,'[]')");
 const snap=await legacyApi({rpc:'get_squad_map_snapshot'},env,member);assert.equal(snap.basePosts.length,0);assert.equal(snap.markers[0].id,'new');
 env.DB.batch=async()=>{throw Error('offline')};await assert.rejects(legacyApi({rpc:'get_squad_map_snapshot'},env,member),/offline/);
});
function client(d1,snapshot,error){
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');const from=app.indexOf('async function refreshSharedMapMarkers()'),to=app.indexOf("window.addEventListener('message'",from);const sent=[],requests=[];
 const context={console:{error(){}},document:{visibilityState:'visible',getElementById:()=>({contentWindow:{postMessage:m=>sent.push(JSON.parse(JSON.stringify(m)))}})},onlineMember:{squad_id:'s'},isD1HubHost:()=>d1,mapSharedBusy:false,mapPendingDeletes:new Set(['deleted']),mapPendingSaves:new Map([['custom',{id:'custom',name:'Local pending edit'}]]),stashCoords:()=>({x:.2,y:.3}),stashMapTitle:p=>p.map_marker_name,sb:{rpc:async(name,args)=>{requests.push({name,args});if(error)return {error};if(name==='get_squad_map_snapshot')return {data:snapshot};return {data:name==='squad_map_sync'?snapshot.markers:snapshot[args.p_kind==='stash'?'posts':args.p_kind==='base'?'basePosts':'otherPosts']}}}};
 vm.createContext(context);vm.runInContext(app.slice(from,to),context);return {context,sent,requests};
}
test('client sends identical map payload with one RPC instead of four and retains pending edits',async()=>{
 const fixture={markers:[{id:'custom',type:'base',name:'Old',x:.1,y:.2},{id:'deleted',type:'base'},{id:'base-post-999',type:'base'}],posts:[],basePosts:[{id:2,kind:'base',comment:'Details',map_marker_name:'Base',author_nick:'Author',images:[]}],otherPosts:[]};
 const old=client(false,fixture),next=client(true,fixture);await old.context.refreshSharedMapMarkers();await next.context.refreshSharedMapMarkers();assert.deepEqual(next.sent,old.sent);assert.equal(old.requests.length,4);assert.equal(next.requests.length,1);assert.equal(next.sent[0].markers.find(m=>m.id==='custom').name,'Local pending edit');assert.ok(!next.sent[0].markers.some(m=>m.id==='deleted'||m.id==='base-post-999'));
});
test('malformed or failed snapshot leaves displayed map untouched and unlocks next refresh',async()=>{
 for(const [snapshot,error] of [[{markers:[]},null],[null,{message:'offline'}]]){const c=client(true,snapshot,error);await c.context.refreshSharedMapMarkers();assert.equal(c.sent.length,0);assert.equal(c.context.mapSharedBusy,false);}
});

