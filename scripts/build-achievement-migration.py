from pathlib import Path
# Generate triggers and a repeatable historical backfill from exactly the same SQL.
now="strftime('%Y-%m-%dT%H:%M:%fZ','now')"
columns='squad_id,member_id,metric,event_key,occurred_at'
sql=['''-- Durable automatic achievements. No source records are changed.
CREATE TABLE IF NOT EXISTS hub_achievement_events (
 squad_id TEXT NOT NULL, member_id TEXT NOT NULL, metric TEXT NOT NULL,
 event_key TEXT NOT NULL, occurred_at TEXT NOT NULL,
 PRIMARY KEY(squad_id,member_id,metric,event_key)
);
CREATE INDEX IF NOT EXISTS hub_achievement_member ON hub_achievement_events(squad_id,member_id,metric,occurred_at);
CREATE UNIQUE INDEX IF NOT EXISTS hub_achievement_source ON hub_achievement_events(squad_id,metric,event_key) WHERE metric IN ('stash','marker','vehicle','enemy','task','refresh');
''']
rules=[
 ('presence_history','presence','member_id','day',"status IN ('Буду','Не буду','Под вопросом')",'updated_at'),
 ('presence_history','ready','member_id','day',"status='Буду'",'updated_at'),
 ('squad_place_posts','stash','created_by',"'post:'||id","kind='stash'",'created_at'),
 ('squad_place_posts','marker','created_by',"'post:'||id","kind IN ('stash','base','other')",'created_at'),
 ('squad_place_posts','vehicle','created_by',"'post:'||id","comment LIKE 'Машина:%'",'created_at'),
 ('squad_place_posts','enemy','created_by',"'post:'||id","kind='base' AND COALESCE(comment,'') NOT LIKE 'Машина:%'",'created_at'),
 ('squad_map_markers','marker','created_by',"'map:'||id","id NOT GLOB '*-post-[0-9]*'",'updated_at'),
 ('squad_map_markers','vehicle','created_by',"'map:'||id","type IN ('vehicle','car','transport') AND id NOT GLOB '*-post-[0-9]*'",'updated_at'),
 ('squad_map_markers','enemy','created_by',"'map:'||id","type IN ('base','enemy','enemy_base') AND id NOT GLOB '*-post-[0-9]*'",'updated_at'),
 ('squad_map_markers','stash','created_by',"'map:'||id","type='stash' AND id NOT GLOB '*-post-[0-9]*'",'updated_at'),
 ('squad_place_posts','refresh','stash_checked_by',"id||':'||date(stash_checked_at,'+3 hours')","kind='stash' AND stash_checked_at IS NOT NULL",'stash_checked_at'),
 ('tasks','task','assignee_id',"'task:'||id","status='Выполнено'",'created_at'),
]
# Prefix SQL column references with NEW for triggers, using a small lexer.
import re
cols=['squad_id','member_id','created_by','assignee_id','day','status','id','kind','comment','type','updated_at','created_at','stash_checked_at','stash_checked_by']
def pref(expr):
 return re.sub(r"'[^']*'|\b(?:"+'|'.join(cols)+r")\b",lambda m:m[0] if m[0].startswith("'") else 'NEW.'+m[0],expr)
for i,(table,metric,actor,key,condition,time) in enumerate(rules):
 valid=f"{actor} IS NOT NULL AND {key} IS NOT NULL AND ({condition}) AND EXISTS(SELECT 1 FROM members m WHERE m.id={table}.{actor} AND m.squad_id={table}.squad_id)"
 expr=f"squad_id,{actor},'{metric}',{key},COALESCE({time},{now})"
 # Backfill has no exact task completion timestamp; show unknown date for these awards.
 if metric=='task':expr=f"squad_id,{actor},'{metric}',{key},'0000-unknown'"
 sql.append(f"INSERT OR IGNORE INTO hub_achievement_events({columns}) SELECT {expr} FROM {table} WHERE {valid};")
 for action in ('INSERT','UPDATE'):
  # Creation counters never transfer to a different editor on subsequent saves.
  if metric in ('stash','marker','vehicle','enemy') and action=='UPDATE':
   # A conversion to a stash is a real new stash, but ordinary edits aren't.
   if not (table=='squad_place_posts' and metric=='stash'):continue
   extra=" AND OLD.kind IS NOT NEW.kind"
  elif metric=='task' and action=='UPDATE':extra=" AND OLD.status IS NOT 'Выполнено'"
  else:extra=''
  validnew=pref(f"{actor} IS NOT NULL AND {key} IS NOT NULL AND ({condition})")+f" AND EXISTS(SELECT 1 FROM members m WHERE m.id=NEW.{actor} AND m.squad_id=NEW.squad_id)"+extra
  # Task completion time is known for new events, regardless of task creation time.
  timestamp=now if metric=='task' else f'COALESCE(NEW.{time},{now})'
  sql.append(f"CREATE TRIGGER IF NOT EXISTS hub_ach_{i}_{action.lower()} AFTER {action} ON {table} WHEN {validnew} BEGIN INSERT OR IGNORE INTO hub_achievement_events({columns}) VALUES(NEW.squad_id,NEW.{actor},'{metric}',{pref(key)},{timestamp}); END;")
# One protect contribution per member every nine hours (one full protection cycle).
sql.append(f"""
INSERT OR IGNORE INTO hub_achievement_events({columns})
SELECT squad_id,member_id,'protect','protect:'||id,COALESCE(updated_at,{now}) FROM protect_updates p
WHERE member_id IS NOT NULL AND EXISTS(SELECT 1 FROM members m WHERE m.id=p.member_id AND m.squad_id=p.squad_id)
AND NOT EXISTS(SELECT 1 FROM protect_updates q WHERE q.squad_id=p.squad_id AND q.member_id=p.member_id AND julianday(q.updated_at)<julianday(p.updated_at) AND julianday(q.updated_at)>julianday(p.updated_at)-9.0/24);
CREATE TRIGGER IF NOT EXISTS hub_ach_protect AFTER INSERT ON protect_updates
WHEN NEW.member_id IS NOT NULL AND EXISTS(SELECT 1 FROM members m WHERE m.id=NEW.member_id AND m.squad_id=NEW.squad_id)
AND NOT EXISTS(SELECT 1 FROM hub_achievement_events e WHERE e.squad_id=NEW.squad_id AND e.member_id=NEW.member_id AND e.metric='protect' AND julianday(e.occurred_at)>julianday(COALESCE(NEW.updated_at,{now}))-9.0/24)
BEGIN INSERT OR IGNORE INTO hub_achievement_events({columns}) VALUES(NEW.squad_id,NEW.member_id,'protect','protect:'||NEW.id,COALESCE(NEW.updated_at,{now})); END;
""")
Path('migrations/20261106_achievements.sql').write_text('\n\n'.join(sql)+'\n')
