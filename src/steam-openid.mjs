import { STEAM_OPENID_ENDPOINT, STEAM_OPENID_NAMESPACE } from './steam-openid-config.mjs';

export function createSteamLoginUrl(origin, state) {
  const base = new URL(origin);
  const callback = new URL('/auth/steam/callback', base);
  callback.searchParams.set('state', state);
  const url = new URL(STEAM_OPENID_ENDPOINT);
  url.searchParams.set('openid.ns', STEAM_OPENID_NAMESPACE);
  url.searchParams.set('openid.mode', 'checkid_setup');
  url.searchParams.set('openid.return_to', callback.toString());
  url.searchParams.set('openid.realm', base.origin);
  url.searchParams.set('openid.identity', 'http://specs.openid.net/auth/2.0/identifier_select');
  url.searchParams.set('openid.claimed_id', 'http://specs.openid.net/auth/2.0/identifier_select');
  return url.toString();
}
