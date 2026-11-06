import test from 'node:test';
import assert from 'node:assert/strict';
import {MinimapRoom,validPosition} from '../src/minimap-room.mjs';
const data={x:100,y:-200,z:3,heading:225,age:0};
function fixture(){let ready;const sockets=[];const ctx={getWebSockets:()=>sockets,storage:{get:async()=>[],put:async()=>{}},blockConcurrencyWhile:f=>{ready=f()},waitUntil:p=>{p.catch(()=>{})}};const env={DB:{prepare:()=>({bind:()=>({first:async()=>({id:'a'})})})}};const room=new MinimapRoom(ctx,env);const socket=(id,nick)=>{let a={id,nick,squad:'s1',expires:Date.now()+300000,checked:Date.now(),last:0,position:null};const ws={sent:[],closed:false,serializeAttachment(v){a=structuredClone(v)},deserializeAttachment(){return structuredClone(a)},send(v){this.sent.push(JSON.parse(v))},close(){this.closed=true}};sockets.push(ws);return ws};return {room,socket,ready};}
test('positions validate finite bounds and calibrated heading',()=>{assert.ok(validPosition(data));for(const patch of [{x:Infinity},{y:NaN},{x:2000001},{age:-1},{heading:360}])assert.ok(!validPosition({...data,...patch}));});
test('server owns identity and 100ms updates stay outside D1',async()=>{const f=fixture();await f.ready;const a=f.socket('a','Alice'),b=f.socket('b','Bob');await f.room.webSocketMessage(a,JSON.stringify({...data,id:'fake',nick:'fake',squad:'other'}));const last=b.sent.at(-1);assert.equal(last.peers[0].id,'a');assert.equal(last.peers[0].nick,'Alice');const n=b.sent.length;await f.room.webSocketMessage(a,JSON.stringify({...data,x:999}));assert.equal(b.sent.length,n);assert.equal(f.room.positions()[0].x,999);});
test('sharing off removes position; disconnect keeps last observation',async()=>{const f=fixture();await f.ready;const a=f.socket('a','Alice');await f.room.webSocketMessage(a,JSON.stringify(data));await f.room.webSocketClose(a);assert.equal(f.room.positions().length,1);await f.room.webSocketMessage(a,'{"off":true}');assert.equal(f.room.positions().length,0);});
test('expired session is closed',async()=>{const f=fixture();await f.ready;const a=f.socket('a','Alice');const auth=a.deserializeAttachment();auth.expires=0;a.serializeAttachment(auth);await f.room.webSocketMessage(a,JSON.stringify(data));assert.ok(a.closed);});

test('freshest duplicate wins regardless of socket iteration order',async()=>{
 for(const reverse of [false,true]){
  const f=fixture();await f.ready;
  const sockets=reverse?[f.socket('a','Alice'),f.socket('a','Alice')].reverse():[f.socket('a','Alice'),f.socket('a','Alice')];
  for(const [i,ws] of sockets.entries()){const a=ws.deserializeAttachment();a.position={...data,at:Date.now()-(i?600000:100),x:i?999:111};ws.serializeAttachment(a);}
  const p=f.room.positions();assert.equal(p.length,1);assert.equal(p[0].x,111);assert.ok(Date.now()-p[0].at<1000);
 }
});
test('closing, closed and expired sockets cannot replace active position',async()=>{
 const f=fixture();await f.ready;const active=f.socket('a','Alice');
 let a=active.deserializeAttachment();a.position={...data,at:Date.now()-100,x:111};active.serializeAttachment(a);
 for(const state of [2,3,1]){const old=f.socket('a','Alice');old.readyState=state;let a=old.deserializeAttachment();if(state===1)a.expires=0;a.position={...data,at:Date.now(),x:999};old.serializeAttachment(a);}
 assert.equal(f.room.positions()[0].x,111);
 for(const ws of [active]){ws.readyState=2;const before=ws.sent.length;f.room.send(ws);assert.equal(ws.sent.length,before);}
});

test('acknowledgement advances only after accepting a position, including heartbeat replies',async()=>{
 const f=fixture();await f.ready;const a=f.socket('a','Alice');
 await f.room.webSocketMessage(a,JSON.stringify({...data,seq:17}));
 assert.equal(a.sent.at(-1).protocol,3);assert.equal(a.sent.at(-1).ack,17);
 await f.room.webSocketMessage(a,JSON.stringify({...data,seq:18,x:Infinity}));
 await f.room.webSocketMessage(a,'{"ping":true}');assert.equal(a.sent.at(-1).ack,17);
 assert.equal(a.sent.at(-1).peers[0].x,data.x);
});
test('legacy clients still receive positions without sequence numbers',async()=>{
 const f=fixture();await f.ready;const a=f.socket('a','Alice');await f.room.webSocketMessage(a,JSON.stringify(data));
 assert.equal(a.sent.at(-1).ack,0);assert.equal(a.sent.at(-1).peers[0].x,data.x);
});

test('diagnostic excludes closing connections, deduplicates identities and stays below the old 64KB client limit',async()=>{
 const f=fixture();await f.ready;const a=f.socket('a','Alice');
 for(let i=0;i<2000;i++){const old=f.socket('old-'+i,'Old');old.readyState=2;}
 for(let i=0;i<120;i++){const ws=f.socket('active-'+i,'Я'.repeat(32)),info=ws.deserializeAttachment();info.client={samples:1,failure:'Я'.repeat(80)};ws.serializeAttachment(info);}
 f.room.diagnose(a);const msg=a.sent.at(-1);assert.equal(msg.diagnostic,true);assert.ok(msg.connections.length<=50);assert.equal(msg.truncated,true);assert.ok(Buffer.byteLength(JSON.stringify(msg))<65536);assert.ok(msg.connections.every(c=>c.nick!=='Old'));
});
test('rapid valid updates advance position and ACK even when broadcast is coalesced',async()=>{
 const f=fixture();await f.ready;const a=f.socket('a','Alice');await f.room.webSocketMessage(a,JSON.stringify({...data,seq:1}));await f.room.webSocketMessage(a,JSON.stringify({...data,x:200,seq:2}));
 await f.room.webSocketMessage(a,'{"ping":true}');assert.equal(a.sent.at(-1).ack,2);assert.equal(f.room.positions()[0].x,200);
});
