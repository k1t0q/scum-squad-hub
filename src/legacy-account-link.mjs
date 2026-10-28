const reply=(body,status,headers)=>new Response(JSON.stringify(body),{status,headers});
export async function linkLegacyAccount(request,env,steamId,headers,fetcher=fetch){
 if(!env.LEGACY_SUPABASE_URL||!env.LEGACY_SUPABASE_ANON_KEY||!env.DB)return reply({error:'linking_not_configured'},503,headers);
 let body;
 try{body=await request.json()}catch{return reply({error:'invalid_json'},400,headers)}
 const legacyToken=body?.legacy_access_token;
 if(typeof legacyToken!=='string'||legacyToken.length<20||legacyToken.length>8192)return reply({error:'invalid_legacy_token'},400,headers);
 let url;
 try{
  url=new URL(env.LEGACY_SUPABASE_URL);
  if(url.protocol!=='https:'||url.pathname!=='/'||url.search||url.hash)return reply({error:'linking_not_configured'},503,headers);
 }catch{return reply({error:'linking_not_configured'},503,headers)}
 let userId;
 try{
  const response=await fetcher(new URL('/auth/v1/user',url),{headers:{authorization:'Bearer '+legacyToken,apikey:env.LEGACY_SUPABASE_ANON_KEY},redirect:'error'});
  if(!response.ok)return reply({error:'legacy_auth_failed'},401,headers);
  const user=await response.json();
  if(typeof user.id!=='string'||!user.id)return reply({error:'legacy_auth_failed'},401,headers);
  userId=user.id;
 }catch{return reply({error:'legacy_auth_unavailable'},503,headers)}
 try{
  const sql=`INSERT INTO scum_verified_steam_links (steamid,member_id,squad_id,created_at)
SELECT ?,m.id,m.squad_id,CURRENT_TIMESTAMP FROM members AS m
WHERE m.user_id = ? AND m.is_active = 1
AND NOT EXISTS (SELECT 1 FROM scum_verified_steam_links WHERE steamid = ?)
AND NOT EXISTS (SELECT 1 FROM scum_verified_steam_links WHERE member_id = ?)
AND (SELECT COUNT(*) FROM members WHERE user_id = ? AND is_active = 1) = 1`;
  const member=await env.DB.prepare('SELECT id FROM members WHERE user_id = ? AND is_active = 1 LIMIT 1').bind(userId).first();
  if(!member?.id)return reply({error:'member_not_found'},403,headers);
  const result=await env.DB.prepare(sql).bind(steamId,userId,steamId,member.id,userId).run();
  if(result?.meta?.changes!==1)return reply({error:'account_already_linked_or_ambiguous'},409,headers);
  return reply({linked:true},201,headers);
 }catch{return reply({error:'linking_unavailable'},503,headers)}
}
