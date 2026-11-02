import test from 'node:test';
import assert from 'node:assert/strict';
import {MinimapRoom,validPosition} from '../src/minimap-room.mjs';
const data={x:100,y:-200,z:3,heading:225,age:0};
function fixture(){let ready;const sockets=[];const ctx={getWebSockets:()=>sockets,storage:{get:async()=>[],put:async()=>{}},blockConcurrencyWhile:f=>{ready=f()}};const env={DB:{prepare:()=>({bind:()=>({first:async()=>({id:'a'})})})}};const room=new MinimapRoom(ctx,env);const socket=(id,nick)=>{let a={id,nick,squad:'s1',expires:Date.now()+300000,checked:Date.now(),last:0,position:null};const ws={sent:[],closed:false,serializeAttachment(v){a=structuredClone(v)},deserializeAttachment(){return structuredClone(a)},send(v){this.sent.push(JSON.parse(v))},close(){this.closed=true}};sockets.push(ws);return ws};return {room,socket,ready};}
test('positions validate finite bounds and calibrated heading',()=>{assert.ok(validPosition(data));for(const patch of [{x:Infinity},{y:NaN},{x:2000001},{age:-1},{heading:360}])assert.ok(!validPosition({...data,...patch}));});
test('server owns identity and 100ms updates stay outside D1',async()=>{const f=fixture();await f.ready;const a=f.socket('a','Alice'),b=f.socket('b','Bob');await f.room.webSocketMessage(a,JSON.stringify({...data,id:'fake',nick:'fake',squad:'other'}));const last=b.sent.at(-1);assert.equal(last.peers[0].id,'a');assert.equal(last.peers[0].nick,'Alice');const n=b.sent.length;await f.room.webSocketMessage(a,JSON.stringify({...data,x:999}));assert.equal(b.sent.length,n);assert.equal(f.room.positions()[0].x,100);});
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
