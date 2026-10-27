export async function updateExplosives(request, env, membership, squadId, headers) {
  if (!['admin', 'owner'].includes(membership.role)) {
    return new Response(JSON.stringify({error:'insufficient_role'}), {status:403,headers});
  }
  let data;
  try { data = await request.json(); }
  catch { return new Response(JSON.stringify({error:'invalid_json'}), {status:400,headers}); }
  if (!data || typeof data.item !== 'string' || !data.item.trim() || data.item.length > 100 ||
      !Number.isSafeInteger(data.quantity) || data.quantity < 0 || data.quantity > 1000000) {
    return new Response(JSON.stringify({error:'invalid_inventory_update'}), {status:400,headers});
  }
  try {
    const result = await env.DB.prepare(
      'UPDATE explosives_inventory SET quantity = ?, updated_at = CURRENT_TIMESTAMP, updated_by = ? WHERE squad_id = ? AND item = ?'
    ).bind(data.quantity, membership.memberId, squadId, data.item).run();
    if (result?.meta?.changes !== 1) return new Response(JSON.stringify({error:'item_not_found'}), {status:404,headers});
    return new Response(JSON.stringify({item:data.item,quantity:data.quantity}), {status:200,headers});
  } catch {
    return new Response(JSON.stringify({error:'database_unavailable'}), {status:503,headers});
  }
}
