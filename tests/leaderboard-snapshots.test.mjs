import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {getCompletedLeaderboards,refreshCompletedLeaderboards} from '../src/leaderboard-snapshots.mjs';
import {completedLeaderboardPeriods} from '../src/leaderboard-periods.mjs';
function setup(){
 const sql=new DatabaseSync(':memory:');let observed=0;
 sql.function('observe_metric',value=>{observed++;return value});
 sql.exec(`CREATE TABLE members(id TEXT,squad_id TEXT,nick TEXT,is_active INTEGER);
 INSERT INTO members VALUES('u','a','Player',1),('v','b','Private',1);
 CREATE TABLE event_rows(squad_id TEXT,member_id TEXT,metric TEXT,event_key TEXT,occurred_at TEXT);
 CREATE VIEW hub_achievement_events AS SELECT squad_id,member_id,observe_metric(metric) AS metric,event_key,occurred_at FROM event_rows;`);
 sql.exec(readFileSync(new URL('../migrations/20261106_leaderboard_snapshots.sql',import.meta.url),'utf8'));
 const db={prepare(query){let args=[];return {bind(...a){args=a;return this},async all(){return {results:sql.prepare(query).all(...args)}}}},async batch(statements){const results=[];for(const s of statements)results.push(await s.all());return results}};
 return {sql,db,observed:()=>observed};
}
test('completed periods cover the last day, week and calendar month at 03:00 Moscow',()=>{
 const p=completedLeaderboardPeriods(new Date('2026-11-09T00:00:00Z'));
 assert.deepEqual(p.day,{start:'2026-11-08T00:00:00.000Z',end:'2026-11-09T00:00:00.000Z',nextUpdate:'2026-11-10T00:00:00.000Z'});
 assert.deepEqual(p.week,{start:'2026-11-02T00:00:00.000Z',end:'2026-11-09T00:00:00.000Z',nextUpdate:'2026-11-16T00:00:00.000Z'});
 assert.deepEqual(p.month,{start:'2026-10-01T00:00:00.000Z',end:'2026-11-01T00:00:00.000Z',nextUpdate:'2026-12-01T00:00:00.000Z'});
 assert.equal(completedLeaderboardPeriods(new Date('2027-01-01T00:00:00Z')).month.start,'2026-12-01T00:00:00.000Z');
});
test('published scores are immutable and subsequent loads do not scan the event ledger',async()=>{
 const {sql,db,observed}=setup();sql.exec("INSERT INTO event_rows VALUES('a','u','presence','old','2026-11-05T12:00:00Z'),('a','u','task','today','2026-11-06T01:00:00Z'),('b','v','task','private','2026-11-05T12:00:00Z')");
 const first=await getCompletedLeaderboards(db,'a',new Date('2026-11-06T12:00:00Z')),reads=observed();
 assert.ok(reads>0);assert.equal(first.leaderboard[0].day,2);assert.equal(first.leaderboard[0].total,2);assert.equal(first.leaderboard.length,1);
 sql.exec("INSERT INTO event_rows VALUES('a','u','marker','late','2026-11-05T13:00:00Z')");
 const second=await getCompletedLeaderboards(db,'a',new Date('2026-11-06T18:00:00Z'));
 assert.deepEqual(second,first);assert.equal(observed(),reads);
 const next=await getCompletedLeaderboards(db,'a',new Date('2026-11-07T00:00:00Z'));
 assert.equal(next.leaderboard[0].day,20);assert.equal(next.leaderboard[0].total,27);
 assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM hub_leaderboard_snapshots').get().n,6);
});
test('Cron refreshes active squads without a visitor, and recalculates weeks only on Monday',async()=>{
 const {sql,db,observed}=setup();sql.exec("INSERT INTO event_rows VALUES('a','u','task','x','2026-11-08T12:00:00Z')");
 assert.equal((await refreshCompletedLeaderboards(db,new Date('2026-11-08T00:00:00Z'))).squads,2);
 const before=observed();await refreshCompletedLeaderboards(db,new Date('2026-11-08T00:00:00Z'));assert.equal(observed(),before);
 await refreshCompletedLeaderboards(db,new Date('2026-11-09T00:00:00Z'));
 const rows=sql.prepare("SELECT period,COUNT(*) AS n FROM hub_leaderboard_snapshots WHERE squad_id='a' GROUP BY period").all();
 assert.deepEqual(Object.fromEntries(rows.map(x=>[x.period,x.n])),{day:2,month:1,total:2,week:2});
 const result=await getCompletedLeaderboards(db,'a',new Date('2026-11-09T00:00:00Z'));assert.equal(result.leaderboard[0].week,20);
});
test('achievement screen schedules one refresh at the next daily result, with no interval polling',async()=>{
 const timers=[],listeners={};let clock=Date.parse('2026-11-06T12:00:00Z'),calls=0;
 class ClockDate extends Date{static now(){return clock}}
 const context=vm.createContext({Date:ClockDate,document:{visibilityState:'visible',addEventListener:(type,fn)=>{listeners[type]=fn}},setTimeout:(fn,delay)=>{timers.push({fn,delay});return timers.length},clearTimeout:()=>{},page:'Достижения',countCall:()=>{calls++}});
 vm.runInContext(readFileSync(new URL('../achievements.js',import.meta.url),'utf8'),context);
 vm.runInContext("hubAchievements={periods:{day:{nextUpdate:'2026-11-07T00:00:00Z'}}};achievementsPage=async()=>countCall();scheduleAchievementSnapshotRefresh()",context);
 assert.equal(timers.length,1);assert.equal(timers[0].delay,12*3600000+1000);assert.equal(calls,0);
 clock=Date.parse('2026-11-07T00:00:01Z');await timers[0].fn();assert.equal(calls,1);
 context.document.visibilityState='hidden';await timers[0].fn();assert.equal(calls,1);
 context.document.visibilityState='visible';await listeners.visibilitychange();assert.equal(calls,2);
});
test('the existing shared 30-second poll skips the achievements screen',async()=>{
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8'),start=source.indexOf('function startSharedSync()'),end=source.indexOf('\n',start);
 let tick,calls=0;const channel={on(){return this},subscribe(){return this}};
 const context=vm.createContext({window:{},document:{visibilityState:'visible'},onlineMember:{id:'u'},page:'Достижения',setInterval:fn=>{tick=fn},sb:{channel:()=>channel},scheduleSync(){},syncOnline:async()=>{calls++},refreshWallMetric:async()=>{},console});
 vm.runInContext(source.slice(start,end)+';startSharedSync()',context);await tick();assert.equal(calls,0);
 context.page='Главная';await tick();assert.equal(calls,1);
});
