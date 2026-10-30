// Explicit table/column allowlists. Every query is scoped to verified membership.
const tables={squads:['name','appearance'],members:['nick','game_role'],presence_history:['status','join_time','day'],tasks:['title','quantity','unit','place','priority','deadline','comment','status','assignee_id'],task_contributions:['task_id','amount'],raids:['title','raid_time','note','raid_date','sector','walls','loadout','transport','rally_point','target_images'],raid_participants:['raid_id'],explosives_inventory:['item','quantity'],protect_updates:['member_id','effective_at'],squad_place_posts:['kind','images','comment','map_marker_name'],protect_update_edits:[],squad_member_duties:['member_id','raid','def','counter'],squad_map_markers:['id','x','y','type','name','note','icon','color','size','show_label','locked','enemy_nicks'],squad_photo_annotations:['photo_url','strokes'],squad_notification_events:[]};
const jsonFields=new Set(['appearance','images','target_images','enemy_nicks','strokes','categories']);
const encode=v=>typeof v==='boolean'?(v?1:0):typeof v==='object'&&v!==null?JSON.stringify(v):v===undefined?null:v;
const decode=r=>Object.fromEntries(Object.entries(r).map(([k,v])=>{if(jsonFields.has(k)&&typeof v==='string'){try{v=JSON.parse(v)}catch{}}if(k==='is_active')v=!!v;return [k,v]}));
function scope(t,m){if(t==='squads')return ['id=?',[m.squad_id]];if(t==='task_contributions')return ['task_id IN (SELECT id FROM tasks WHERE squad_id=?)',[m.squad_id]];if(t==='raid_participants')return ['raid_id IN (SELECT id FROM raids WHERE squad_id=?)',[m.squad_id]];return ['squad_id=?',[m.squad_id]]}
function fail(s){throw Error(s)}
export async function legacyApi(body,env,m){
 const db=env.DB,now=new Date().toISOString(),admin=m.access_role==='admin';
 const all=async(sql,args=[])=> (await db.prepare(sql).bind(...args).all()).results||[];
 const run=async(sql,args=[])=>db.prepare(sql).bind(...args).run();
 const own=async(t,id)=>{const [s,a]=scope(t,m);return (await all('SELECT * FROM '+t+' WHERE id=? AND '+s,[id,...a]))[0]||fail('record_not_found')};
 const member=async id=>(await all('SELECT id FROM members WHERE id=? AND squad_id=? AND is_active=1',[id,m.squad_id]))[0]||fail('member_not_found');
 const event=async(category,title,body='',sourceKey=crypto.randomUUID())=>run('INSERT INTO squad_notification_events (id,squad_id,category,actor_id,title,body,source_key,created_at) VALUES (?,?,?,?,?,?,?,?)',[Date.now()*1000+crypto.getRandomValues(new Uint16Array(1))[0]%1000,m.squad_id,category,m.id,title,body,sourceKey,now]);
 if(body.rpc){const p=body.args||{};
 switch(body.rpc){
 case 'current_member': case 'claim_admin_account':return {...m,is_active:true};
 case 'get_squad_place_posts':return (await all('SELECT p.*,m.nick AS author_nick,m.nick AS nick FROM squad_place_posts p LEFT JOIN members m ON m.id=p.created_by WHERE p.squad_id=? AND p.kind=? ORDER BY p.created_at DESC',[m.squad_id,p.p_kind])).map(decode);
 case 'get_squad_map_posts':return (await all("SELECT p.*,m.nick AS author_nick FROM squad_place_posts p LEFT JOIN members m ON m.id=p.created_by WHERE p.squad_id=? AND kind IN ('stash','base','other')",[m.squad_id])).map(decode);
 case 'get_squad_recent_events':return await all('SELECT e.*,m.nick AS actor_nick FROM squad_notification_events e LEFT JOIN members m ON m.id=e.actor_id WHERE e.squad_id=? ORDER BY e.created_at DESC LIMIT ?',[m.squad_id,Math.min(50,Number(p.p_limit)||9)]);
 case 'squad_map_sync':if(p.p_action==='list')return (await all('SELECT * FROM squad_map_markers WHERE squad_id=?',[m.squad_id])).map(r=>({...decode(r),showLabel:!!r.show_label,enemyNicks:decode(r).enemy_nicks||[]}));if(p.p_action==='delete'){
 const id=String(p.p_id||'');
 if(!id)fail('invalid_marker_id');
 const r=(await all('SELECT * FROM squad_map_markers WHERE id=? AND squad_id=?',[id,m.squad_id]))[0];
 if(r?.locked&&!admin)fail('forbidden');
 // Legacy Discord publications can generate a marker without a marker-table row.
 // Remove its source too, atomically, so the next refresh cannot recreate it.
 const match=/^(stash|base|other)-post-(\d+)$/.exec(id);
 const statements=[db.prepare('DELETE FROM squad_map_markers WHERE id=? AND squad_id=?').bind(id,m.squad_id)];
 if(match)statements.push(db.prepare('DELETE FROM squad_place_posts WHERE id=? AND squad_id=? AND kind=?').bind(Number(match[2]),m.squad_id,match[1]));
 await db.batch(statements);
 return true
}if(p.p_action==='save'){const r=p.p_marker||{};const previous=(await all('SELECT locked FROM squad_map_markers WHERE id=? AND squad_id=?',[String(r.id||''),m.squad_id]))[0];if(previous?.locked&&!admin)fail('forbidden');const result=await legacyApi({table:'squad_map_markers',action:'upsert',values:{...r,show_label:r.showLabel===false?0:1,enemy_nicks:r.enemyNicks||[]}},env,m);const match=String(r.id).match(/^(stash|base|other)-post-(\d+)$/);if(match){const post=await own('squad_place_posts',Number(match[2]));const coords=String(post.comment||'').split('\n').filter(x=>/^(Координаты:|Источник:)/.test(x));await run('UPDATE squad_place_posts SET map_marker_name=?,comment=? WHERE id=? AND squad_id=?',[r.name||post.map_marker_name||'',r.note===undefined?post.comment:[String(r.note||''),...coords].filter(Boolean).join('\n'),post.id,m.squad_id])}return result}break;
 case 'convert_map_marker_to_stash':{const r=p.p_marker||{};if(!Number.isFinite(Number(r.x))||!Number.isFinite(Number(r.y))||r.x<0||r.x>1||r.y<0||r.y>1)fail('invalid_coordinates');const sourceMatch=/^(base|other)-post-([0-9]+)$/.exec(String(r.id||''));
 if(sourceMatch){
  const source=await own('squad_place_posts',Number(sourceMatch[2]));
  const previous=(await all('SELECT locked FROM squad_map_markers WHERE id=? AND squad_id=?',[String(r.id),m.squad_id]))[0];
  if(previous?.locked&&!admin)fail('forbidden');
  const id='stash-post-'+source.id;
  await legacyApi({table:'squad_map_markers',action:'upsert',values:{...r,id,type:'stash',show_label:1}},env,m);
  const metadata=String(source.comment||'').split('\n').filter(x=>/^(Координаты:|Источник:)/.test(x));
  await db.batch([
   db.prepare('UPDATE squad_place_posts SET kind=?,map_marker_name=?,comment=?,stash_checked_at=?,stash_checked_by=? WHERE id=? AND squad_id=?').bind('stash',r.name||'Схрон',[String(r.note||''),...metadata].filter(Boolean).join('\n'),now,m.id,source.id,m.squad_id),
   db.prepare('DELETE FROM squad_map_markers WHERE id=? AND squad_id=?').bind(String(r.id),m.squad_id)
  ]);
  return {id:source.id,marker_id:id}
 }
 const [post]=await legacyApi({table:'squad_place_posts',action:'insert',values:{kind:'stash',images:[],map_marker_name:r.name||'Схрон',comment:r.note||''}},env,m);const id='stash-post-'+post.id;await legacyApi({table:'squad_map_markers',action:'insert',values:{...r,id,type:'stash',show_label:1}},env,m);if(r.id)await run('DELETE FROM squad_map_markers WHERE id=? AND squad_id=?',[String(r.id),m.squad_id]);return {id:post.id,marker_id:id}}
 case 'refresh_stash':await own('squad_place_posts',p.p_post_id);await run('UPDATE squad_place_posts SET stash_checked_at=?,stash_checked_by=? WHERE id=? AND squad_id=?',[now,m.id,p.p_post_id,m.squad_id]);return true;
 case 'claim_task':await own('tasks',p.p_task_id);await run('UPDATE tasks SET assignee_id=? WHERE id=? AND squad_id=?',[m.id,p.p_task_id,m.squad_id]);return true;
 case 'set_task_status':{const t=await own('tasks',p.p_task_id);if(!admin&&t.creator_id!==m.id&&t.assignee_id!==m.id)fail('forbidden');if(!['В процессе','Выполнено'].includes(p.p_status))fail('invalid_status');await run('UPDATE tasks SET status=? WHERE id=? AND squad_id=?',[p.p_status,p.p_task_id,m.squad_id]);await event('tasks',p.p_status==='Выполнено'?'ЗАДАЧА ВЫПОЛНЕНА':'Задача возвращена в работу',t.title,'task-status:'+t.id+':'+now);return true}
 case 'update_task_details':{const t=await own('tasks',p.p_task_id);if(!admin&&t.creator_id!==m.id)fail('forbidden');const v={};for(const k of tables.tasks)if(p['p_'+k]!==undefined)v[k]=p['p_'+k];return legacyApi({table:'tasks',action:'update',values:v,filters:[['id',p.p_task_id]]},env,m)}
 case 'admin_set_squad_name':if(!admin)fail('forbidden');if(!p.p_name||[...p.p_name].length>6)fail('invalid_name');await run('UPDATE squads SET name=? WHERE id=?',[p.p_name,m.squad_id]);return p.p_name;
 case 'admin_change_invite_code':if(!admin)fail('forbidden');if(String(p.p_new_code||'').length<4)fail('invalid_code');await run('UPDATE squads SET invite_code=? WHERE id=?',[p.p_new_code,m.squad_id]);return true;
 case 'admin_rename_member':if(!admin)fail('forbidden');await member(p.p_member_id);await run('UPDATE members SET nick=? WHERE id=? AND squad_id=?',[String(p.p_new_nick||'').slice(0,32),p.p_member_id,m.squad_id]);return true;
 case 'admin_kick_member':if(!admin||p.p_member_id===m.id)fail('forbidden');await member(p.p_member_id);await run("UPDATE members SET is_active=0 WHERE id=? AND squad_id=? AND access_role!='admin'",[p.p_member_id,m.squad_id]);return true;
 case 'squad_photo_drawings':if(p.p_save)await legacyApi({table:'squad_photo_annotations',action:'upsert',values:{photo_url:p.p_url,strokes:p.p_strokes}},env,m);return (await all('SELECT strokes FROM squad_photo_annotations WHERE squad_id=? AND photo_url=?',[m.squad_id,p.p_url])).map(decode)[0]?.strokes||[];
 case 'get_my_discord_settings':{const link=(await all('SELECT discord_user_id FROM discord_member_links WHERE member_id=?',[m.id]))[0];const pref=(await all('SELECT * FROM discord_dm_preferences WHERE member_id=?',[m.id]))[0];return {...decode(pref||{}),linked:!!link,discord_user_id:link?.discord_user_id,enabled:pref?!!pref.enabled:true}}
 case 'unlink_my_discord':await run('DELETE FROM discord_member_links WHERE member_id=?',[m.id]);return true;
 case 'set_my_discord_settings':await run('INSERT OR REPLACE INTO discord_dm_preferences (member_id,enabled,categories,updated_at) VALUES (?,?,?,?)',[m.id,p.p_enabled?1:0,JSON.stringify(p.p_categories||{}),now]);return true;
 case 'create_discord_link_code':{const code=Array.from(crypto.getRandomValues(new Uint8Array(18))).map(x=>x.toString(16).padStart(2,'0')).join('');const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(code)))).map(x=>x.toString(16).padStart(2,'0')).join('');const expires=new Date(Date.now()+600000).toISOString();await run('INSERT INTO discord_link_codes (code_hash,member_id,expires_at,created_at) VALUES (?,?,?,?)',[hash,m.id,expires,now]);return code}
 case 'admin_notification_members':if(!admin)fail('forbidden');return (await all('SELECT m.id AS member_id,m.nick,d.discord_user_id FROM members m LEFT JOIN discord_member_links d ON d.member_id=m.id WHERE m.squad_id=? AND m.is_active=1',[m.squad_id])).map(r=>({...r,discord_linked:!!r.discord_user_id}));
 case 'admin_revoke_member_channel':if(!admin)fail('forbidden');await member(p.target_member);if(p.channel==='discord')await run('DELETE FROM discord_member_links WHERE member_id=?',[p.target_member]);else await run('UPDATE protect_push_subscriptions SET enabled=0 WHERE member_id=?',[p.target_member]);return true;
 case 'raise_raid_alarm':{
 const previous=(await all('SELECT created_at FROM squad_raid_alarms WHERE squad_id=? ORDER BY created_at DESC LIMIT 1',[m.squad_id]))[0];
 if(previous&&Date.now()-Date.parse(previous.created_at)<300000)fail('alarm_rate_limited');
 const alarmId=Date.now()*1000+crypto.getRandomValues(new Uint16Array(1))[0]%1000;
 await db.batch([
 db.prepare('INSERT INTO squad_raid_alarms(id,squad_id,member_id,created_at) VALUES(?,?,?,?)').bind(alarmId,m.squad_id,m.id,now),
 db.prepare('INSERT INTO fury_alarm_channel_jobs(alarm_id,sent_count,updated_at) VALUES(?,0,?)').bind(alarmId,now)
 ]);
 await event('alarm','НАС РЕЙДЯТ');return true;
 }
 }
 fail('rpc_not_implemented:'+body.rpc);
 }
 const t=body.table,action=body.action||'select';if(!Object.hasOwn(tables,t))fail('table_not_allowed');if(!['select','insert','upsert','update','delete'].includes(action))fail('invalid_action');
 const info=await all('PRAGMA table_info('+t+')'),cols=info.map(x=>x.name);let [where,args]=scope(t,m);
 for(const [k,v] of body.filters||[]){if(!cols.includes(k))fail('invalid_filter');where+=' AND "'+k+'"=?';args.push(encode(v))}
 if(action==='select'){let fields=body.columns&&body.columns!=='*'?body.columns.split(','):cols;if(fields.some(k=>!cols.includes(k)))fail('invalid_columns');fields=fields.filter(k=>!['invite_code','device_id','user_id'].includes(k));let sql='SELECT '+fields.map(k=>'"'+k+'"').join(',')+' FROM '+t+' WHERE '+where;if(body.order){if(!cols.includes(body.order[0]))fail('invalid_order');sql+=' ORDER BY "'+body.order[0]+'" '+(body.order[1]?'ASC':'DESC')}sql+=' LIMIT '+Math.min(1000,Math.max(1,Number(body.limit)||1000));const rows=(await all(sql,args)).map(decode);return body.single?rows[0]||null:rows}
 if(!tables[t].length)fail('read_only');if(t==='explosives_inventory'&&!admin)fail('forbidden');if(t==='explosives_inventory'&&body.values?.quantity!==undefined&&(!Number.isSafeInteger(body.values.quantity)||body.values.quantity<0||body.values.quantity>300))fail('invalid_quantity');if(['squads','squad_member_duties'].includes(t)&&!admin)fail('forbidden');
 if(['update','delete'].includes(action)){
 if(!(body.filters||[]).length)fail('filter_required');const records=await all('SELECT * FROM '+t+' WHERE '+where,args);
 for(const r of records){if(t==='squad_map_markers'&&r.locked&&!admin)fail('forbidden');if(t==='members'&&r.id!==m.id)fail('forbidden');if(['tasks','raids','squad_place_posts'].includes(t)&&!admin&&r.creator_id!==m.id&&r.created_by!==m.id)fail('forbidden');if(['presence_history','raid_participants','task_contributions'].includes(t)&&r.member_id!==m.id&&!admin)fail('forbidden');if(t==='protect_updates'&&!admin&&r.member_id!==m.id)fail('forbidden')}
 if(action==='delete'){await run('DELETE FROM '+t+' WHERE '+where,args);return records.map(decode)}
 const v=Object.fromEntries(Object.entries(body.values||{}).filter(([k])=>tables[t].includes(k)));if(!Object.keys(v).length)fail('empty_update');if(v.assignee_id)await member(v.assignee_id);if(v.member_id)await member(v.member_id);await run('UPDATE '+t+' SET '+Object.keys(v).map(k=>'"'+k+'"=?').join(',')+' WHERE '+where,[...Object.values(v).map(encode),...args]);return (await all('SELECT * FROM '+t+' WHERE '+where,args)).map(decode);
 }
 if(['members','squads'].includes(t))fail('insert_not_allowed');
 const values=Array.isArray(body.values)?body.values:[body.values];if(values.length>20)fail('too_many_rows');const result=[];
 for(const input of values){if(!input||typeof input!=='object')fail('invalid_values');const v=Object.fromEntries(Object.entries(input).filter(([k])=>tables[t].includes(k)&&input[k]!==undefined));if(cols.includes('squad_id'))v.squad_id=m.squad_id;if(cols.includes('created_by'))v.created_by=m.id;if(cols.includes('creator_id'))v.creator_id=m.id;if(cols.includes('member_id'))v.member_id=t==='squad_member_duties'?input.member_id:m.id;
 if(v.member_id)await member(v.member_id);if(v.assignee_id)await member(v.assignee_id);if(t==='task_contributions')await own('tasks',v.task_id);if(t==='raid_participants')await own('raids',v.raid_id);
 if(t==='protect_updates'){v.member_id=input.member_id||m.id;await member(v.member_id);v.effective_at=v.effective_at||now}
 if(cols.includes('created_at'))v.created_at=now;if(cols.includes('updated_at'))v.updated_at=now;if(cols.includes('updated_by'))v.updated_by=m.id;
 if(cols.includes('id')&&!['members','squads','squad_map_markers'].includes(t))v.id=Date.now()*1000+crypto.getRandomValues(new Uint16Array(1))[0]%1000;
 if(t==='squad_map_markers'&&(!Number.isFinite(Number(v.x))||!Number.isFinite(Number(v.y))||v.x<0||v.x>1||v.y<0||v.y>1))fail('invalid_coordinates');
 if(t==='squad_map_markers'){v.id=String(input.id||crypto.randomUUID());const existing=await all('SELECT squad_id,locked FROM squad_map_markers WHERE id=?',[v.id]);if(existing.length&&(existing[0].squad_id!==m.squad_id||(existing[0].locked&&!admin)))fail('forbidden')}
 if(t==='presence_history'&&action==='upsert'){const old=(await all('SELECT id FROM presence_history WHERE member_id=? AND day=? AND squad_id=?',[m.id,v.day,m.squad_id]))[0];if(old)v.id=old.id}
 if(t==='explosives_inventory'&&(!Number.isFinite(Number(v.quantity))||v.quantity<0||v.quantity>300))fail('invalid_quantity');
 const keys=Object.keys(v),pk=info.filter(x=>x.pk).map(x=>x.name);const conflict=action==='upsert'?' ON CONFLICT ('+pk.map(k=>'"'+k+'"').join(',')+') DO UPDATE SET '+keys.filter(k=>!pk.includes(k)).map(k=>'"'+k+'"=excluded."'+k+'"').join(','):'';
 await run('INSERT INTO '+t+' ('+keys.map(k=>'"'+k+'"').join(',')+') VALUES ('+keys.map(()=>'?').join(',')+')'+conflict,Object.values(v).map(encode));result.push(decode(v));
 if(['tasks','raids','protect_updates','squad_place_posts'].includes(t))await event(t==='tasks'?'tasks':t==='raids'?'raids':t==='protect_updates'?'protect_updated':v.kind==='base'||v.kind==='other'?'base':'stash',t==='tasks'?'Новая задача':t==='raids'?'План на рейд':t==='protect_updates'?'ПРОТЕКТ ОБНОВЛЕН':v.kind==='stash'?'Новый схрон':'Новая база',v.title||v.map_marker_name||v.comment||'',(t==='protect_updates'?'protect-updated:':t==='squad_place_posts'?'squad-place:':t+':')+v.id);
 }
 return result;
}
