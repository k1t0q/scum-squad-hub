const json=(value,status,headers)=>new Response(JSON.stringify(value),{status,headers});
export async function updateMapMarker(request,env,membership,squadId,headers){
 let body;
 try {body=await request.json();}catch{return json({error:'invalid_json'},400,headers);}
 if(!body || typeof body.id!=='string' || !body.id || body.id.length>128 ||
    typeof body.name!=='string' || body.name.length>100 ||
    typeof body.note!=='string' || body.note.length>2000)
   return json({error:'invalid_marker_update'},400,headers);
 try{
  const result=await env.DB.prepare(
   'UPDATE squad_map_markers SET name = ?, note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND squad_id = ? AND locked = 0'
  ).bind(body.name,body.note,body.id,squadId).run();
  if(result?.meta?.changes!==1)return json({error:'marker_not_found_or_locked'},404,headers);
  return json({id:body.id,name:body.name,note:body.note},200,headers);
 }catch{return json({error:'database_unavailable'},503,headers);}
}
