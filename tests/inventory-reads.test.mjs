import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
function setup(){
 const requests=[],hosts=new Map([['refExplosiveStrip',{innerHTML:''}],['explosivesBody',{innerHTML:''}]]),labels=new Map();
 const inventory=[{item:'C4',quantity:6},{item:'РПГ',quantity:6},{item:'Граната',quantity:12},{item:'ДИНАМИТ',quantity:6}];
 const c={esc:s=>String(s),sb:{from(){return {select(){return this},eq(_,squad){return new Promise(resolve=>requests.push({squad,resolve}))}}}},onlineMember:{id:'m',squad_id:'s'},window:{},document:{getElementById:id=>hosts.get(id),contains:()=>true,querySelector:s=>{if(!labels.has(s))labels.set(s,{});return labels.get(s)}},$:selector=>hosts.get(selector.slice(1))||({innerHTML:''}),explosivePicker:()=>'<picker>'};
 vm.createContext(c);
 vm.runInContext(source.slice(source.indexOf('let explosiveRead=null;'),source.indexOf('function tasks(){')),c);
 vm.runInContext(source.slice(source.indexOf('function wallWord('),source.indexOf('function scrollExplosive(')),c);
 const resolveAll=(result={data:inventory,error:null})=>requests.forEach(r=>r.resolve(result));
 return {c,requests,resolveAll,inventory,hosts,labels};
}
test('home inventory and wall metric share one request; totals and cards agree',async()=>{
 const {c,requests,resolveAll,hosts}=setup();const a=c.renderRefExplosives(),b=c.refreshWallMetric();
 assert.equal(requests.length,1);resolveAll();await Promise.all([a,b]);
 assert.equal(requests.length,1);assert.equal(c.window.furyWalls,5);
 assert.match(hosts.get('refExplosiveStrip').innerHTML,/ref-expl-items/);
 // No long-lived cache: another refresh always reads current inventory.
 const next=c.refreshWallMetric();assert.equal(requests.length,2);resolveAll({data:[],error:null});await next;assert.equal(c.window.furyWalls,0);
});
test('warehouse page uses its loaded rows for wall count without a second fetch',async()=>{
 const {c,requests,resolveAll,hosts}=setup();const p=c.loadExplosives();assert.equal(requests.length,1);resolveAll();await p;
 assert.equal(requests.length,1);assert.equal(c.window.furyWalls,5);assert.match(hosts.get('explosivesBody').innerHTML,/explosivegrid/);
});
test('errors do not replace totals, retry fetches anew',async()=>{
 const {c,requests,resolveAll}=setup();c.window.furyWalls=9;let p=c.refreshWallMetric();resolveAll({data:null,error:{message:'offline'}});await p;assert.equal(c.window.furyWalls,9);
 p=c.refreshWallMetric();assert.equal(requests.length,2);resolveAll();await p;assert.equal(c.window.furyWalls,5);
});
test('different squad and invalidation do not reuse a pending read',async()=>{
 const {c,requests,resolveAll}=setup();const a=c.readExplosiveInventory();c.onlineMember={id:'n',squad_id:'other'};const b=c.readExplosiveInventory();assert.equal(requests.length,2);c.invalidateExplosiveRead();const d=c.readExplosiveInventory();assert.equal(requests.length,3);resolveAll();await Promise.all([a,b,d]);
});
