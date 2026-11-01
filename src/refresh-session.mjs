import {createMemberSession,verifyMemberSession,memberCookie} from './member-session.mjs';
import {createAdminSession,verifyAdminSession,adminCookie} from './admin-code-login.mjs';

// Rotate only an unexpired session after checking current active membership.
// No squad code or client-supplied identity is accepted by this endpoint.
export async function refreshMemberSession(request,env){
 const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
 const fail=(error,status)=>new Response(JSON.stringify({error}),{status,headers});
 if(request.method!=='POST')return fail('method_not_allowed',405);
 if(request.headers.get('origin')!==new URL(request.url).origin)return fail('invalid_origin',403);
 const member=await verifyMemberSession(request,env);
 if(member)return new Response(JSON.stringify({ok:true,expires_in:3600}),{headers:{...headers,'set-cookie':memberCookie(await createMemberSession(member,env))}});
 const admin=await verifyAdminSession(request,env);
 if(admin)return new Response(JSON.stringify({ok:true,expires_in:3600}),{headers:{...headers,'set-cookie':adminCookie(await createAdminSession(admin,env))}});
 return fail('session_expired',401);
}
