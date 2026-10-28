import { STEAM_OPENID_ENDPOINT, STEAM_OPENID_NAMESPACE } from './steam-openid-config.mjs';

export async function verifySteamAssertion(callbackUrl, origin, fetcher = fetch, onFailure = () => {}) {
  const params = new URL(callbackUrl).searchParams;
  const claimed = params.get('openid.claimed_id') || '';
  const identity = params.get('openid.identity');
  const steamId = claimed.startsWith('https://steamcommunity.com/openid/id/')
    ? claimed.slice('https://steamcommunity.com/openid/id/'.length) : '';
  const fail = reason => { onFailure(reason); return null; };
  if (!/^7656119[0-9]{10}$/.test(steamId) || identity !== claimed) return fail('identity');
  if (params.get('openid.ns') !== STEAM_OPENID_NAMESPACE) return fail('namespace');
  if (params.get('openid.mode') !== 'id_res') return fail('mode');
  if (params.get('openid.op_endpoint') !== STEAM_OPENID_ENDPOINT) return fail('endpoint');
  const returnTo = params.get('openid.return_to');
  if (!returnTo) return fail('return_to_missing');
  let target;
  try { target = new URL(returnTo); } catch { return fail('return_to_invalid'); }
  if (target.origin !== new URL(origin).origin || target.pathname !== '/auth/steam/callback') return fail('return_to_mismatch');
  if (!target.searchParams.get('state') || target.searchParams.get('state') !== params.get('state')) return fail('state_mismatch');
  const body = new URLSearchParams();
  for (const [key, value] of params) if (key.startsWith('openid.')) body.set(key, value);
  body.set('openid.mode', 'check_authentication');
  try {
    const response = await fetcher(STEAM_OPENID_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      redirect: 'manual'
    });
    if (response.status >= 300 && response.status < 400) return fail('provider_redirect');
    if (!response.ok) return fail('provider_http_'+response.status);
    const text = await response.text();
    return text.split('\n').some(line => line.trim() === 'is_valid:true') ? steamId : fail('provider_rejected');
  } catch (error) {
    console.warn('steam_provider_fetch_error', error instanceof Error ? error.name : 'unknown', error instanceof Error ? String(error.message).slice(0,180) : 'unknown');
    return fail('provider_network');
  }
}
