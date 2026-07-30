/**
 * Public site configuration.
 *
 * The site is a plain static page with no build step, so values that must apply
 * to every visitor (rather than just the operator's own browser) are read from
 * Netlify environment variables here. Only the explicitly listed public keys are
 * exposed — nothing else from the environment is ever returned.
 *
 * Set these in Netlify → Project configuration → Environment variables:
 *   YANDEX_METRIKA_ID  — Metrika counter number, e.g. 12345678
 *   BANDLINK_CODE      — smart-link code, defaults to HKtfe
 *   VK_GROUP           — VK community short name, defaults to kazan_egetlare
 *   YM_ARTIST_ID       — Yandex Music artist id, defaults to 4160836
 *   TG_CHANNEL         — Telegram channel @username
 *   YT_CHANNEL         — YouTube channel id or @handle
 */

const PUBLIC_DEFAULTS = {
  metrikaId: '',
  bandlinkCode: 'HKtfe',
  vkGroup: 'kazan_egetlare',
  ymArtist: '4160836',
  tgChannel: '',
  ytChannel: '',
};

export default async () => {
  const env = (name: string) => (process.env[name] || '').trim();

  const metrikaId = env('YANDEX_METRIKA_ID').replace(/\D/g, '');

  return Response.json(
    {
      // A Metrika counter id is public by design — it ships inside the tracking tag.
      metrikaId: metrikaId || PUBLIC_DEFAULTS.metrikaId,
      bandlinkCode: env('BANDLINK_CODE') || PUBLIC_DEFAULTS.bandlinkCode,
      vkGroup: env('VK_GROUP') || PUBLIC_DEFAULTS.vkGroup,
      ymArtist: env('YM_ARTIST_ID') || PUBLIC_DEFAULTS.ymArtist,
      tgChannel: env('TG_CHANNEL') || PUBLIC_DEFAULTS.tgChannel,
      ytChannel: env('YT_CHANNEL') || PUBLIC_DEFAULTS.ytChannel,
      metrikaConfigured: Boolean(metrikaId),
    },
    {
      headers: {
        'cache-control': 'public, max-age=0, must-revalidate',
        'netlify-cdn-cache-control': 'public, s-maxage=300, stale-while-revalidate=3600',
      },
    },
  );
};

export const config = {
  path: '/api/config',
  method: 'GET',
};
