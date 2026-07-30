/**
 * BandLink smart-link resolver.
 *
 * The browser cannot read band.link directly (no CORS headers), so this function
 * fetches the public smart-link page server-side and extracts the useful bits:
 * release title, artist, cover art and the per-platform destinations that the
 * smart link forwards to. Result is cached on the Netlify CDN so the page stays
 * fast and band.link is not hit on every visit.
 *
 * GET /api/bandlink            -> default release (BANDLINK_CODE env var or HKtfe)
 * GET /api/bandlink?code=XXXXX -> any other smart link of the same artist
 */

const DEFAULT_CODE = 'HKtfe';
const CODE_RE = /^[A-Za-z0-9_-]{3,32}$/;
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

type Platform = { id: string; name: string; url: string; color: string; cta: string };

/** Known destinations, matched against the hostname + path of each link. */
const KNOWN: Array<{ id: string; name: string; color: string; cta: string; test: RegExp }> = [
  { id: 'yandex', name: 'Яндекс Музыка', color: '#FFCC00', cta: 'Слушать', test: /(^|\.)music\.yandex\.(ru|com|by|kz|uz)$/ },
  { id: 'vk', name: 'VK', color: '#0077FF', cta: 'Открыть', test: /(^|\.)vk\.(com|ru)$/ },
  { id: 'spotify', name: 'Spotify', color: '#1DB954', cta: 'Слушать', test: /(^|\.)(open\.)?spotify\.com$/ },
  { id: 'apple', name: 'Apple Music', color: '#FA243C', cta: 'Слушать', test: /(^|\.)music\.apple\.com$/ },
  { id: 'youtube', name: 'YouTube', color: '#FF0000', cta: 'Смотреть', test: /(^|\.)(youtube\.com|youtu\.be|music\.youtube\.com)$/ },
  { id: 'zvuk', name: 'Звук', color: '#8B5CF6', cta: 'Слушать', test: /(^|\.)zvuk\.com$|(^|\.)sber-zvuk\.com$/ },
  { id: 'mts', name: 'МТС Музыка', color: '#E30611', cta: 'Слушать', test: /(^|\.)music\.mts\.ru$/ },
  { id: 'deezer', name: 'Deezer', color: '#A238FF', cta: 'Слушать', test: /(^|\.)deezer\.com$/ },
  { id: 'soundcloud', name: 'SoundCloud', color: '#FF5500', cta: 'Слушать', test: /(^|\.)soundcloud\.com$/ },
  { id: 'tiktok', name: 'TikTok', color: '#69C9D0', cta: 'Открыть', test: /(^|\.)tiktok\.com$/ },
  { id: 'telegram', name: 'Telegram', color: '#2AABEE', cta: 'Открыть', test: /(^|\.)(t\.me|telegram\.me)$/ },
  { id: 'rutube', name: 'Rutube', color: '#00A0DC', cta: 'Смотреть', test: /(^|\.)rutube\.ru$/ },
];

/** Undo the JSON/flight escaping used inside the Next.js payload. */
function unescapePayload(raw: string): string {
  return raw
    .replace(/\\u0026|u0026/g, '&')
    .replace(/\\u002F/gi, '/')
    .replace(/\\"/g, '"')
    .replace(/\\\//g, '/');
}

function meta(html: string, property: string): string {
  const patterns = [
    new RegExp(`<meta[^>]+property="${property}"[^>]+content="([^"]*)"`, 'i'),
    new RegExp(`<meta[^>]+content="([^"]*)"[^>]+property="${property}"`, 'i'),
    new RegExp(`<meta[^>]+name="${property}"[^>]+content="([^"]*)"`, 'i'),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return decodeEntities(m[1].trim());
  }
  return '';
}

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/** Collect every candidate destination URL that appears in a "links" array. */
function extractPlatforms(html: string): Platform[] {
  const payload = unescapePayload(html);
  const candidates: string[] = [];

  for (const block of payload.matchAll(/"links"\s*:\s*\[(.*?)\]/gs)) {
    for (const link of block[1].matchAll(/"url"\s*:\s*"(https?:\/\/[^"]+)"/g)) {
      candidates.push(link[1]);
    }
  }

  const seen = new Set<string>();
  const out: Platform[] = [];
  for (const raw of candidates) {
    let host: string;
    try {
      host = new URL(raw).hostname.toLowerCase();
    } catch {
      continue;
    }
    const known = KNOWN.find((k) => k.test.test(host));
    if (!known || seen.has(known.id)) continue;
    seen.add(known.id);
    out.push({ id: known.id, name: known.name, url: raw, color: known.color, cta: known.cta });
  }
  return out;
}

/** Split "Artist - Release | BandLink" into its parts. */
function splitTitle(title: string): { artist: string; release: string } {
  const clean = title.replace(/\s*\|\s*BandLink\s*$/i, '').trim();
  const dash = clean.indexOf(' - ');
  if (dash > 0) {
    return { artist: clean.slice(0, dash).trim(), release: clean.slice(dash + 3).trim() };
  }
  return { artist: clean, release: clean };
}

export default async (req: Request) => {
  const code = (new URL(req.url).searchParams.get('code') || process.env.BANDLINK_CODE || DEFAULT_CODE).trim();
  const smartLink = `https://band.link/${CODE_RE.test(code) ? code : DEFAULT_CODE}`;

  let html = '';
  try {
    const upstream = await fetch(smartLink, {
      headers: { 'user-agent': UA, 'accept-language': 'ru-RU,ru;q=0.9', accept: 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(12_000),
    });
    if (!upstream.ok) throw new Error(`band.link ответил ${upstream.status}`);
    html = await upstream.text();
  } catch (err) {
    return Response.json(
      {
        ok: false,
        url: smartLink,
        error: err instanceof Error ? err.message : 'не удалось получить страницу BandLink',
      },
      { status: 502, headers: { 'cache-control': 'no-store' } },
    );
  }

  const rawTitle = meta(html, 'og:title') || (html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? '');
  const { artist, release } = splitTitle(decodeEntities(rawTitle));
  const platforms = extractPlatforms(html);
  const yandex = platforms.find((p) => p.id === 'yandex');
  const vk = platforms.find((p) => p.id === 'vk');

  return Response.json(
    {
      ok: true,
      code,
      url: smartLink,
      artist,
      release,
      description: meta(html, 'og:description'),
      cover: meta(html, 'og:image'),
      platforms,
      // Handy identifiers the dashboard can reuse as connection defaults.
      ymArtistId: yandex?.url.match(/artist\/(\d+)/)?.[1] ?? null,
      vkScreenName: vk?.url.match(/(?:vk\.(?:com|ru))\/([A-Za-z0-9._]+)/)?.[1] ?? null,
      fetchedAt: new Date().toISOString(),
    },
    {
      headers: {
        // Browsers revalidate; the CDN serves a cached copy for 30 minutes.
        'cache-control': 'public, max-age=0, must-revalidate',
        'netlify-cdn-cache-control': 'public, s-maxage=1800, stale-while-revalidate=86400',
      },
    },
  );
};

export const config = {
  path: '/api/bandlink',
  method: 'GET',
};
