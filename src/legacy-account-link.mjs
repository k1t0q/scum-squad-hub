export async function linkLegacyAccount(request,env,steamId,headers){
 return Response.json({error:'legacy_link_retired'},{status:410,headers});
}
