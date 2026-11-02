import test from 'node:test';import assert from 'node:assert/strict';
import {MinimapRoom,safeClientTiming} from '../src/minimap-room.mjs';
test('client timing accepts only bounded counters and no coordinates',()=>{
 const d=safeClientTiming({samples:100,sent:10,received:30,reconnects:2,sampleAge:0,replyAge:100,sending:true,failure:'x'.repeat(200),x:123,y:456,code:'private'});
 assert.equal(d.samples,100);assert.equal(d.failure.length,80);assert.equal(d.x,undefined);assert.equal(d.code,undefined);assert.equal(safeClientTiming([]),null);assert.deepEqual(safeClientTiming({samples:Infinity,sent:-2}),{});
});
test('telemetry heartbeat does not renew a player observation',async()=>{
 const now=Date.now();let a={id:'a',nick:'a',expires:now+300000,position:{x:1,y:2,z:3,heading:null,at:now-10000}};const replies=[];
 const ws={readyState:1,deserializeAttachment:()=>structuredClone(a),serializeAttachment:d=>a=d,send:s=>replies.push(JSON.parse(s))};
 const room=new MinimapRoom({blockConcurrencyWhile:f=>f(),storage:{get:async()=>[]},getWebSockets:()=>[ws]},{});
 await room.webSocketMessage(ws,JSON.stringify({ping:true,client:{samples:100,sampleAge:7}}));
 assert.equal(a.client.samples,100);assert.equal(a.position.at,now-10000);assert.equal(replies[0].peers[0].at,now-10000);assert.equal(a.received,undefined);
});
