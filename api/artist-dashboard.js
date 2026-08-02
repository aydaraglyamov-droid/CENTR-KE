// api/artist-dashboard.js
// Serverless для Vercel — аккуратно вызывает внешние API только при наличии env-vars.
// Не кладите секреты в frontend. Все токены — в Vercel Environment Variables.

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
  // r.json.totals is array matching requested metrics
  const totals = r.json && r.json.totals ? r.json.totals : null;
  const [visits, users, pageviews] = totals || [null, null, null];
  return {
    ok: true,
    data: {
      streams: null,
      views: null,
      audience: users !== null ? Number(users) : null,
      streamsSource: "Yandex.Metrika",
      viewsSource: "Yandex.Metrika",
      audienceSource: "Yandex.Metrika",
      meta: { visits: visits, pageviews: pageviews }
    }
  };
}

async function loadBandlink() {
  // Band.link публичного API может не быть — здесь скелет запроса (только при наличии BANDLINK_API_URL & TOKEN)
  const urlBase = process.env.BANDLINK_API_URL;
  const token = process.env.BANDLINK_API_TOKEN;
  const linkId = process.env.BANDLINK_LINK_ID;
  if (!urlBase || !token || !linkId) return { ok: false, message: "BandLink not configured" };

  // Примерная конструкция — уточните у Band.link документацию/поддержку, endpoint может отличаться.
  const url = `${urlBase.replace(/\/$/, "")}/links/${encodeURIComponent(linkId)}/analytics`;
  const r = await fetchJson(url, { headers: { Authorization: "Bearer " + token, Accept: "application/json" } });
  if (!r.ok) return { ok: false, message: "BandLink API error", details: r };
  // Преобразуйте полученные данные в формат summary/tracks/platforms
  return { ok: true, data: r.json };
}

async function loadYouTube() {
  // Если у вас есть OAuth токен или server-side credentials для YouTube Analytics — реализуйте здесь.
  // Для простоты: возвращаем not configured.
  return { ok: false, message: "YouTube not configured" };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");

  const baseArtist = {
    artist: { name: process.env.ARTIST_NAME || "Казан Егетләре", description: process.env.ARTIST_DESC || "" },
    summary: {
      streams: null, views: null, audience: null,
      streamsSource: "Нет данных", viewsSource: "Нет данных", audienceSource: "Нет данных"
    },
    tracks: [],
    socials: {
      telegram: process.env.SOCIAL_TELEGRAM || "",
      vk: process.env.SOCIAL_VK || "",
      youtube: process.env.SOCIAL_YOUTUBE || ""
    },
    geo: [],
    monthly: [],
    platforms: [],
    sources: []
  };

  // Попробуем получить Yandex.Metrika
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

  // Попробуем BandLink (скелет)
  try {
    const b = await loadBandlink();
    if (b.ok && b.data) {
      // Трансформируйте данные в нужный формат — пример ниже лишь placeholder
      baseArtist.sources.push({ name: "BandLink", status: "ok", message: "Данные получены", meta: b.data });
    } else {
      baseArtist.sources.push({ name: "BandLink", status: "not_configured", message: b.message || "no token/url" });
    }
  } catch (e) {
    baseArtist.sources.push({ name: "BandLink", status: "error", message: String(e) });
  }

  // YouTube placeholder
  try {
    const ytv = await loadYouTube();
    baseArtist.sources.push({ name: "YouTube", status: ytv.ok ? "ok" : "not_configured", message: ytv.message || null });
  } catch (e) {
    baseArtist.sources.push({ name: "YouTube", status: "error", message: String(e) });
  }

  // Возвращаем аккуратно — нигде нет "демо" чисел
  return res.status(200).json(baseArtist);
}
