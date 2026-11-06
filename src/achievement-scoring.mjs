export const achievementPoints={presence:2,marker:5,stash:10,refresh:3,protect:10,task:20};
export function achievementScoreSql(alias='e'){
 return 'CASE '+alias+'.metric '+Object.entries(achievementPoints).map(([metric,points])=>"WHEN '"+metric+"' THEN "+points).join(' ')+' ELSE 0 END';
}
