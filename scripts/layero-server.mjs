import http from 'node:http';
import https from 'node:https';
import {pathToFileURL} from 'node:url';

const publicOrigin='https://scumhub.layero.app';
const hop=new Set(['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','transfer-encoding','upgrade']);
export function createLayeroServer({upstream='https://scum-hub-migration.nikitinrf.workers.dev',origin=publicOrigin}={}){
 const base=new URL(upstream),allowedOrigin=new URL(origin).origin;
 if(!['http:','https:'].includes(base.protocol))throw Error('Invalid upstream');
 const transport=base.protocol==='https:'?https:http;
 const agent=base.protocol==='https:'?new https.Agent({keepAlive:true,maxSockets:64}):new http.Agent({keepAlive:true,maxSockets:64});
 function reject(req){return req.headers.origin===undefined?!['GET','HEAD','OPTIONS'].includes(req.method):req.headers.origin!==allowedOrigin;}
 function headersFor(req,upgrade=false){
  const headers={};const connectionHeaders=String(req.headers.connection||'').toLowerCase().split(',').map(s=>s.trim());
  for(const [name,value] of Object.entries(req.headers))if(!hop.has(name)&&!connectionHeaders.includes(name)&&!['host','forwarded','x-forwarded-host','x-forwarded-proto','x-scum-public-origin'].includes(name))headers[name]=value;
  headers.host=base.host;headers['x-scum-public-origin']=allowedOrigin;
  if(upgrade){headers.connection='Upgrade';headers.upgrade='websocket';}
  return headers;
 }
 function target(req){if(!req.url?.startsWith('/')||req.url.startsWith('//'))throw Error('Invalid path');return new URL(base.origin+req.url);}
 function failure(res){if(!res.headersSent)res.writeHead(502,{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'});res.end('Сервер HUB временно недоступен. Попробуй ещё раз.');}
 const server=http.createServer((req,res)=>{
  if(req.url==='/_layero/health'){res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end('{"ok":true,"service":"scum-hub-layero"}');return;}
  if(req.headers.host==='scumhub.layero.dev'){res.writeHead(308,{location:allowedOrigin+req.url});res.end();return;}
  if(reject(req)){res.writeHead(403,{'cache-control':'no-store'});res.end('Forbidden origin');return;}
  let url;try{url=target(req);}catch{res.writeHead(400);res.end('Invalid path');return;}
  const out=transport.request(url,{method:req.method,headers:headersFor(req),agent},incoming=>{
   const headers={};for(const [key,value] of Object.entries(incoming.headers))if(!hop.has(key))headers[key]=value;
   // Cookies have no Domain attribute upstream, so they belong to the Layero host.
   if(headers.location){try{const redirect=new URL(headers.location,url);if(redirect.origin===base.origin||redirect.origin==='https://scum-hub.ru')headers.location=allowedOrigin+redirect.pathname+redirect.search+redirect.hash;}catch{}}
   res.writeHead(incoming.statusCode||502,headers);incoming.on('error',()=>res.destroy());incoming.pipe(res);
  });
  out.setTimeout(30000,()=>out.destroy(new Error('Upstream timeout')));
  out.on('error',()=>failure(res));req.on('aborted',()=>out.destroy());res.on('close',()=>{if(!res.writableFinished)out.destroy();});req.pipe(out);
 });
 server.on('upgrade',(req,socket,head)=>{
  if(reject(req)||req.headers.upgrade?.toLowerCase()!=='websocket'){socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}
  let url;try{url=target(req);}catch{socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');return;}
  const out=transport.request(url,{method:'GET',headers:headersFor(req,true),agent:false});
  out.setTimeout(15000,()=>out.destroy(new Error('Upgrade timeout')));
  out.on('upgrade',(response,peer,peerHead)=>{
   out.setTimeout(0);peer.setTimeout(0);socket.setTimeout(0);peer.setNoDelay(true);socket.setNoDelay(true);
   let raw='HTTP/1.1 101 Switching Protocols\r\n';for(let i=0;i<response.rawHeaders.length;i+=2)raw+=response.rawHeaders[i]+': '+response.rawHeaders[i+1]+'\r\n';socket.write(raw+'\r\n');
   if(peerHead.length)socket.write(peerHead);if(head.length)peer.write(head);
   peer.on('error',()=>socket.destroy());socket.on('error',()=>peer.destroy());peer.on('close',()=>socket.destroy());socket.on('close',()=>peer.destroy());socket.pipe(peer).pipe(socket);
  });
  out.on('response',response=>{socket.write('HTTP/1.1 '+response.statusCode+' Upstream response\r\nConnection: close\r\n\r\n');response.pipe(socket);});
  out.on('error',()=>socket.destroy());socket.on('error',()=>out.destroy());out.end();
 });
 server.on('close',()=>agent.destroy());return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const server=createLayeroServer();server.listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log('SCUM HUB Layero server ready'));
}
