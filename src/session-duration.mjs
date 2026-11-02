export const SESSION_SECONDS=30*24*60*60;
export const RENEW_AFTER_SECONDS=12*60*60;
export const steamCookie=token=>'scum_steam_session='+token+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age='+SESSION_SECONDS;

// This only schedules renewal. The signature and current membership are always
// verified again before issuing any cookie; these claims grant no access.
export function sessionNeedsRenewal(request,now=Math.floor(Date.now()/1000)){
 for(const cookie of (request.headers.get('cookie')||'').split(';')){
  const separator=cookie.indexOf('=');if(separator<0)continue;
  if(!['scum_member_session','scum_admin_session','scum_steam_session'].includes(cookie.slice(0,separator).trim()))continue;
  try{const payload=cookie.slice(separator+1).split('.')[0];
   const claims=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(payload.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))));
   if(claims.fixed===true)continue;
   if(Number.isSafeInteger(claims.iat)&&Number.isSafeInteger(claims.exp)&&(claims.exp-claims.iat!==SESSION_SECONDS||now-claims.iat>=RENEW_AFTER_SECONDS))return true;
  }catch{}
 }
 return false;
}
