const reply=(body,status,headers)=>new Response(JSON.stringify(body),{status,headers});
export async function deleteMapMarker(request,env,membership,squadId,headers){
 let body;
 try{body=await request.json()}catch{return reply({error:'invalid_json'},400,headers)}
 if(!body||typeof body.id!=='string'||!body.id||body.id.length>128)return reply({error:'invalid_marker_id'},400,headers);
 try{
  const result=await env.DB.prepare(
   'DELETE FROM squad_map_markers WHERE id = ? AND squad_id = ? AND locked = 0'
  ).bind(body.id,squadId).run();
  if(result?.meta?.changes!==1)return reply({error:'marker_not_found_or_locked'},404,headers);
  return reply({id:body.id,deleted:true},200,headers);
 }catch{return reply({error:'database_unavailable'},503,headers)}
}
