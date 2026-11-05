// Canonicalize a map-only stash into the same publication used by HUB and mini-map.
// Deterministic identity makes retried saves idempotent without changing expiry.
export async function publishStashMarker(env,member,input){
 const db=env.DB,sourceId=String(input.id||'');
 if(!sourceId||/^\w+-post-/.test(sourceId))throw Error('invalid_marker_id');
 const all=async(q,args)=>(await db.prepare(q).bind(...args).all()).results||[];
 const original=(await all('SELECT * FROM squad_map_markers WHERE id=?',[sourceId]))[0];
 if(original&&(original.squad_id!==member.squad_id||(original.locked&&member.access_role!=='admin')))throw Error('forbidden');
 const marker={...original,...input};
 if(!Number.isFinite(Number(marker.x))||!Number.isFinite(Number(marker.y))||marker.x<0||marker.x>1||marker.y<0||marker.y>1)throw Error('invalid_coordinates');
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(member.squad_id+'\0'+sourceId));
 const hex=Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');
 const postId=Number.parseInt(hex.slice(0,12),16)||1,id='stash-post-'+postId;
 const post=(await all('SELECT * FROM squad_place_posts WHERE id=?',[postId]))[0];
 if(post&&(post.squad_id!==member.squad_id||post.kind!=='stash'))throw Error('stash_identity_conflict');
 const canonical=(await all('SELECT * FROM squad_map_markers WHERE id=?',[id]))[0];
 if(canonical&&(canonical.squad_id!==member.squad_id||(canonical.locked&&member.access_role!=='admin')))throw Error('forbidden');
 const now=new Date().toISOString(),created=original?.type==='stash'&&original.updated_at?original.updated_at:now;
 const author=original?.created_by||member.id;
 let enemies=marker.enemyNicks||marker.enemy_nicks||[];if(typeof enemies==='string'){try{enemies=JSON.parse(enemies)}catch{enemies=[]}}if(!Array.isArray(enemies))enemies=[];
 const comment=String(marker.note||'').split('\n').filter(x=>!/^Координаты:/.test(x)).join('\n')+'\nКоординаты: X='+(619646.8573-Number(marker.x)*(619646.8573+905369.0266))+' Y='+(619659.7258-Number(marker.y)*(619659.7258+904357.527));
 const statements=[
 db.prepare("INSERT INTO squad_place_posts(id,squad_id,kind,images,map_marker_name,comment,created_at,created_by) VALUES(?,?,'stash','[]',?,?,?,?) ON CONFLICT(id) DO NOTHING").bind(postId,member.squad_id,marker.name||'Схрон',comment,created,author),
 db.prepare("INSERT INTO squad_map_markers(id,squad_id,x,y,type,name,note,icon,color,size,show_label,locked,created_by,updated_at,enemy_nicks) VALUES(?,?,?,?,'stash',?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET x=excluded.x,y=excluded.y,name=excluded.name,note=excluded.note,icon=excluded.icon,color=excluded.color,size=excluded.size,show_label=excluded.show_label,locked=excluded.locked,enemy_nicks=excluded.enemy_nicks").bind(id,member.squad_id,Number(marker.x),Number(marker.y),marker.name||'Схрон',marker.note||'',marker.icon||'📦',marker.color||'',marker.size||30,marker.showLabel===false||marker.show_label===0?0:1,marker.locked?1:0,author,created,JSON.stringify(enemies)),
 db.prepare('UPDATE squad_place_posts SET map_marker_name=?,comment=? WHERE id=? AND squad_id=?').bind(marker.name||'Схрон',comment,postId,member.squad_id),
 db.prepare('DELETE FROM squad_map_markers WHERE id=? AND squad_id=?').bind(sourceId,member.squad_id)
 ];
 if(!post&&original?.type!=='stash')statements.push(db.prepare("INSERT INTO squad_notification_events(id,squad_id,category,actor_id,title,body,source_key,created_at) SELECT ?,?,'stash',?,'Новый схрон',?,?,? WHERE NOT EXISTS(SELECT 1 FROM squad_notification_events WHERE source_key=?)").bind(Date.now()*1000+crypto.getRandomValues(new Uint16Array(1))[0]%1000,member.squad_id,member.id,marker.name||'Схрон','squad-place:'+postId,now,'squad-place:'+postId));
 await db.batch(statements);
 return {id:postId,marker_id:id,existing:!!post||original?.type==='stash'};
}
