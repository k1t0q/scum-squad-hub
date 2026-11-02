// One authenticated squad per room. Positions are transient, never written to D1.
export function validPosition(p){return p&&['x','y','z'].every(k=>Number.isFinite(p[k])&&Math.abs(p[k])<=2000000)&&Number.isFinite(p.age)&&p.age>=0&&p.age<=86400000&&(p.heading===null||(Number.isFinite(p.heading)&&p.heading>=0&&p.heading<360));}
export class MinimapRoom {
 constructor(ctx,env){this.ctx=ctx;this.env=env;this.lastBroadcast=0;this.departed=new Map();ctx.blockConcurrencyWhile(async()=>{const saved=await ctx.storage.get('departed');for(const p of saved||[])if(Date.now()-p.at<3600000)this.departed.set(p.id,p);});}
 async fetch(request){
  const id=request.headers.get('x-minimap-member'),squad=request.headers.get('x-minimap-squad'),nick=request.headers.get('x-minimap-nick');
  if(!id||!squad||!nick||request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('Forbidden',{status:403});
  if(this.ctx.getWebSockets().length>=50)return new Response('Room full',{status:429});
  for(const ws of this.ctx.getWebSockets()){const a=ws.deserializeAttachment();if(a.id===id)ws.close(4001,'New connection');}
  const pair=new WebSocketPair(),[client,server]=Object.values(pair);this.ctx.acceptWebSocket(server);
  server.serializeAttachment({id,squad,nick:decodeURIComponent(nick).slice(0,32),expires:Date.now()+300000,checked:Date.now(),last:0,position:null});
  this.send(server);return new Response(null,{status:101,webSocket:client});
 }
 positions(){const peers=new Map(this.departed);for(const ws of this.ctx.getWebSockets()){const a=ws.deserializeAttachment();if(a?.position)peers.set(a.id,{id:a.id,nick:a.nick,...a.position});}return [...peers.values()].filter(p=>Date.now()-p.at<3600000);}
 diagnose(ws){const own=ws.deserializeAttachment();if(!own||Date.now()>own.expires)return;const now=Date.now();ws.send(JSON.stringify({diagnostic:true,now,connections:this.ctx.getWebSockets().map(peer=>{const a=peer.deserializeAttachment();return {nick:a.nick,active:now<a.expires,received:a.received||0,rejected:a.rejected||0,lastPacketAge:a.packetAt?now-a.packetAt:null,positionAge:a.position?now-a.position.at:null,reason:a.reason||null};})}));}
 send(ws){const a=ws.deserializeAttachment();if(!a||Date.now()>a.expires){ws.close(4003,"Reauthenticate");return;}try{ws.send(JSON.stringify({self:a.id,now:Date.now(),peers:this.positions()}));}catch{}}
 async webSocketMessage(ws,message){
  const a=ws.deserializeAttachment(),now=Date.now();if(!a||now>a.expires){ws.close(4003,'Reauthenticate');return;}
  if(typeof message!=='string'||message.length>1024){ws.close(1009,'Invalid packet');return;}
  let p;try{p=JSON.parse(message);}catch{return;}
  if(p?.diagnostic===true){this.diagnose(ws);return;}
  a.received=(a.received||0)+1;a.packetAt=now;
  if(p.off===true){a.position=null;ws.serializeAttachment(a);this.departed.delete(a.id);await this.ctx.storage.put('departed',[...this.departed.values()]);for(const peer of this.ctx.getWebSockets())this.send(peer);return;}
  if(!validPosition(p)){a.rejected=(a.rejected||0)+1;a.reason=['x','y','z','age','heading'].filter(k=>k==='heading'?!(p?.heading===null||(Number.isFinite(p?.heading)&&p.heading>=0&&p.heading<360)):!(Number.isFinite(p?.[k])&&(k==='age'?p[k]>=0&&p[k]<=86400000:Math.abs(p[k])<=2000000))).join(',');ws.serializeAttachment(a);return;}if(now-a.last<90){ws.serializeAttachment(a);return;}
  a.reason=null;
  if(now-a.checked>30000){const member=await this.env.DB.prepare('SELECT id FROM members WHERE id=? AND squad_id=? AND is_active=1').bind(a.id,a.squad).first();if(!member){ws.close(4003,'Membership revoked');return;}a.checked=now;}
  a.last=now;a.position={x:p.x,y:p.y,z:p.z,heading:p.heading,at:now-p.age};ws.serializeAttachment(a);this.departed.delete(a.id);
  if(now-this.lastBroadcast>=100){this.lastBroadcast=now;for(const peer of this.ctx.getWebSockets())this.send(peer);}else if(!this.pendingBroadcast){this.pendingBroadcast=true;this.ctx.waitUntil(new Promise(resolve=>setTimeout(()=>{this.pendingBroadcast=false;this.lastBroadcast=Date.now();for(const peer of this.ctx.getWebSockets())this.send(peer);resolve();},Math.max(1,100-(now-this.lastBroadcast)))));}
 }
 async webSocketClose(ws){const a=ws.deserializeAttachment();if(a?.position){const newer=this.ctx.getWebSockets().some(other=>other!==ws&&other.deserializeAttachment()?.id===a.id);if(!newer){this.departed.set(a.id,{id:a.id,nick:a.nick,...a.position});await this.ctx.storage.put('departed',this.positions());}}}
 webSocketError(ws){ws.close(1011,'Transport error');}
}
