import { STEAM_OPENID_ENDPOINT, STEAM_OPENID_NAMESPACE } from './steam-openid-config.mjs';

export async function verifySteamAssertion(callbackUrl, origin, fetcher = fetch) {
  const params = new URL(callbackUrl).searchParams;
  const claimed = params.get('openid.claimed_id') || '';
  const identity = params.get('openid.identity');
  const steamId = claimed.startsWith('https://steamcommunity.com/openid/id/')
    ? claimed.slice('https://steamcommunity.com/openid/id/'.length) : '';
  if (!/^7656119[0-9]{10}$/.test(steamId) || identity !== claimed) return null;
  if (params.get('openid.ns') !== STEAM_OPENID_NAMESPACE) return null;
  if (params.get('openid.mode') !== 'id_res') return null;
  if (params.get('openid.op_endpoint') !== STEAM_OPENID_ENDPOINT) return null;
  const returnTo = params.get('openid.return_to');
  if (!returnTo) return null;
  let target;
  try { target = new URL(returnTo); } catch { return null; }
  if (target.origin !== new URL(origin).origin || target.pathname !== '/auth/steam/callback') return null;
  if (!target.searchParams.get('state') || target.searchParams.get('state') !== params.get('state')) return null;
  const body = new URLSearchParams();
  for (const [key, value] of params) if (key.startsWith('openid.')) body.set(key, value);
  body.set('openid.mode', 'check_authentication');
  try {
    const response = await fetcher(STEAM_OPENID_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      redirect: 'error'
    });
    if (!response.ok) return null;
    const text = await response.text();
    return text.split('\n').some(line => line.trim() === 'is_valid:true') ? steamId : null;
  } catch { return null; }
}
