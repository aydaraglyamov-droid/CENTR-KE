/**
 * api/cors-proxy.js
 *
 * Server-side CORS proxy для обхода браузерных ограничений
 * Преобразует запросы с браузера через этот endpoint
 *
 * POST /api/cors-proxy
 * Body: { url: string, method?: string, headers?: object }
 * Returns: { ok: boolean, data: any, error?: string }
 */

export default async function handler(req, res) {
  // Только POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const { url, method = 'GET', headers = {} } = req.body;

  // Валидация URL
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid URL' });
  }

  // Whitelist разрешённых доменов (безопасность)
  const ALLOWED_DOMAINS = [
    'api.band.link',
    'api-metrica.yandex.net',
    'www.googleapis.com',
    'api.vk.com',
    'api.telegram.org',
    'api.spotify.com',
    'accounts.spotify.com'
  ];

  try {
    const urlObj = new URL(url);
    const isAllowed = ALLOWED_DOMAINS.some(domain => urlObj.hostname.includes(domain));

    if (!isAllowed) {
      return res.status(403).json({ error: `Domain ${urlObj.hostname} is not whitelisted` });
    }
  } catch (e) {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  try {
    const fetchOptions = {
      method: method.toUpperCase(),
      headers: {
        'User-Agent': 'CENTR-KE/1.0 (+https://github.com/aydaraglyamov-droid/CENTR-KE)',
        ...headers
      },
      timeout: 10000
    };

    // CORS headers (не пересылаем Origin, чтобы не было проблем)
    delete fetchOptions.headers['Origin'];
    delete fetchOptions.headers['Referer'];

    const response = await fetch(url, fetchOptions);

    // Обработка разных типов контента
    let data;
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      data = await response.json();
    } else if (contentType.includes('text/')) {
      data = await response.text();
    } else {
      data = await response.blob();
    }

    return res.status(200).json({
      ok: response.ok,
      status: response.status,
      data,
      headers: {
        contentType: response.headers.get('content-type'),
        cacheControl: response.headers.get('cache-control')
      }
    });
  } catch (error) {
    console.error('[CORS Proxy Error]', error.message);
    return res.status(503).json({
      ok: false,
      error: error.message,
      errorType: error.name
    });
  }
}
