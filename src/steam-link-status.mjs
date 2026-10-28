const reply=(body,status,headers)=>new Response(JSON.stringify(body),{status,headers});
export async function steamLinkStatus(env,steamId,headers){
 if(!env.DB)return reply({error:'database_unavailable'},503,headers);
 try{
  const result=await env.DB.prepare(
   'SELECT m.id AS member_id,m.squad_id AS squad_id,m.access_role AS access_role FROM scum_verified_steam_links AS l JOIN members AS m ON m.id = l.member_id AND m.squad_id = l.squad_id WHERE l.steamid = ? AND m.is_active = 1 LIMIT 1'
  ).bind(steamId).first();
  if(!result)return reply({linked:false},200,headers);
  return reply({linked:true,member_id:result.member_id,squad_id:result.squad_id,access_role:result.access_role},200,headers);
 }catch{return reply({error:'database_unavailable'},503,headers)}
}
