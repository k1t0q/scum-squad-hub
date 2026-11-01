import {createMemberSession,verifyMemberSession,memberCookie} from './member-session.mjs';
import {createAdminSession,verifyAdminSession,adminCookie} from './admin-code-login.mjs';
import {issueSession} from './issue-session.mjs';
import {verifySession} from './session-auth.mjs';
import {SESSION_SECONDS,steamCookie,sessionNeedsRenewal} from './session-duration.mjs';

async function renewedCookies(request,env){
 const cookies=[];
 const member=await verifyMemberSession(request,env);
 if(member)cookies.push(memberCookie(await createMemberSession(member,env)));
 const admin=await verifyAdminSession(request,env);
 if(admin)cookies.push(adminCookie(await createAdminSession(admin,env)));
 const steam=await verifySession(request,env);
 if(steam)cookies.push(steamCookie(await issueSession(steam.steamId,env)));
 return cookies;
}

// Called only on authenticated reads. Fresh cookies need no extra database reads.
export async function rollingSessionHeaders(request,env,baseHeaders){
 if(!sessionNeedsRenewal(request))return baseHeaders;
 const headers=new Headers(baseHeaders);
 for(const cookie of await renewedCookies(request,env))headers.append('set-cookie',cookie);
 return headers;
}

// Explicit renewal remains available for the native mini-map.
export async function refreshMemberSession(request,env){
 const headers=new Headers({'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});
 const fail=(error,status)=>new Response(JSON.stringify({error}),{status,headers});
 if(request.method!=='POST')return fail('method_not_allowed',405);
 if(request.headers.get('origin')!==new URL(request.url).origin)return fail('invalid_origin',403);
 const cookies=await renewedCookies(request,env);
 if(!cookies.length)return fail('session_expired',401);
 for(const cookie of cookies)headers.append('set-cookie',cookie);
 return new Response(JSON.stringify({ok:true,expires_in:SESSION_SECONDS}),{headers});
}
