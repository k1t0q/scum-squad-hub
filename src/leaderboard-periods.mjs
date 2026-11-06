// 03:00 Moscow is 00:00 UTC. resetHourMoscow=0 preserves existing card milestones.
export function leaderboardBoundaries(now=new Date(),resetHourMoscow=3){
 const offset=(3-resetHourMoscow)*3600000,shifted=new Date(now.getTime()+offset);
 const day=Date.UTC(shifted.getUTCFullYear(),shifted.getUTCMonth(),shifted.getUTCDate())-offset;
 return {day:new Date(day).toISOString(),week:new Date(day-((shifted.getUTCDay()+6)%7)*86400000).toISOString(),month:new Date(Date.UTC(shifted.getUTCFullYear(),shifted.getUTCMonth(),1)-offset).toISOString()};
}
export function completedLeaderboardPeriods(now=new Date()){
 const b=leaderboardBoundaries(now),day=Date.parse(b.day),week=Date.parse(b.week),month=new Date(b.month);
 const previousMonth=Date.UTC(month.getUTCFullYear(),month.getUTCMonth()-1,1);
 const nextMonth=Date.UTC(month.getUTCFullYear(),month.getUTCMonth()+1,1);
 const iso=value=>new Date(value).toISOString();
 return {
  day:{start:iso(day-86400000),end:b.day,nextUpdate:iso(day+86400000)},
  week:{start:iso(week-7*86400000),end:b.week,nextUpdate:iso(week+7*86400000)},
  month:{start:iso(previousMonth),end:b.month,nextUpdate:iso(nextMonth)},
  total:{start:null,end:b.day,nextUpdate:iso(day+86400000)},
 };
}
