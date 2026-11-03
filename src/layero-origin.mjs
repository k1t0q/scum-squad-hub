// A public origin hint only changes URL routing. It never grants a session.
const allowedOrigins=new Set(['https://scumhub.layero.app']);
export function layeroRequest(request){
 const origin=request.headers.get('x-scum-public-origin');
 if(origin===null)return {request,origin:null};
 if(!allowedOrigins.has(origin))throw Error('invalid_public_origin');
 const url=new URL(request.url);const target=new URL(origin);target.pathname=url.pathname;target.search=url.search;
 const headers=new Headers(request.headers);headers.delete('x-scum-public-origin');
 return {request:new Request(target,{method:request.method,headers,body:['GET','HEAD'].includes(request.method)?undefined:request.body,redirect:request.redirect,...(!['GET','HEAD'].includes(request.method)?{duplex:'half'}:{})}),origin};
}
