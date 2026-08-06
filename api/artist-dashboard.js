// api/artist-dashboard.js
// Версия: отдаёт socials из ENV, иначе использует ваши предоставленные ссылки.
// Добавлен demo режим: если DEMO_MODE=1 или отсутствуют ключевые ENV, возвращается демонстрационный набор данных.

const YANDEX_STAT_URL = "https://api-metrika.yandex.net/stat/v1/data";

async function fetchJson(url, opts = {}) {
  try {
    const res = await fetch(url, opts);
    const text = await res.text();
    try { return { ok: res.ok, status: res.status, json: JSON.parse(text) }; }
    catch { return { ok: res.ok, status: res.status, text }; }
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

function demoData() {
  const now = new Date().toISOString();
  const tracks = [
    { title: 'Татарский хит', platform: 'Spotify', streams: 125430, audioUrl: '', coverUrl: '', source: 'DEMO', updatedAt: now },
    { title: 'Лирический сингл', platform: 'YouTube', streams: 84210, audioUrl: '', coverUrl: '', source: 'DEMO', updatedAt: now },
    { title: 'Челлендж', platform: 'TikTok', streams: 43200, audioUrl: '', coverUrl: '', source: 'DEMO', updatedAt: now }
  ];
  return {
    artist: { name: process.env.ARTIST_NAME || 'Казан Егетләре (DEMO)', description: process.env.ARTIST_DESC || 'Демонстрационные данные' },
    summary: { streams: 252940, views: 84210, audience: 48200, streamsSource: 'DEMO', viewsSource: 'DEMO', audienceSource: 'DEMO' },
    tracks,
    socials: {
      telegram: process.env.SOCIAL_TELEGRAM || 'https://t.me/kazanegetlare',
      vk: process.env.SOCIAL_VK || 'https://vk.com/kazan_egetlare',
      youtube: process.env.SOCIAL_YOUTUBE || 'https://youtube.com/',
      instagram: process.env.SOCIAL_INSTAGRAM || 'https://instagram.com/',
      spotify: process.env.SOCIAL_SPOTIFY || 'https://open.spotify.com/',
      bandlink: process.env.BANDLINK_LINK || 'https://band.link/HKtfe'
    },
    geo: [{ name: 'Россия', value: 34000 }, { name: 'Казань', value: 8200 }],
    monthly: [{ month: '2026-06', streams: 80000 }, { month: '2026-07', streams: 90000 }],
    platforms: [{ name: 'Spotify', value: 125430 }, { name: 'YouTube', value: 84210 }],
    sources: [{ name: 'DEMO', status: 'ok', message: 'Demo data' }]
  };
}

async function loadYandexMetrika() {
  const id = process.env.YANDEX_COUNTER_ID;
  const token = process.env.YANDEX_OAUTH_TOKEN;
  if (!id || !token) return { ok: false, message: "YANDEX not configured" };

  const params = new URLSearchParams({
    ids: id,
    metrics: "ym:s:visits,ym:s:users,ym:s:pageviews",
    date1: "30daysAgo",
    date2: "today",
    accuracy: "full"
  });
  const url = `${YANDEX_STAT_URL}?${params.toString()}`;
  const r = await fetchJson(url, { headers: { Authorization: "OAuth " + token, Accept: "application/json" } });
  if (!r.ok) return { ok: false, message: "Yandex API error", details: r };
  const totals = r.json && r.json.totals ? r.json.totals : null;
  const [visits, users, pageviews] = totals || [null, null, null];
  return {
    ok: true,
    data: {
      audience: users !== null ? Number(users) : null,
      streams: null,
      views: null,
      streamsSource: "Yandex.Metrika",
      viewsSource: "Yandex.Metrika",
      audienceSource: "Yandex.Metrika",
      meta: { visits, pageviews }
    }
  };
}

async function loadBandlink() {
  const urlBase = process.env.BANDLINK_API_URL;
  const token = process.env.BANDLINK_API_TOKEN;
  const linkId = process.env.BANDLINK_LINK_ID;
  if (!urlBase || !token || !linkId) return { ok: false, message: "BandLink not configured" };
  const url = `${urlBase.replace(/\/$/, "")}/links/${encodeURIComponent(linkId)}/analytics`;
  const r = await fetchJson(url, { headers: { Authorization: "Bearer " + token, Accept: "application/json" } });
  if (!r.ok) return { ok: false, message: "BandLink API error", details: r };
  return { ok: true, data: r.json };
}

async function loadYouTube() {
  return { ok: false, message: "YouTube not configured" };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");

  // socials: берём из ENV, иначе используем ваши ссылки
  const socials = {
    telegram: process.env.SOCIAL_TELEGRAM || "https://t.me/kazanegetlare",
    vk: process.env.SOCIAL_VK || "https://m.vk.ru/kazan_egetlare",
    youtube: process.env.SOCIAL_YOUTUBE || "https://youtube.com/@kazan_egetlare?si=3Zr04EaO4P8SVA7I",
    instagram: process.env.SOCIAL_INSTAGRAM || "https://www.instagram.com/kazan_egetlare_official",
    yandexMusic: process.env.SOCIAL_YANDEX_MUSIC || "https://music.yandex.ru/artist/4160836",
    vkMusic: process.env.SOCIAL_VK_MUSIC || "https://m.vk.ru/artist/kazanegetlere_mty2mdezndi2nw",
    appleMusic: process.env.SOCIAL_APPLE_MUSIC || "https://music.apple.com/ru/artist/казан-егетлэре/1465783242",
    spotify: process.env.SOCIAL_SPOTIFY || "https://open.spotify.com/artist/1LeBwJlewl0ohEQIchqZPP?utm_source=openai",
    bandlink: process.env.BANDLINK_LINK || "https://band.link/HKtfe",
    bandlinkManage: process.env.BANDLINK_MANAGE || "https://band.link/manage/analytics/yandex-music",
    metrikaList: process.env.METRIKA_LIST || "https://metrika.yandex.ru/list?category=myCounters&sort_by=Name"
  };

  // If DEMO_MODE=1 explicitly set, return demo data immediately
  const demoEnv = String(process.env.DEMO_MODE || '').toLowerCase();
  const shouldForceDemo = demoEnv === '1' || demoEnv === 'true';
  const hasDataEnv = !!(process.env.YANDEX_COUNTER_ID || process.env.BANDLINK_API_URL);
  if (shouldForceDemo || !hasDataEnv) {
    const d = demoData();
    // mark sources: if not forcing demo but missing envs, note that these are placeholders
    if (!shouldForceDemo) d.sources = [{ name: 'DEMO', status: 'fallback', message: 'Required ENV not found; returning demo data' }];
    return res.status(200).json(d);
  }

  const baseArtist = {
    artist: { name: process.env.ARTIST_NAME || "Казан Егетләре", description: process.env.ARTIST_DESC || "" },
    summary: {
      streams: null, views: null, audience: null,
      streamsSource: "Нет данных", viewsSource: "Нет данных", audienceSource: "Нет данных"
    },
    tracks: [],
    socials,
    geo: [],
    monthly: [],
    platforms: [],
    sources: []
  };

  // Yandex
  try {
    const y = await loadYandexMetrika();
    if (y.ok && y.data) {
      baseArtist.summary.audience = y.data.audience ?? baseArtist.summary.audience;
      baseArtist.summary.audienceSource = y.data.audience !== null ? y.data.audienceSource : baseArtist.summary.audienceSource;
      baseArtist.sources.push({ name: "Yandex.Metrika", status: "ok", message: "Данные получены", meta: y.data.meta || null });
    } else {
      baseArtist.sources.push({ name: "Yandex.Metrika", status: "not_configured", message: y.message || "no token/ID" });
    }
  } catch (e) {
    baseArtist.sources.push({ name: "Yandex.Metrika", status: "error", message: String(e) });
  }

  // BandLink
  try {
    const b = await loadBandlink();
    if (b.ok && b.data) {
      // If BandLink returns tracks/metrics, merge lightly (implementation depends on BandLink API shape)
      baseArtist.sources.push({ name: "BandLink", status: "ok", message: "Данные получены", meta: b.data });
    } else {
      baseArtist.sources.push({ name: "BandLink", status: "not_configured", message: b.message || "no token/url" });
    }
  } catch (e) {
    baseArtist.sources.push({ name: "BandLink", status: "error", message: String(e) });
  }

  // YouTube
  try {
    const ytv = await loadYouTube();
    baseArtist.sources.push({ name: "YouTube", status: ytv.ok ? "ok" : "not_configured", message: ytv.message || null });
  } catch (e) {
    baseArtist.sources.push({ name: "YouTube", status: "error", message: String(e) });
  }

  return res.status(200).json(baseArtist);
}
