import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import {once} from 'node:events';
import {layeroRequest} from '../src/layero-origin.mjs';import {createLayeroServer} from '../scripts/layero-server.mjs';
const origin='https://scumhub.layero.app';
test('public origin leaves direct Cloudflare traffic unchanged and rejects arbitrary hosts',()=>{
 const req=new Request('https://scum-hub.ru/hub');assert.equal(layeroRequest(req).request,req);assert.equal(layeroRequest(req).origin,null);
 for(const value of ['https://evil.example','https://scumhub.layero.app.evil.example','http://scumhub.layero.app','https://scumhub.layero.app/'])assert.throws(()=>layeroRequest(new Request(req,{headers:{'x-scum-public-origin':value}})));
});
test('Layero routing preserves method, origin, cookies, body and complete callback query',async()=>{
 const raw=new Request('https://upstream.example/auth/steam/callback?openid.return_to=abc',{method:'POST',headers:{origin,cookie:'test=session','x-scum-public-origin':origin},body:'test-body'});
 const routed=layeroRequest(raw);assert.equal(routed.origin,origin);assert.equal(routed.request.url,origin+'/auth/steam/callback?openid.return_to=abc');assert.equal(routed.request.headers.get('origin'),origin);assert.equal(routed.request.headers.get('cookie'),'test=session');assert.equal(routed.request.headers.get('x-scum-public-origin'),null);assert.equal(await routed.request.text(),'test-body');
 const tricky=layeroRequest(new Request('https://upstream.example//evil.example/test',{headers:{'x-scum-public-origin':origin}}));assert.equal(new URL(tricky.request.url).origin,origin);
});
async function fixture(t){
 const seen=[];const peers=[];const upstream=http.createServer(async(req,res)=>{
  let body='';for await(const chunk of req)body+=chunk;seen.push({url:req.url,method:req.method,headers:req.headers,body});
  if(req.url==='/redirect'){res.writeHead(302,{location:'https://scum-hub.ru/hub','set-cookie':['a=one; Path=/; Secure; HttpOnly; SameSite=Lax','b=two; Path=/; Secure; HttpOnly; SameSite=Lax']});res.end();return;}
  res.writeHead(req.url==='/api/member/me'?401:200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({ok:true,body}));
 });
 upstream.on('upgrade',(req,socket)=>{peers.push(socket);seen.push({url:req.url,headers:req.headers});socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n');socket.on('data',data=>socket.write(data));});
 upstream.listen(0,'127.0.0.1');await once(upstream,'listening');const gateway=createLayeroServer({upstream:'http://127.0.0.1:'+upstream.address().port});gateway.listen(0,'127.0.0.1');await once(gateway,'listening');
 t.after(async()=>{for(const p of peers)p.destroy();gateway.closeAllConnections();upstream.closeAllConnections();await Promise.all([new Promise(r=>gateway.close(r)),new Promise(r=>upstream.close(r))]);});
 return {base:'http://127.0.0.1:'+gateway.address().port,seen};
}
test('gateway streams API writes and session cookies and supplies a fixed origin',async t=>{
 const f=await fixture(t);const r=await fetch(f.base+'/api/member/login',{method:'POST',headers:{origin,cookie:'test=dummy','x-scum-public-origin':'https://evil.example','content-type':'application/json'},body:'{"nick":"test"}'});
 assert.equal(r.status,200);await r.text();const q=f.seen[0];assert.equal(q.body,'{"nick":"test"}');assert.equal(q.headers.cookie,'test=dummy');assert.equal(q.headers.origin,origin);assert.equal(q.headers['x-scum-public-origin'],origin);
});
test('foreign and missing Origin cannot submit unsafe API writes',async t=>{
 const f=await fixture(t);assert.equal((await fetch(f.base+'/api/member/login',{method:'POST',headers:{origin:'https://evil.example'},body:'test'})).status,403);assert.equal((await fetch(f.base+'/api/member/login',{method:'POST',body:'test'})).status,403);assert.equal(f.seen.length,0);
});
test('redirects and separate cookies are returned on the Layero origin',async t=>{
 const f=await fixture(t);const r=await fetch(f.base+'/redirect',{redirect:'manual'});assert.equal(r.status,302);assert.equal(r.headers.get('location'),origin+'/hub');assert.equal(r.headers.getSetCookie().length,2);assert.ok(r.headers.getSetCookie().every(v=>!v.includes('Domain=')));
});
test('unauthenticated API remains unauthorized, not an HTML fallback',async t=>{
 const f=await fixture(t);const r=await fetch(f.base+'/api/member/me');assert.equal(r.status,401);assert.match(r.headers.get('content-type'),/application\/json/);
});
test('WebSocket upgrade preserves cookies and carries bidirectional bytes',async t=>{
 const f=await fixture(t);const req=http.request(f.base+'/api/minimap/live',{headers:{connection:'Upgrade',upgrade:'websocket',origin,cookie:'test=dummy'}});req.end();
 const [response,socket]=await once(req,'upgrade');assert.equal(response.statusCode,101);socket.write('transport-probe');const [data]=await once(socket,'data');assert.equal(data.toString(),'transport-probe');socket.destroy();assert.equal(f.seen[0].headers['x-scum-public-origin'],origin);assert.equal(f.seen[0].headers.cookie,'test=dummy');
});
