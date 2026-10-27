// One-off, manually triggered migration. Never targets the VPN Supabase project.
import pg from '../.migration/node_modules/pg/lib/index.js';
const { Client } = pg;
const required = ['SUPABASE_DB_URL', 'CLOUDFLARE_API_TOKEN', 'CF_ACCOUNT_ID', 'CF_D1_DATABASE_ID'];
for (const name of required) if (!process.env[name]) throw Error('Missing GitHub secret/environment variable: ' + name);
const apply = process.env.APPLY === 'true';
const client = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
const endpoint = `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/d1/database/${process.env.CF_D1_DATABASE_ID}/query`;
const quote = s => '"' + s.replaceAll('"', '""') + '"';
async function d1(sql, params = []) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.CLOUDFLARE_API_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params })
  });
  const payload = await response.json();
  if (!response.ok || !payload.success || payload.result?.some(r => r.success === false)) {
    throw Error('D1 request failed: ' + JSON.stringify(payload.errors || payload.result?.filter(r => !r.success)).slice(0, 700));
  }
  return payload.result?.[0]?.results || [];
}
const encode = v => v == null ? null : typeof v === 'boolean' ? Number(v) : typeof v === 'object' ? JSON.stringify(v) : v;
await client.connect();
try {
  const source = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name");
  const destination = new Set((await d1("SELECT name FROM sqlite_master WHERE type='table'")).map(r => r.name));
  for (const { table_name: table } of source.rows) {
    if (!destination.has(table)) throw Error('Missing destination table: ' + table);
    const cols = await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position", [table]);
    const names = cols.rows.map(r => r.column_name);
    const count = Number((await client.query('SELECT COUNT(*)::integer AS n FROM public.' + quote(table))).rows[0].n);
    console.log(table + ': source=' + count + (apply ? ' importing' : ' DRY RUN'));
    if (!apply) continue;
    const page = 25;
    for (let offset = 0; offset < count; offset += page) {
      const result = await client.query('SELECT * FROM public.' + quote(table) + ' ORDER BY 1 LIMIT $1 OFFSET $2', [page, offset]);
      for (const row of result.rows) {
        const sql = 'INSERT OR REPLACE INTO ' + quote(table) + ' (' + names.map(quote).join(',') + ') VALUES (' + names.map(() => '?').join(',') + ')';
        await d1(sql, names.map(name => encode(row[name])));
      }
    }
    const copied = (await d1('SELECT COUNT(*) AS n FROM ' + quote(table)))[0].n;
    console.log(table + ': destination=' + copied);
    if (copied !== count) throw Error('Count mismatch in ' + table + ': source ' + count + ', destination ' + copied);
  }
  console.log('Database table migration ' + (apply ? 'finished' : 'dry run finished') + '. Worker/auth/storage migration remains separate.');
} finally {
  await client.end();
}
