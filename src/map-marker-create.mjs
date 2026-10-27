const reply=(body,status,headers)=>new Response(JSON.stringify(body),{status,headers});
export async function createMapMarker(request,env,membership,squadId,headers){
 let data;
 try{data=await request.json();}catch{return reply({error:'invalid_json'},400,headers);}
 if(!data || typeof data.name!=='string' || !data.name.trim() || data.name.length>100 ||
    typeof data.note!=='string' || data.note.length>2000 ||
    typeof data.x!=='number' || !Number.isFinite(data.x) || data.x<0 || data.x>1 ||
    typeof data.y!=='number' || !Number.isFinite(data.y) || data.y<0 || data.y>1)
   return reply({error:'invalid_marker'},400,headers);
 const id=crypto.randomUUID();
 try{
  const result=await env.DB.prepare(
   "INSERT INTO squad_map_markers (id,squad_id,x,y,type,name,note,icon,color,size,show_label,locked,created_by,updated_at,enemy_nicks) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,?)"
  ).bind(id,squadId,data.x,data.y,'enemy_base',data.name,data.note,'','',1,1,0,membership.memberId,'[]').run();
  if(result?.success!==true)return reply({error:'database_unavailable'},503,headers);
  return reply({id,squad_id:squadId,x:data.x,y:data.y,type:'enemy_base',name:data.name,note:data.note},201,headers);
 }catch{return reply({error:'database_unavailable'},503,headers);}
}
