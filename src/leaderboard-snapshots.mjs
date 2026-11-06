import {achievementScoreSql} from './achievement-scoring.mjs';
import {completedLeaderboardPeriods} from './leaderboard-periods.mjs';

export function leaderboardSnapshotStatements(db,squadId,now=new Date()){
 const periods=completedLeaderboardPeriods(now),weight=achievementScoreSql();
 return Object.entries(periods).map(([period,range])=>{
  // The NOT EXISTS guard is evaluated before the scalar aggregate. Existing results
  // never scan the event ledger again, including when Cron and a page load race.
  const timeFilter=range.start?'julianday(e.occurred_at)>=julianday(?) AND julianday(e.occurred_at)<julianday(?)':"(e.occurred_at='0000-unknown' OR julianday(e.occurred_at)<julianday(?))";
  const times=range.start?[range.start,range.end]:[range.end];
  return db.prepare(`INSERT OR IGNORE INTO hub_leaderboard_snapshots(squad_id,period,period_end,period_start,scores,computed_at)
   SELECT ?,?,?,?,(SELECT json_group_array(json_object('id',id,'nick',nick,'points',points)) FROM (
    SELECT m.id,m.nick,COALESCE(SUM(${weight}),0) AS points FROM members m
    LEFT JOIN hub_achievement_events e ON e.member_id=m.id AND e.squad_id=m.squad_id AND (${timeFilter})
    WHERE m.squad_id=? AND m.is_active=1 GROUP BY m.id,m.nick
   )),? WHERE NOT EXISTS(SELECT 1 FROM hub_leaderboard_snapshots WHERE squad_id=? AND period=? AND period_end=?)`)
   .bind(squadId,period,range.end,range.start,...times,squadId,now.toISOString(),squadId,period,range.end);
 });
}
export async function getCompletedLeaderboards(db,squadId,now=new Date()){
 const periods=completedLeaderboardPeriods(now);
 // Populate missing results only. This also recovers an interrupted/missed Cron run.
 await db.batch(leaderboardSnapshotStatements(db,squadId,now));
 const results=await db.batch(Object.entries(periods).map(([period,r])=>db.prepare('SELECT scores,computed_at FROM hub_leaderboard_snapshots WHERE squad_id=? AND period=? AND period_end=?').bind(squadId,period,r.end)));
 const members=new Map();
 Object.keys(periods).forEach((period,index)=>{
  const row=results[index].results?.[0];if(!row)throw Error('leaderboard_snapshot_unavailable');
  const scores=JSON.parse(row.scores);periods[period].computedAt=row.computed_at;
  for(const score of scores){const id=String(score.id);if(!members.has(id))members.set(id,{id:score.id,nick:score.nick,day:0,week:0,month:0,total:0});members.get(id)[period]=Number(score.points)||0;}
 });
 return {leaderboard:[...members.values()],periods};
}
export async function refreshCompletedLeaderboards(db,now=new Date()){
 const squads=await db.prepare('SELECT DISTINCT squad_id FROM members WHERE is_active=1 AND squad_id IS NOT NULL').all();
 for(const {squad_id} of squads.results||[])await db.batch(leaderboardSnapshotStatements(db,squad_id,now));
 return {squads:(squads.results||[]).length,asOf:now.toISOString()};
}
