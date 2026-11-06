// Each card has five milestones; the final goal assumes roughly one active year.
export const achievementDefinitions = [
 ['connected','На связи','Отметить «Буду», «Под вопросом» или «Не буду» в разные дни','presence',[12,30,90,180,365],'radio','#69c5d0','1 отметка в день'],
 ['steady','Стабильная связь','Отмечать участие каждый день без перерыва','streak',[7,14,30,90,180],'radio','#b4a0f5','Лучшая серия за год'],
 ['ready','В деле','Выбрать «Буду» в разные дни','ready',[10,30,60,120,200],'flag','#e9ae68','Около 4 дней в неделю'],
 ['stockpiler','Запасливый','Добавлять собственные схроны','stash',[1,10,30,75,150],'cache','#85ba88','Около 3 схронов в неделю'],
 ['keeper','Хранитель запасов','Обновлять таймеры схронов','refresh',[10,30,100,250,500],'cache','#72c7ae','Около 10 проверок в неделю'],
 ['cartographer','Картограф','Добавлять новые метки на карту','marker',[10,25,75,150,250],'compass','#7caee0','Около 5 меток в неделю'],
 ['wheels','Нашёл колёса','Добавлять метки транспорта','vehicle',[1,5,12,25,50],'truck','#dca370','Около 1 машины в неделю'],
 ['enemy','Вражеский след','Добавлять вражеские базы','enemy',[1,3,6,12,24],'target','#d77d78','Около 2 баз в месяц'],
 ['guardian','Страж отряда','Обновлять протект отряда','protect',[5,12,40,80,150],'shield','#dbbb70','Около 3 обновлений в неделю'],
 ['reliable','Человек дела','Выполнять назначенные себе задачи','task',[1,10,30,75,150],'orders','#b4a0f5','Около 3 задач в неделю'],
 ['regular','Долгая служба','Дни с отметкой участия, новой меткой, проверкой схрона, протектом или выполненной задачей','active_days',[7,30,90,180,365],'calendar','#87b8cf','Один активный день в день'],
 ['rhythm','Ритм отряда','Недели с отметкой участия, новой меткой, проверкой схрона, протектом или выполненной задачей','active_weeks',[2,6,13,26,52],'rhythm','#bba0db','Одна активная неделя в неделю'],
 ['versatile','На все руки','8 видов: участие, метки, схроны, проверки схронов, машины, вражеские базы, протект и выполненные задачи','variety',[2,3,4,6,8],'tools','#d3ad7d','Все 8 видов помощи отряду'],
 ['contributor','Опора отряда','Очки за отметки участия, новые метки и схроны, проверки схронов, протект и выполненные задачи','points',[100,500,2000,5000,10000],'beacon','#8fc4a1','Около 200 очков в неделю'],
 ['collector','Полный комплект','Довести другие карточки до 5 уровня','collection',[2,5,8,11,14],'medal','#edc776','Все 14 карточек за год'],
].map(([id,name,description,metric,levels,art,color,pace])=>({id,name,description,metric,levels,art,color,pace}));
export const achievementPoints={presence:2,marker:5,stash:10,refresh:3,protect:10,task:20};
function itemProgress(def,value,dates){
 const level=def.levels.filter(n=>value>=n).length;
 return {value,level,target:def.levels[Math.min(level,4)],max:def.levels[4],earnedAt:level?dates[level-1]:null,completed:level===5};
}
export function buildAchievements(members,events){
 const byMember=new Map(members.map(m=>[String(m.id),[]]));
 for(const e of events)byMember.get(String(e.member_id))?.push(e);
 const progress=members.map(m=>{
  const own=byMember.get(String(m.id)).sort((a,b)=>a.occurred_at.localeCompare(b.occurred_at));
  const metrics={};for(const e of own)(metrics[e.metric]??=[]).push(e);
  let streak=0,best=0,previous=null;const streakDates={};
  const streakGoals=achievementDefinitions.find(x=>x.metric==='streak').levels;
  for(const e of (metrics.presence||[]).slice().sort((a,b)=>a.event_key.localeCompare(b.event_key))){
   const day=Date.parse(e.event_key+'T00:00:00Z');if(!Number.isFinite(day))continue;
   streak=day-previous===86400000?streak+1:1;previous=day;best=Math.max(best,streak);
   if(streakGoals.includes(streak)&&!streakDates[streak])streakDates[streak]=e.occurred_at;
  }
  // Derived goals use existing durable events, without awarding additional points.
  const days=new Set(),weeks=new Set(),kinds=new Set();
  const derived={active_days:[],active_weeks:[],variety:[],points:[]};
  let points=0;const pointDates=[];
  const kindsAllowed=new Set([...Object.keys(achievementPoints),'vehicle','enemy']);
  for(const e of own){
   if(!kindsAllowed.has(e.metric))continue;
   if(!kinds.has(e.metric)){kinds.add(e.metric);derived.variety.push(e.occurred_at);}
   const stamp=Date.parse(e.occurred_at);
   if(Number.isFinite(stamp)){
    const day=new Date(stamp+3*3600000).toISOString().slice(0,10);
    const week=leaderboardBoundaries(new Date(stamp)).week;
    if(!days.has(day)){days.add(day);derived.active_days.push(e.occurred_at);}
    if(!weeks.has(week)){weeks.add(week);derived.active_weeks.push(e.occurred_at);}
   }
   const weight=achievementPoints[e.metric]||0;
   if(weight){points+=weight;pointDates.push({value:points,date:e.occurred_at});}
  }
  const items={};
  for(const a of achievementDefinitions.filter(a=>a.metric!=='collection')){
   const rows=metrics[a.metric]||[];
   const value=a.metric==='streak'?best:a.metric==='points'?points:derived[a.metric]?derived[a.metric].length:rows.length;
   const dates=a.levels.map(n=>a.metric==='streak'?streakDates[n]:a.metric==='points'?pointDates.find(x=>x.value>=n)?.date:derived[a.metric]?derived[a.metric][n-1]:rows[n-1]?.occurred_at);
   items[a.id]=itemProgress(a,value,dates);
  }
  const earned=Object.values(items).filter(x=>x.completed).sort((a,b)=>a.earnedAt.localeCompare(b.earnedAt));
  const collector=achievementDefinitions.find(x=>x.metric==='collection');
  items.collector=itemProgress(collector,earned.length,collector.levels.map(n=>earned[n-1]?.earnedAt));
  return {id:m.id,nick:m.nick,items};
 });
 return {definitions:achievementDefinitions,members:progress};
}
export function leaderboardBoundaries(now=new Date()){
 const shifted=new Date(now.getTime()+3*3600000),day=Date.UTC(shifted.getUTCFullYear(),shifted.getUTCMonth(),shifted.getUTCDate())-3*3600000;
 return {day:new Date(day).toISOString(),week:new Date(day-((shifted.getUTCDay()+6)%7)*86400000).toISOString(),month:new Date(Date.UTC(shifted.getUTCFullYear(),shifted.getUTCMonth(),1)-3*3600000).toISOString()};
}
export async function getSquadAchievements(db,squadId,now=new Date()){
 const b=leaderboardBoundaries(now);
 const weight="CASE e.metric WHEN 'presence' THEN 2 WHEN 'marker' THEN 5 WHEN 'stash' THEN 10 WHEN 'refresh' THEN 3 WHEN 'protect' THEN 10 WHEN 'task' THEN 20 ELSE 0 END";
 const result=await db.batch([
  db.prepare('SELECT id,nick FROM members WHERE squad_id=? AND is_active=1 ORDER BY nick').bind(squadId),
  db.prepare('SELECT e.member_id,e.metric,e.event_key,e.occurred_at FROM hub_achievement_events e JOIN members m ON m.id=e.member_id AND m.squad_id=e.squad_id WHERE e.squad_id=? AND m.is_active=1 ORDER BY e.occurred_at').bind(squadId),
  db.prepare(`SELECT m.id,m.nick,COALESCE(SUM(${weight}),0) AS total,COALESCE(SUM(CASE WHEN julianday(e.occurred_at)>=julianday(?) AND julianday(e.occurred_at)<=julianday(?) THEN ${weight} ELSE 0 END),0) AS day,COALESCE(SUM(CASE WHEN julianday(e.occurred_at)>=julianday(?) AND julianday(e.occurred_at)<=julianday(?) THEN ${weight} ELSE 0 END),0) AS week,COALESCE(SUM(CASE WHEN julianday(e.occurred_at)>=julianday(?) AND julianday(e.occurred_at)<=julianday(?) THEN ${weight} ELSE 0 END),0) AS month FROM members m LEFT JOIN hub_achievement_events e ON e.member_id=m.id AND e.squad_id=m.squad_id WHERE m.squad_id=? AND m.is_active=1 GROUP BY m.id,m.nick`).bind(b.day,now.toISOString(),b.week,now.toISOString(),b.month,now.toISOString(),squadId),
 ]);
 return {...buildAchievements(result[0].results||[],result[1].results||[]),leaderboard:result[2].results||[],periods:b,asOf:now.toISOString()};
}
