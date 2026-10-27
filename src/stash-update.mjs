const DAY_MS=86400000;
export async function checkStash(request,env,membership,squadId,headers){
 let body;
 try {body=await request.json();}catch{return new Response(JSON.stringify({error:'invalid_json'}),{status:400,headers});}
 if(!body || !Number.isSafeInteger(body.id) || body.id<1)return new Response(JSON.stringify({error:'invalid_stash_id'}),{status:400,headers});
 try{
  const now=new Date().toISOString();
  const result=await env.DB.prepare(
   "UPDATE squad_place_posts SET stash_checked_at = ?, stash_checked_by = ? WHERE id = ? AND squad_id = ? AND kind = 'stash'"
  ).bind(now,membership.memberId,body.id,squadId).run();
  if(result?.meta?.changes!==1)return new Response(JSON.stringify({error:'stash_not_found'}),{status:404,headers});
  return new Response(JSON.stringify({id:body.id,stash_checked_at:now,stash_checked_by:membership.memberId,expires_at:new Date(Date.parse(now)+14*DAY_MS).toISOString()}),{status:200,headers});
 }catch{return new Response(JSON.stringify({error:'database_unavailable'}),{status:503,headers});}
}
