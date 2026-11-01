import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
function setup(){
 let stamp=100000;class Clock extends Date{static now(){return stamp}}
 const feed={innerHTML:''},view={innerHTML:''},messages=[],requests=[],pending=[],intervals=[],listeners={},timeouts=new Map();let timeoutId=0;
 const frame={contentWindow:{postMessage:m=>messages.push(m)}};
 const c={Date:Clock,console:{error(){}},page:'Главная',mapSharedBusy:false,mapSharedRefreshTimer:null,mapPendingDeletes:new Set(),mapPendingSaves:new Map(),onlineMember:{id:'m',squad_id:'s'},isD1HubHost:()=>true,esc:s=>String(s).replaceAll('<','&lt;').replaceAll('>','&gt;'),$:(id)=>id==='#homeEventsBody'?feed:view,document:{visibilityState:'visible',getElementById:id=>id==='homeEventsBody'?feed:frame,contains:node=>node===feed,addEventListener:(name,fn)=>{listeners[name]=fn}},setInterval:(fn,ms)=>{intervals.push({fn,ms});return intervals.length},clearInterval(){},setTimeout:(fn,ms)=>{const id=++timeoutId;timeouts.set(id,{fn,ms});return id},clearTimeout:id=>timeouts.delete(id)};
 c.sb={rpc:async(name)=>{requests.push(name);if(name==='get_squad_map_snapshot')return {data:{markers:[],posts:[],basePosts:[],otherPosts:[]}};return new Promise((resolve,reject)=>pending.push({resolve,reject}))}};
 vm.createContext(c);
 vm.runInContext(app.slice(app.indexOf('function squadMapPage(){'),app.indexOf('function stashMapTitle(')),c);
 const mapStart=app.indexOf('async function refreshSharedMapMarkers()');vm.runInContext(app.slice(mapStart,app.indexOf("window.addEventListener('message'",mapStart)),c);
 vm.runInContext(app.slice(app.indexOf('let homeEventsRead=null'),app.indexOf('async function renderHomePlace()')),c);
 return {c,feed,messages,requests,pending,intervals,listeners,timeouts,advance:ms=>{stamp+=ms},flush:async()=>{for(let i=0;i<8;i++)await Promise.resolve()}};
}
test('hidden map stops periodic and direct reads; returning refreshes immediately then keeps 5s interval',async()=>{
 const t=setup();t.c.page='Карта';t.c.squadMapPage();const timer=t.intervals.find(i=>i.ms===5000);assert.ok(timer);
 t.c.document.visibilityState='hidden';timer.fn();await t.c.refreshSharedMapMarkers();assert.equal(t.requests.length,0);
 t.listeners.visibilitychange();assert.equal(t.requests.length,0);
 t.c.document.visibilityState='visible';t.listeners.visibilitychange();await t.flush();assert.equal(t.requests.length,1);assert.equal(t.messages.length,1);
 timer.fn();await t.flush();assert.equal(t.requests.length,2);
});
test('overlapping feed refreshes use one request and preserve rendered output',async()=>{
 const t=setup();const first=t.c.renderHomeEvents(),second=t.c.renderHomeEvents();assert.equal(t.requests.length,1);
 t.pending[0].resolve({data:[{category:'tasks',title:'New task',body:'Details',created_at:'2026-11-01T12:00:00Z',actor_nick:'Player'}]});await Promise.all([first,second]);assert.match(t.feed.innerHTML,/New task/);assert.match(t.feed.innerHTML,/Details/);assert.equal(t.timeouts.size,0);
 const next=t.c.renderHomeEvents();assert.equal(t.requests.length,2);t.pending[1].resolve({data:[]});await next;assert.match(t.feed.innerHTML,/Пока нет событий/);
});
test('fallback timer skips recently refreshed feed and hidden tab; manual refresh stays immediate',async()=>{
 const t=setup();const p=t.c.renderHomeEvents();t.pending[0].resolve({data:[]});await p;const timer=t.intervals.find(i=>i.ms===60000);assert.ok(timer);
 timer.fn();assert.equal(t.requests.length,1);t.advance(31000);t.c.document.visibilityState='hidden';timer.fn();assert.equal(t.requests.length,1);
 t.c.document.visibilityState='visible';t.listeners.visibilitychange();assert.equal(t.requests.length,2);t.pending[1].resolve({data:[]});await t.flush();timer.fn();assert.equal(t.requests.length,2);
 t.advance(31000);timer.fn();assert.equal(t.requests.length,3);t.pending[2].resolve({data:[]});await t.flush();
});
test('failed and timed-out reads can retry; expired requests release deduplication lock',async()=>{
 const t=setup();let p=t.c.renderHomeEvents();t.pending[0].reject(Error('offline'));await p;assert.match(t.feed.innerHTML,/Не удалось/);assert.equal(t.c.homeEventsFresh(),false);
 p=t.c.renderHomeEvents();for(const timeout of [...t.timeouts.values()])timeout.fn();await p;assert.match(t.feed.innerHTML,/Не удалось/);
 p=t.c.renderHomeEvents();assert.equal(t.requests.length,3);t.pending[2].resolve({data:[]});await p;assert.equal(t.c.homeEventsFresh(),true);
});
test('switching account does not share requests or render an old squad response',async()=>{
 const t=setup();const old=t.c.renderHomeEvents();t.c.onlineMember={id:'other',squad_id:'other'};const fresh=t.c.renderHomeEvents();assert.equal(t.requests.length,2);
 t.pending[1].resolve({data:[]});await fresh;const html=t.feed.innerHTML;t.pending[0].resolve({error:{message:'old failure'}});await old;assert.equal(t.feed.innerHTML,html);assert.equal(t.c.homeEventsFresh(),true);
});
