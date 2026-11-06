import {achievementPoints} from './achievements.mjs';
const reasons={presence:'отметку участия',marker:'новую метку на карте',stash:'новый схрон',refresh:'проверку схрона',protect:'обновление протекта',task:'выполненную задачу'};
const pointsWord=n=>n%10===1&&n%100!==11?'очко':n%10>=2&&n%10<=4&&(n%100<12||n%100>14)?'очка':'очков';
const time=value=>Date.parse(String(value||'').replace(' ','T'));
function notificationSource(event){
 const key=String(event.source_key||'');
 if(key.startsWith('protect-updated:'))return 'protect:'+key.slice(16);
 if(key.startsWith('squad-place:'))return 'post:'+key.slice(12);
 if(key.startsWith('map-transport:'))return 'map:'+key.slice(14);
 if(key.startsWith('task-status:')&&String(event.title).toLocaleLowerCase('ru').includes('выполнена'))return 'task:'+key.split(':')[1];
 return null;
}
export function mergeRecentEvents(notifications,awards,limit=9){
 const scoreEvents=awards.map(row=>{
  const metric=Number(row.stash)>0?'stash':Number(row.refresh)>0?'refresh':Number(row.protect)>0?'protect':Number(row.task)>0?'task':Number(row.marker)>0?'marker':'presence';
  const points=Number(row.points),nick=row.actor_nick||'Участник';
  return {id:'points:'+row.actor_id+':'+row.event_key,category:'achievement_points',actor_id:row.actor_id,actor_nick:nick,points,title:nick+' +'+points+' '+pointsWord(points),body:'За '+reasons[metric],source_key:row.event_key,created_at:row.created_at};
 });
 // One row for one action: replace only its matching notification, not unrelated events.
 const ordinary=notifications.filter(event=>{
  const source=notificationSource(event);if(!source)return true;
  return !scoreEvents.some(score=>score.source_key===source&&String(score.actor_id)===String(event.actor_id)&&Math.abs(time(score.created_at)-time(event.created_at))<=5000);
 });
 return [...ordinary,...scoreEvents].filter(e=>Number.isFinite(time(e.created_at))).sort((a,b)=>time(b.created_at)-time(a.created_at)||String(a.id).localeCompare(String(b.id))).slice(0,limit);
}
export async function getSquadRecentEvents(db,squadId,inputLimit=9){
 const limit=Math.min(50,Math.max(1,Math.floor(Number(inputLimit)||9)));
 // Scores come from the same deduplicated ledger as the rankings. Reading the feed awards nothing.
 const weight='CASE e.metric '+Object.entries(achievementPoints).map(([metric,points])=>"WHEN '"+metric+"' THEN "+points).join(' ')+' ELSE 0 END';
 const [ordinary,awards]=await Promise.all([
  db.prepare('SELECT e.*,m.nick AS actor_nick FROM squad_notification_events e LEFT JOIN members m ON m.id=e.actor_id AND m.squad_id=e.squad_id WHERE e.squad_id=? ORDER BY e.created_at DESC LIMIT 50').bind(squadId).all(),
  db.prepare(`SELECT e.member_id AS actor_id,m.nick AS actor_nick,e.event_key,MIN(e.occurred_at) AS created_at,SUM(${weight}) AS points,MAX(e.metric='stash') AS stash,MAX(e.metric='refresh') AS refresh,MAX(e.metric='protect') AS protect,MAX(e.metric='task') AS task,MAX(e.metric='marker') AS marker FROM hub_achievement_events e JOIN members m ON m.id=e.member_id AND m.squad_id=e.squad_id WHERE e.squad_id=? GROUP BY e.member_id,e.event_key HAVING points>0 AND julianday(MIN(e.occurred_at)) IS NOT NULL ORDER BY julianday(MIN(e.occurred_at)) DESC LIMIT 50`).bind(squadId).all(),
 ]);
 return mergeRecentEvents(ordinary.results||[],awards.results||[],limit);
}
