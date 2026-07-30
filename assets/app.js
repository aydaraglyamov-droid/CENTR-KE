/* ==================================================================
   Kazan Egetläre — career dashboard
   Vanilla JS, no build step. Sections:
     1. constants & state      7. stats render + charts
     2. helpers                8. social embeds
     3. Yandex.Metrika         9. AI agents
     4. settings              10. export / report
     5. platform APIs         11. init
     6. BandLink smart link
   ================================================================== */
(function () {
  'use strict';

  /* ---------------- 1. constants & state ---------------- */

  var SETTINGS_KEY = 'ke_settings_v1';
  var HISTORY_KEY = 'ke_history_v1';
  var REFRESH_MS = 5 * 60 * 1000;
  var HISTORY_MAX = 240;

  var DEFAULTS = {
    bandlinkCode: 'HKtfe',
    metrikaId: '',
    ytKey: '',
    ytChannel: '',
    vkKey: '',
    vkGroup: 'kazan_egetlare',
    tgToken: '',
    tgChannel: '',
    tgPost: '',
    ymArtist: '4160836',
    ttUser: '',
    /* set once the operator saves the form by hand — until then, values coming
       from /api/config (Netlify environment variables) win over these defaults */
    touched: false
  };

  var GOALS = [
    ['bandlink_open', 'Клик по умной ссылке BandLink'],
    ['bandlink_analytics', 'Переход в кабинет статистики BandLink'],
    ['link_copied', 'Ссылка релиза скопирована'],
    ['share_click', 'Нажата кнопка «поделиться»'],
    ['qr_download', 'Скачан QR-код релиза'],
    ['platform_click', 'Клик по площадке в умной ссылке'],
    ['data_refreshed', 'Обновление статистики площадок'],
    ['report_generated', 'Сформирован отчет ИИ-агента'],
    ['report_saved', 'Отчет скачан или скопирован'],
    ['settings_saved', 'Сохранены настройки подключений']
  ];

  var UTM_CHANNELS = [
    { key: 'vk', label: 'VK' },
    { key: 'telegram', label: 'Telegram' },
    { key: 'youtube', label: 'YouTube' },
    { key: 'tiktok', label: 'TikTok' },
    { key: 'instagram', label: 'Instagram' },
    { key: 'qr', label: 'QR / афиша' },
    { key: 'bio', label: 'Ссылка в био' }
  ];

  var S = load(SETTINGS_KEY, DEFAULTS);
  var series = load(HISTORY_KEY, []);
  if (!Array.isArray(series)) series = [];

  var pub = null;              // /api/config payload
  var release = null;          // /api/bandlink payload
  var data = { yt: null, vk: null, tg: null };
  var lastReport = '';
  var refreshTimer = null;
  var nextRefreshAt = 0;
  var vkSeq = 0;
  var qrAuto = '';
  var currentPage = 'dash';

  /* ---------------- 2. helpers ---------------- */

  function $(id) { return document.getElementById(id); }
  function all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function load(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return clone(fallback);
      var parsed = JSON.parse(raw);
      if (Array.isArray(fallback)) return Array.isArray(parsed) ? parsed : clone(fallback);
      return Object.assign(clone(fallback), parsed);
    } catch (e) { return clone(fallback); }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* quota / private mode */ }
  }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  function fmt(n) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return Math.round(n).toLocaleString('ru-RU');
  }
  function fmtShort(n) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    var a = Math.abs(n);
    if (a >= 999500) return trim(n / 1e6, a >= 1e7 ? 0 : 1) + ' млн';
    if (a >= 999.5) return trim(n / 1e3, a >= 1e5 ? 0 : 1) + ' тыс';
    return fmt(n);
  }
  function trim(v, digits) {
    return v.toFixed(digits).replace(/[.,]0$/, '').replace('.', ',');
  }
  function pct(n) { return (n === null || isNaN(n)) ? '—' : n.toFixed(1).replace('.', ',') + '%'; }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var toastTimer = null;
  function toast(msg, kind) {
    var el = $('toast');
    el.textContent = msg;
    el.className = 'show' + (kind === 'warn' ? ' warn' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = ''; }, 2600);
  }
  function status(text) { $('sbLeft').textContent = text; }
  function live(text, state) {
    $('liveText').textContent = text;
    $('liveDot').className = 'dot' + (state ? ' ' + state : '');
  }

  /** Route remote images through the Netlify Image CDN (resize + webp). */
  function cdnImg(url, w) {
    if (!url || !/^https?:\/\//i.test(url)) return url || '';
    return '/.netlify/images?url=' + encodeURIComponent(url) + '&w=' + w + '&fit=cover&fm=webp&q=82';
  }

  function download(name, blobOrText, mime) {
    var blob = blobOrText instanceof Blob ? blobOrText : new Blob([blobOrText], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      ok ? resolve() : reject(new Error('clipboard'));
    });
  }

  function timeStr(ts) {
    var d = new Date(ts);
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }

  /* ---------------- 3. Yandex.Metrika ---------------- */

  var metrika = { id: 0, ready: false };

  function metrikaInit(id) {
    id = String(id || '').replace(/\D/g, '');
    if (!id || metrika.ready) return;
    metrika.id = id;

    window.ym = window.ym || function () { (window.ym.a = window.ym.a || []).push(arguments); };
    window.ym.l = 1 * new Date();

    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://mc.yandex.ru/metrika/tag.js';
    document.head.appendChild(s);

    window.ym(id, 'init', {
      clickmap: true,
      trackLinks: true,
      accurateTrackBounce: true,
      webvisor: true,
      defer: false
    });
    metrika.ready = true;
  }

  function goal(name, params) {
    if (!metrika.ready || !name) return;
    try { window.ym(metrika.id, 'reachGoal', name, params || undefined); } catch (e) { /* blocked */ }
  }

  function hit(page) {
    if (!metrika.ready) return;
    var url = location.origin + '/#' + page;
    try { window.ym(metrika.id, 'hit', url, { title: document.title + ' — ' + page }); } catch (e) { /* blocked */ }
  }

  function renderMetrikaState() {
    var st = $('metrikaState');
    var hint = $('metrikaHint');
    if (metrika.ready) {
      st.className = 'metric-state ok';
      st.textContent = 'Счетчик подключен';
      hint.innerHTML = 'Номер ' + esc(metrika.id) + '. Источник: ' +
        (pub && pub.metrikaConfigured ? 'переменная окружения <code>YANDEX_METRIKA_ID</code> — считаются все посетители сайта.'
          : 'локальные настройки браузера — считаются только ваши визиты. Задайте <code>YANDEX_METRIKA_ID</code> в Netlify, чтобы включить счетчик для всех.');
    } else {
      st.className = 'metric-state off';
      st.textContent = 'Счетчик не подключен';
      hint.innerHTML = 'Укажите номер счетчика в «⚙️ Настройки» или задайте переменную окружения <code>YANDEX_METRIKA_ID</code> в проекте Netlify.';
    }
    if (metrika.id) $('metrikaDash').href = 'https://metrika.yandex.ru/dashboard?id=' + encodeURIComponent(metrika.id);
  }

  function renderGoals() {
    $('goalList').innerHTML = GOALS.map(function (g) {
      return '<li><code>' + esc(g[0]) + '</code><span>' + esc(g[1]) + '</span></li>';
    }).join('');
  }

  /* ---------------- 4. settings ---------------- */

  var FIELDS = {
    'in-bandlinkCode': 'bandlinkCode',
    'in-metrikaId': 'metrikaId',
    'in-ytKey': 'ytKey',
    'in-ytChannel': 'ytChannel',
    'in-vkKey': 'vkKey',
    'in-vkGroup': 'vkGroup',
    'in-tgToken': 'tgToken',
    'in-tgChannel': 'tgChannel',
    'in-tgPost': 'tgPost',
    'in-ymArtist': 'ymArtist',
    'in-ttUser': 'ttUser'
  };

  function fillSettings() {
    Object.keys(FIELDS).forEach(function (id) {
      var el = $(id);
      if (el) el.value = S[FIELDS[id]] || '';
    });
  }

  function readSettings() {
    Object.keys(FIELDS).forEach(function (id) {
      var el = $(id);
      if (el) S[FIELDS[id]] = el.value.trim();
    });
    S.bandlinkCode = S.bandlinkCode.replace(/^.*band\.link\//i, '').replace(/[^A-Za-z0-9_-]/g, '') || DEFAULTS.bandlinkCode;
    S.metrikaId = S.metrikaId.replace(/\D/g, '');
    S.vkGroup = S.vkGroup.replace(/^.*vk\.com\//i, '');
    S.ymArtist = S.ymArtist.replace(/\D/g, '');
    S.touched = true;
    save(SETTINGS_KEY, S);
  }

  function hasKeys() {
    return !!(S.ytKey && S.ytChannel) || !!(S.vkKey && S.vkGroup) || !!(S.tgToken && S.tgChannel);
  }

  /* ---------------- 5. platform APIs ---------------- */

  function jget(url) {
    return fetch(url, { headers: { accept: 'application/json' } }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error((j && j.error && (j.error.message || j.error.error_msg)) || j.description || ('HTTP ' + r.status));
        return j;
      }, function () { throw new Error('HTTP ' + r.status); });
    });
  }

  function fetchYouTube() {
    if (!S.ytKey || !S.ytChannel) return Promise.resolve(null);
    var handle = S.ytChannel.trim();
    var param = /^UC[\w-]{20,}$/.test(handle)
      ? 'id=' + encodeURIComponent(handle)
      : 'forHandle=' + encodeURIComponent(handle.replace(/^@/, ''));
    var url = 'https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&' + param + '&key=' + encodeURIComponent(S.ytKey);
    return jget(url).then(function (j) {
      var it = j.items && j.items[0];
      if (!it) throw new Error('Канал не найден');
      var st = it.statistics || {};
      return {
        id: it.id,
        title: (it.snippet && it.snippet.title) || '',
        subs: st.hiddenSubscriberCount ? null : Number(st.subscriberCount || 0),
        views: Number(st.viewCount || 0),
        videos: Number(st.videoCount || 0)
      };
    });
  }

  function vkJsonp(method, params) {
    return new Promise(function (resolve, reject) {
      var name = '__keVk' + (++vkSeq);
      var script = document.createElement('script');
      function cleanup() {
        clearTimeout(timer);
        try { delete window[name]; } catch (e) { window[name] = undefined; }
        if (script.parentNode) script.parentNode.removeChild(script);
      }
      var timer = setTimeout(function () { cleanup(); reject(new Error('VK: превышено время ожидания')); }, 12000);
      window[name] = function (payload) {
        cleanup();
        if (payload && payload.error) reject(new Error('VK: ' + (payload.error.error_msg || 'ошибка запроса')));
        else resolve(payload && payload.response);
      };
      var q = Object.keys(params).map(function (k) {
        return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
      }).join('&');
      script.src = 'https://api.vk.com/method/' + method + '?' + q + '&callback=' + name;
      script.onerror = function () { cleanup(); reject(new Error('VK: сеть недоступна')); };
      document.head.appendChild(script);
    });
  }

  function fetchVK() {
    if (!S.vkKey || !S.vkGroup) return Promise.resolve(null);
    var base = { access_token: S.vkKey, v: '5.199', lang: 'ru' };
    var info = Object.assign({ group_id: S.vkGroup, fields: 'members_count,description,screen_name' }, base);
    return vkJsonp('groups.getById', info).then(function (res) {
      var g = (res && res.groups && res.groups[0]) || (Array.isArray(res) && res[0]) || null;
      if (!g) throw new Error('VK: сообщество не найдено');
      var wall = Object.assign({ owner_id: '-' + g.id, count: 20 }, base);
      return vkJsonp('wall.get', wall).then(function (w) {
        var items = (w && w.items) || [];
        var likes = 0, comments = 0, views = 0, reposts = 0;
        items.forEach(function (p) {
          likes += (p.likes && p.likes.count) || 0;
          comments += (p.comments && p.comments.count) || 0;
          reposts += (p.reposts && p.reposts.count) || 0;
          views += (p.views && p.views.count) || 0;
        });
        return {
          id: g.id,
          name: g.name || '',
          screen: g.screen_name || S.vkGroup,
          members: Number(g.members_count || 0),
          posts: Number((w && w.count) || items.length),
          sample: items.length,
          likes: likes, comments: comments, reposts: reposts, views: views
        };
      }, function () {
        return { id: g.id, name: g.name || '', screen: g.screen_name || S.vkGroup, members: Number(g.members_count || 0), posts: null, sample: 0, likes: 0, comments: 0, reposts: 0, views: 0 };
      });
    });
  }

  function fetchTelegram() {
    if (!S.tgToken || !S.tgChannel) return Promise.resolve(null);
    var chat = S.tgChannel.trim();
    if (chat[0] !== '@' && !/^-?\d+$/.test(chat)) chat = '@' + chat;
    var api = 'https://api.telegram.org/bot' + encodeURIComponent(S.tgToken) + '/';
    return jget(api + 'getChatMemberCount?chat_id=' + encodeURIComponent(chat)).then(function (j) {
      if (!j.ok) throw new Error(j.description || 'Telegram: ошибка');
      var out = { members: Number(j.result || 0), title: '' };
      return jget(api + 'getChat?chat_id=' + encodeURIComponent(chat)).then(function (c) {
        if (c && c.ok && c.result) out.title = c.result.title || '';
        return out;
      }, function () { return out; });
    });
  }

  /* ---------------- 6. BandLink smart link ---------------- */

  function smartUrl() {
    return 'https://band.link/' + (S.bandlinkCode || DEFAULTS.bandlinkCode);
  }

  function loadBandlink() {
    var code = S.bandlinkCode || DEFAULTS.bandlinkCode;
    $('releaseUrl').textContent = smartUrl();
    $('releaseOpen').href = smartUrl();
    $('promoOpen').href = smartUrl();

    return fetch('/api/bandlink?code=' + encodeURIComponent(code), { headers: { accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || !j.ok) throw new Error((j && j.error) || 'BandLink недоступен');
        release = j;
        if (j.ymArtistId && !S.ymArtist) { S.ymArtist = j.ymArtistId; save(SETTINGS_KEY, S); }
        renderRelease();
        return j;
      })
      .catch(function (err) {
        release = null;
        renderRelease(err);
      });
  }

  function renderRelease(err) {
    var url = (release && release.url) || smartUrl();
    var title = (release && release.release) || 'КАЗАН ЕГЕТЛЭРЕ/2026';
    var artist = (release && release.artist) || 'Казан Егетлэре';
    var plats = (release && release.platforms) || [];

    /* dashboard promo */
    $('promoTitle').textContent = title;
    $('promoTitle').className = 'promo-title';
    $('promoSub').textContent = plats.length
      ? artist + ' · площадок в ссылке: ' + plats.length + ' · одна ссылка ведет слушателя на его сервис'
      : artist + ' · одна ссылка ведет слушателя на его сервис';

    var cover = release && release.cover;
    if (cover) {
      var img = $('promoCover');
      img.src = cdnImg(cover, 192);
      img.alt = 'Обложка релиза «' + title + '»';
      img.hidden = false;
      $('promoCoverFallback').hidden = true;

      var big = $('releaseCover');
      big.src = cdnImg(cover, 560);
      big.alt = 'Обложка релиза «' + title + '»';
      big.hidden = false;
      big.addEventListener('load', function () { $('releaseCoverSkeleton').hidden = true; }, { once: true });
    } else {
      $('releaseCoverSkeleton').hidden = true;
    }

    /* release page */
    $('releaseArtist').textContent = artist;
    $('releaseTitle').textContent = title;
    /* BandLink fills og:description with English boilerplate when the artist left
       it empty — better to show nothing than "Listen, download or stream …". */
    var desc = (release && release.description) || '';
    $('releaseDesc').textContent = /^listen,\s*download or stream/i.test(desc) ? '' : desc;
    $('releaseUrl').textContent = url;
    $('releaseOpen').href = url;
    $('promoOpen').href = url;

    var errBox = $('releaseError');
    if (err) {
      errBox.hidden = false;
      errBox.textContent = 'Не удалось получить данные умной ссылки автоматически (' + err.message +
        '). Сама ссылка работает — открывайте и делитесь ей как обычно.';
    } else {
      errBox.hidden = true;
    }

    renderPlatforms(plats);
    renderShare(url, artist, title);
    renderUtm(url);
    /* keep the QR in sync with the smart link unless the operator typed their own target */
    var q = $('qrTarget');
    if (!q.value || q.value === qrAuto) { q.value = url; qrAuto = url; }
    renderQr();

    var st = $('bandlinkState');
    if (release) {
      st.className = 'metric-state ok';
      st.textContent = 'Ссылка активна · площадок: ' + plats.length;
    } else {
      st.className = 'metric-state off';
      st.textContent = 'Данные ссылки не загрузились';
    }

    var ymCard = document.querySelector('[data-f="ym-platforms"]');
    if (ymCard) ymCard.textContent = plats.length ? String(plats.length) : '—';
  }

  function renderPlatforms(plats) {
    var box = $('platformList');
    if (!plats.length) {
      box.innerHTML = '<p class="plat-empty">Список площадок появится после загрузки данных BandLink. ' +
        'Открыть все площадки можно по самой умной ссылке.</p>';
      return;
    }
    box.innerHTML = plats.map(function (p) {
      return '<a class="plat-btn" href="' + esc(p.url) + '" target="_blank" rel="noopener"' +
        ' data-goal="platform_click" data-source="' + esc(p.id || p.key || 'other') + '">' +
        '<span class="bar" style="background:' + esc(p.color || 'var(--accent)') + '"></span>' +
        '<span><span class="pn">' + esc(p.name) + '</span>' +
        '<span class="pc">' + esc(p.cta || 'Слушать') + '</span></span></a>';
    }).join('');
  }

  function renderShare(url, artist, title) {
    var text = 'Новый релиз ' + artist + ' — «' + title + '». Слушать на всех площадках:';
    var enc = encodeURIComponent(url);
    var encText = encodeURIComponent(text);
    var targets = [
      { label: 'VK', href: 'https://vk.com/share.php?url=' + enc + '&title=' + encodeURIComponent(title) },
      { label: 'Telegram', href: 'https://t.me/share/url?url=' + enc + '&text=' + encText },
      { label: 'WhatsApp', href: 'https://api.whatsapp.com/send?text=' + encodeURIComponent(text + ' ' + url) },
      { label: 'X', href: 'https://twitter.com/intent/tweet?url=' + enc + '&text=' + encText }
    ];
    $('shareRow').innerHTML = targets.map(function (t) {
      return '<a class="btn ghost small" href="' + esc(t.href) + '" target="_blank" rel="noopener"' +
        ' data-goal="share_click" data-source="' + esc(t.label.toLowerCase()) + '">' + esc(t.label) + '</a>';
    }).join('');
    $('shareBtn').hidden = !navigator.share;
  }

  function utmUrl(base, channel, campaign) {
    var u;
    try { u = new URL(base); } catch (e) { return base; }
    u.searchParams.set('utm_source', channel);
    u.searchParams.set('utm_medium', 'social');
    u.searchParams.set('utm_campaign', campaign);
    return u.toString();
  }

  function renderUtm(url) {
    var campaign = ($('utmCampaign').value || '').trim() || slug((release && release.release) || 'kazan-egetlare-2026');
    $('utmList').innerHTML = UTM_CHANNELS.map(function (c) {
      var link = utmUrl(url || smartUrl(), c.key, campaign);
      return '<div class="utm-row"><span class="ch">' + esc(c.label) + '</span>' +
        '<code>' + esc(link) + '</code>' +
        '<button class="btn small ghost" data-action="copy-utm" data-url="' + esc(link) + '" data-source="' + esc(c.key) + '">Копировать</button></div>';
    }).join('');
  }

  function slug(s) {
    var map = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya', ә: 'a', ө: 'o', ү: 'u', җ: 'zh', ң: 'n', һ: 'h' };
    return String(s).toLowerCase().replace(/[а-яёәөүҗңһ]/g, function (c) { return map[c] != null ? map[c] : c; })
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'release';
  }

  /* ---- QR ---- */

  function qrText() { return ($('qrTarget').value || '').trim() || smartUrl(); }

  function renderQr() {
    var cv = $('qrCanvas');
    if (!cv || !window.KEQR) return;
    try {
      window.KEQR.draw(cv, qrText(), { size: 232, quiet: 3, dark: '#0d0d0d', light: '#ffffff' });
      cv.dataset.ok = '1';
    } catch (e) {
      cv.dataset.ok = '';
      var ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, cv.width, cv.height);
      toast('Слишком длинная строка для QR-кода', 'warn');
    }
  }

  function qrFileName(ext) {
    return 'qr-' + slug((release && release.release) || 'bandlink') + '.' + ext;
  }

  /* ---------------- 7. stats render + charts ---------------- */

  function refresh(manual) {
    if (!hasKeys()) {
      live('Нет API-ключей — введите их в «Настройки»', '');
      status('Ключи не заданы: статистика площадок недоступна');
      renderStats();
      return Promise.resolve();
    }
    live('Обновляю данные…', 'on');
    status('Запрашиваю API площадок…');

    var jobs = [
      fetchYouTube().then(function (r) { data.yt = r; return null; }, function (e) { data.yt = { error: e.message }; return e; }),
      fetchVK().then(function (r) { data.vk = r; return null; }, function (e) { data.vk = { error: e.message }; return e; }),
      fetchTelegram().then(function (r) { data.tg = r; return null; }, function (e) { data.tg = { error: e.message }; return e; })
    ];

    return Promise.all(jobs).then(function (errors) {
      var failed = errors.filter(Boolean);
      renderStats();
      pushHistory();
      renderHistoryState();
      drawCharts();
      if (failed.length) {
        live('Часть площадок недоступна', 'err');
        status('Ошибки: ' + failed.map(function (e) { return e.message; }).join(' · '));
      } else {
        live('Данные актуальны · ' + timeStr(Date.now()), 'on');
        status('Обновлено в ' + timeStr(Date.now()));
      }
      if (manual) {
        toast(failed.length ? 'Обновлено с ошибками' : 'Данные обновлены', failed.length ? 'warn' : '');
        goal('data_refreshed');
      }
      scheduleRefresh();
    });
  }

  function setField(name, value) {
    all('[data-f="' + name + '"]').forEach(function (el) { el.textContent = value; });
  }

  function renderStats() {
    var yt = data.yt && !data.yt.error ? data.yt : null;
    var vk = data.vk && !data.vk.error ? data.vk : null;
    var tg = data.tg && !data.tg.error ? data.tg : null;

    setField('yt-subs', yt ? (yt.subs === null ? 'скрыто' : fmtShort(yt.subs)) : '—');
    setField('yt-views', yt ? fmtShort(yt.views) : '—');
    setField('yt-videos', yt ? fmt(yt.videos) : '—');
    setField('vk-members', vk ? fmtShort(vk.members) : '—');
    setField('vk-posts', vk && vk.posts != null ? fmt(vk.posts) : '—');
    setField('tg-members', tg ? fmtShort(tg.members) : '—');

    noteFor('yt', S.ytKey && S.ytChannel, data.yt, 'Нужен API-ключ и ID канала');
    noteFor('vk', S.vkKey && S.vkGroup, data.vk, 'Нужен сервисный ключ VK и адрес сообщества');
    noteFor('tg', S.tgToken && S.tgChannel, data.tg, 'Нужен Bot Token и @username канала');

    var reach = (yt && yt.subs ? yt.subs : 0) + (vk ? vk.members : 0) + (tg ? tg.members : 0);
    $('calcReach').textContent = reach ? fmtShort(reach) : '—';

    var eng = vk && vk.views ? ((vk.likes + vk.comments) / vk.views) * 100 : null;
    $('calcEng').textContent = eng === null ? '—' : pct(eng);

    $('calcAvgViews').textContent = yt && yt.videos ? fmtShort(yt.views / yt.videos) : '—';
    $('calcGrowth').textContent = reach ? fmtShort(forecast(reach, 30)) : '—';
  }

  function noteFor(key, configured, payload, defaultText) {
    var el = document.querySelector('.need-key[data-k="' + key + '"]');
    if (!el) return;
    if (payload && payload.error) {
      el.hidden = false;
      el.textContent = payload.error;
    } else if (!configured) {
      el.hidden = false;
      el.textContent = defaultText;
    } else {
      el.hidden = true;
    }
  }

  /** Growth extrapolated from the local measurement series, or a modest default. */
  function growthRate() {
    if (series.length < 2) return 0.0015;
    var first = series[0], last = series[series.length - 1];
    var days = (last.t - first.t) / 86400000;
    if (days < 0.5 || !first.reach) return 0.0015;
    var ratio = last.reach / first.reach;
    if (!(ratio > 0)) return 0.0015;
    var daily = Math.pow(ratio, 1 / days) - 1;
    return Math.max(-0.02, Math.min(0.05, daily));
  }
  function forecast(reach, days) { return reach * Math.pow(1 + growthRate(), days); }

  function pushHistory() {
    var yt = data.yt && !data.yt.error ? data.yt : null;
    var vk = data.vk && !data.vk.error ? data.vk : null;
    var tg = data.tg && !data.tg.error ? data.tg : null;
    var reach = (yt && yt.subs ? yt.subs : 0) + (vk ? vk.members : 0) + (tg ? tg.members : 0);
    if (!reach) return;
    var point = {
      t: Date.now(),
      reach: reach,
      yt: yt && yt.subs ? yt.subs : 0,
      vk: vk ? vk.members : 0,
      tg: tg ? tg.members : 0
    };
    var last = series[series.length - 1];
    if (last && last.reach === reach && Date.now() - last.t < 60 * 60 * 1000) return;
    series.push(point);
    if (series.length > HISTORY_MAX) series = series.slice(-HISTORY_MAX);
    save(HISTORY_KEY, series);
  }

  function renderHistoryState() {
    var el = $('historyState');
    if (!el) return;
    if (!series.length) {
      el.className = 'metric-state off';
      el.textContent = 'Пока нет замеров';
      return;
    }
    var last = series[series.length - 1];
    el.className = 'metric-state ok';
    el.textContent = 'Замеров: ' + series.length + ' · последний ' +
      new Date(last.t).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  /* ---- canvas charts (HiDPI aware) ---- */

  function prep(cv, cssHeight) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var cssWidth = cv.clientWidth || cv.parentElement.clientWidth || 600;
    cv.style.height = cssHeight + 'px';
    cv.width = Math.round(cssWidth * dpr);
    cv.height = Math.round(cssHeight * dpr);
    var ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    return { ctx: ctx, w: cssWidth, h: cssHeight };
  }

  function emptyChart(c, text) {
    c.ctx.fillStyle = '#7a7a7a';
    c.ctx.font = '13px "Segoe UI", system-ui, sans-serif';
    c.ctx.textAlign = 'center';
    c.ctx.fillText(text, c.w / 2, c.h / 2);
  }

  function drawCharts() { drawPlatforms(); drawHistory(); }

  function drawPlatforms() {
    var cv = $('chartPlatforms');
    if (!cv) return;
    var c = prep(cv, 240);
    var yt = data.yt && !data.yt.error ? data.yt : null;
    var vk = data.vk && !data.vk.error ? data.vk : null;
    var tg = data.tg && !data.tg.error ? data.tg : null;
    var items = [
      { label: 'YouTube', value: yt && yt.subs ? yt.subs : 0, color: '#ff0000' },
      { label: 'VK', value: vk ? vk.members : 0, color: '#0077ff' },
      { label: 'Telegram', value: tg ? tg.members : 0, color: '#2aabee' }
    ].filter(function (i) { return i.value > 0; });

    if (!items.length) return emptyChart(c, 'Нет данных — подключите API площадок');

    var max = Math.max.apply(null, items.map(function (i) { return i.value; }));
    var padB = 42, padT = 26;
    var slot = c.w / items.length;
    var bw = Math.min(88, slot * 0.5);
    var ctx = c.ctx;
    ctx.textAlign = 'center';

    items.forEach(function (it, i) {
      var h = ((c.h - padB - padT) * it.value) / max;
      var x = slot * i + slot / 2;
      var y = c.h - padB - h;
      var grad = ctx.createLinearGradient(0, y, 0, c.h - padB);
      grad.addColorStop(0, it.color);
      grad.addColorStop(1, 'rgba(0,0,0,.25)');
      ctx.fillStyle = grad;
      roundRect(ctx, x - bw / 2, y, bw, h, 6);
      ctx.fill();

      ctx.fillStyle = '#fff';
      ctx.font = '700 13px "Segoe UI", system-ui, sans-serif';
      ctx.fillText(fmtShort(it.value), x, y - 8);
      ctx.fillStyle = '#b3b3b3';
      ctx.font = '12px "Segoe UI", system-ui, sans-serif';
      ctx.fillText(it.label, x, c.h - padB + 20);
    });

    ctx.strokeStyle = '#2e2e2e';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, c.h - padB + 0.5);
    ctx.lineTo(c.w, c.h - padB + 0.5);
    ctx.stroke();
  }

  function drawHistory() {
    var cv = $('chartHistory');
    if (!cv) return;
    var c = prep(cv, 230);
    if (series.length < 2) return emptyChart(c, 'Нужно минимум два замера — обновите данные позже');

    var pts = series.slice(-60);
    var vals = pts.map(function (p) { return p.reach; });
    var max = Math.max.apply(null, vals);
    var min = Math.min.apply(null, vals);
    var span = max - min || max || 1;
    var padL = 8, padR = 8, padT = 22, padB = 30;
    var ctx = c.ctx;
    var innerW = c.w - padL - padR;
    var innerH = c.h - padT - padB;

    function px(i) { return padL + (innerW * i) / (pts.length - 1); }
    function py(v) { return padT + innerH - ((v - min + span * 0.12) / (span * 1.24)) * innerH; }

    ctx.strokeStyle = '#242424';
    ctx.lineWidth = 1;
    for (var g = 0; g <= 3; g++) {
      var gy = padT + (innerH * g) / 3;
      ctx.beginPath();
      ctx.moveTo(padL, gy + 0.5);
      ctx.lineTo(c.w - padR, gy + 0.5);
      ctx.stroke();
    }

    var fill = ctx.createLinearGradient(0, padT, 0, padT + innerH);
    fill.addColorStop(0, 'rgba(29,185,84,.32)');
    fill.addColorStop(1, 'rgba(29,185,84,0)');
    ctx.beginPath();
    ctx.moveTo(px(0), py(vals[0]));
    vals.forEach(function (v, i) { ctx.lineTo(px(i), py(v)); });
    ctx.lineTo(px(vals.length - 1), padT + innerH);
    ctx.lineTo(px(0), padT + innerH);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();

    ctx.beginPath();
    vals.forEach(function (v, i) { i ? ctx.lineTo(px(i), py(v)) : ctx.moveTo(px(i), py(v)); });
    ctx.strokeStyle = '#1ed760';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();

    var lastI = vals.length - 1;
    ctx.beginPath();
    ctx.arc(px(lastI), py(vals[lastI]), 4, 0, Math.PI * 2);
    ctx.fillStyle = '#1ed760';
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.font = '700 13px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(fmtShort(vals[lastI]), c.w - padR, py(vals[lastI]) - 10);

    ctx.fillStyle = '#7a7a7a';
    ctx.font = '11px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(dateShort(pts[0].t), padL, c.h - 10);
    ctx.textAlign = 'right';
    ctx.fillText(dateShort(pts[lastI].t), c.w - padR, c.h - 10);
  }

  function dateShort(ts) {
    return new Date(ts).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, Math.max(h, 1) / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /* ---------------- 8. social embeds ---------------- */

  var embedsDone = {};

  function embedYouTube() {
    var id = (data.yt && data.yt.id) || (/^UC[\w-]{20,}$/.test(S.ytChannel || '') ? S.ytChannel : '');
    var handle = (S.ytChannel || '').replace(/^@/, '');
    $('ytLink').href = id ? 'https://www.youtube.com/channel/' + id : (handle ? 'https://www.youtube.com/@' + handle : 'https://www.youtube.com/');
    if (!id) return;
    var frame = $('ytFrame');
    var src = 'https://www.youtube.com/embed/videoseries?list=UU' + id.slice(2);
    if (frame.dataset.src !== src) { frame.dataset.src = src; frame.src = src; }
  }

  function embedVK() {
    var group = (data.vk && data.vk.screen) || S.vkGroup;
    if (group) $('vkLink').href = 'https://vk.com/' + group.replace(/^@/, '');
    var holder = $('vk_widget_holder');
    var gid = data.vk && data.vk.id;
    if (!gid) {
      if (!holder.childElementCount) {
        holder.classList.add('pad');
        holder.innerHTML = '<p class="muted">Виджет сообщества загрузится после подключения VK API в «⚙️ Настройки» — ' +
          'для него нужен числовой ID сообщества, который отдает API.</p>';
      }
      return;
    }
    if (embedsDone.vk === gid) return;
    withScript('https://vk.com/js/api/openapi.js?169', function () {
      if (!window.VK || !window.VK.Widgets) return;
      holder.classList.remove('pad');
      holder.innerHTML = '';
      try {
        window.VK.Widgets.Group('vk_widget_holder', { mode: 4, width: 'auto', height: 480, no_cover: 0 }, gid);
        embedsDone.vk = gid;
      } catch (e) { /* widget refused */ }
    });
  }

  function embedTelegram() {
    var chan = (S.tgChannel || '').replace(/^@/, '');
    $('tgLink').href = chan ? 'https://t.me/' + chan : 'https://t.me/';
    var post = (S.tgPost || '').replace(/^https?:\/\/t\.me\//i, '').replace(/^@/, '');
    var holder = $('tgPostHolder');
    if (!post) {
      if (embedsDone.tg !== 'none') {
        holder.innerHTML = '<p class="muted">Укажите ссылку на пост канала в «⚙️ Настройки» (например <code>kazanegetlare/12</code>), ' +
          'чтобы встроить его здесь.</p>';
        embedsDone.tg = 'none';
      }
      return;
    }
    if (embedsDone.tg === post) return;
    holder.innerHTML = '';
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://telegram.org/js/telegram-widget.js?22';
    s.setAttribute('data-telegram-post', post);
    s.setAttribute('data-width', '100%');
    s.setAttribute('data-dark', '1');
    holder.appendChild(s);
    embedsDone.tg = post;
  }

  function embedYandex() {
    var artist = S.ymArtist || DEFAULTS.ymArtist;
    $('ymLink').href = 'https://music.yandex.ru/artist/' + artist;
    var src = 'https://music.yandex.ru/iframe/artist/' + artist;
    var frame = $('ymFrame');
    if (frame.dataset.src !== src) { frame.dataset.src = src; frame.src = src; }
  }

  function embedTikTok() {
    var user = (S.ttUser || '').replace(/^@/, '');
    $('ttLink').href = user ? 'https://www.tiktok.com/@' + user : 'https://www.tiktok.com/';
    var frame = $('ttFrame');
    if (!user) {
      if (frame.dataset.src !== 'none') {
        frame.dataset.src = 'none';
        frame.removeAttribute('src');
      }
      return;
    }
    var src = 'https://www.tiktok.com/embed/@' + encodeURIComponent(user);
    if (frame.dataset.src !== src) { frame.dataset.src = src; frame.src = src; }
  }

  function withScript(src, cb) {
    var existing = document.querySelector('script[data-ke-src="' + src + '"]');
    if (existing) {
      if (existing.dataset.loaded) cb();
      else existing.addEventListener('load', cb, { once: true });
      return;
    }
    var s = document.createElement('script');
    s.async = true;
    s.src = src;
    s.setAttribute('data-ke-src', src);
    s.addEventListener('load', function () { s.dataset.loaded = '1'; cb(); }, { once: true });
    document.head.appendChild(s);
  }

  function embedAll() { embedYouTube(); embedVK(); embedTelegram(); embedYandex(); embedTikTok(); }

  /* ---------------- 9. AI agents ---------------- */

  var AGENTS = {
    analyst: { title: '📈 Аналитик', build: buildAnalyst },
    strategist: { title: '🎯 Стратег', build: buildStrategist },
    copywriter: { title: '✍️ Копирайтер', build: buildCopywriter },
    forecaster: { title: '🔮 Прогнозист', build: buildForecaster },
    ideator: { title: '💡 Идейный', build: buildIdeator }
  };

  function ctx() {
    var yt = data.yt && !data.yt.error ? data.yt : null;
    var vk = data.vk && !data.vk.error ? data.vk : null;
    var tg = data.tg && !data.tg.error ? data.tg : null;
    var reach = (yt && yt.subs ? yt.subs : 0) + (vk ? vk.members : 0) + (tg ? tg.members : 0);
    return {
      yt: yt, vk: vk, tg: tg, reach: reach,
      artist: (release && release.artist) || 'Казан Егетлэре',
      title: (release && release.release) || 'КАЗАН ЕГЕТЛЭРЕ/2026',
      url: (release && release.url) || smartUrl(),
      plats: (release && release.platforms) || []
    };
  }

  function runAgent(kind) {
    var agent = AGENTS[kind];
    if (!agent) return;
    var out = $('agentOut');
    out.hidden = false;
    $('agentTitle').textContent = agent.title;
    $('agentSpin').hidden = false;
    $('agentReport').textContent = '';
    $('agentActions').hidden = true;
    if (out.scrollIntoView) out.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    setTimeout(function () {
      var text = agent.build(ctx());
      lastReport = agent.title + '\n\n' + text;
      $('agentSpin').hidden = true;
      $('agentReport').textContent = text;
      $('agentActions').hidden = false;
      goal('report_generated', { agent: kind });
      status('Отчет агента «' + agent.title.replace(/^\W+\s*/, '') + '» готов');
    }, 550);
  }

  function noData(c) {
    return !c.reach
      ? 'Пока нет реальных цифр площадок — подключите API во вкладке «⚙️ Настройки», и отчет пересчитается по фактическим данным.\n\n'
      : '';
  }

  function buildAnalyst(c) {
    var lines = [noData(c) + 'СВОДКА ПО ПЛОЩАДКАМ'];
    lines.push('');
    if (c.yt) lines.push('YouTube: ' + (c.yt.subs === null ? 'подписчики скрыты' : fmt(c.yt.subs) + ' подписчиков') +
      ', ' + fmt(c.yt.views) + ' просмотров, ' + fmt(c.yt.videos) + ' видео' +
      (c.yt.videos ? ' (в среднем ' + fmtShort(c.yt.views / c.yt.videos) + ' просмотров на видео)' : ''));
    if (c.vk) lines.push('VK: ' + fmt(c.vk.members) + ' участников' + (c.vk.posts != null ? ', ' + fmt(c.vk.posts) + ' записей на стене' : '') +
      (c.vk.views ? ', вовлеченность последних ' + c.vk.sample + ' постов — ' + pct(((c.vk.likes + c.vk.comments) / c.vk.views) * 100) : ''));
    if (c.tg) lines.push('Telegram: ' + fmt(c.tg.members) + ' подписчиков канала');
    if (!c.yt && !c.vk && !c.tg) lines.push('Данные площадок не получены.');
    lines.push('');
    lines.push('Суммарный охват: ' + (c.reach ? fmt(c.reach) : '—'));

    if (c.reach) {
      var parts = [
        { n: 'YouTube', v: c.yt && c.yt.subs ? c.yt.subs : 0 },
        { n: 'VK', v: c.vk ? c.vk.members : 0 },
        { n: 'Telegram', v: c.tg ? c.tg.members : 0 }
      ].sort(function (a, b) { return b.v - a.v; });
      lines.push('Структура: ' + parts.map(function (p) { return p.n + ' ' + pct((p.v / c.reach) * 100); }).join(', ') + '.');
      lines.push('');
      lines.push('ВЫВОДЫ');
      lines.push('• Ядро аудитории — ' + parts[0].n + '. Здесь имеет смысл анонсировать релиз первым и держать самую высокую частоту публикаций.');
      if (parts[parts.length - 1].v / c.reach < 0.15) {
        lines.push('• ' + parts[parts.length - 1].n + ' отстает (' + pct((parts[parts.length - 1].v / c.reach) * 100) +
          ' охвата) — самый быстрый рост даст перелив аудитории отсюда: закрепленный пост со смарт-ссылкой и кросс-анонсы.');
      }
      if (c.vk && c.vk.views) {
        var e = ((c.vk.likes + c.vk.comments) / c.vk.views) * 100;
        lines.push('• Вовлеченность VK ' + pct(e) + ' — ' + (e >= 5 ? 'выше типичной для музыкальных сообществ: контент попадает в аудиторию.'
          : e >= 2 ? 'в норме. Рост даст смена формата: короткое вертикальное видео и вопросы в тексте.'
            : 'низкая. Стоит сократить длину постов и добавить видео в первые два экрана.'));
      }
    }

    lines.push('');
    lines.push('УМНАЯ ССЫЛКА');
    lines.push('• ' + c.url + ' — площадок в ссылке: ' + (c.plats.length || '—') +
      (c.plats.length ? ' (' + c.plats.map(function (p) { return p.name; }).join(', ') + ')' : ''));
    lines.push('• Сверяйте два отчета: BandLink показывает, откуда пришел переход, Яндекс.Метрика — что человек делал дальше. Пометьте каждый канал UTM-ссылкой из вкладки «🔗 Релиз».');
    if (c.plats.length && c.plats.length < 4) {
      lines.push('• Площадок меньше четырех: добавьте в BandLink Spotify, Apple Music, Zvuk и YouTube Music — иначе часть слушателей уходит в никуда.');
    }
    return lines.join('\n');
  }

  function buildStrategist(c) {
    var l = [noData(c) + 'СТРАТЕГИЯ ВЫПУСКА'];
    l.push('');
    l.push('Текущий релиз: «' + c.title + '» — ' + c.url);
    l.push('');
    l.push('КАЛЕНДАРЬ');
    l.push('• Пятница, 00:00 МСК — стандартное окно стриминговых чартов: релиз должен быть залит минимум за 7 дней до даты, иначе не попадет в редакционные плейлисты.');
    l.push('• Неделя до: тизер 15 секунд в вертикальном формате + предсейв по смарт-ссылке в закрепе всех площадок.');
    l.push('• День выхода: пост со ссылкой во всех каналах в разное время (VK — 12:00, Telegram — 18:00, YouTube-премьера — 20:00), чтобы растянуть трафик на сутки.');
    l.push('• Дни 2–7: UGC-волна — просьба к слушателям записать видео под трек, лучшие репостить.');
    l.push('• Дни 8–30: клип или лайв-версия для второго пика внимания.');
    l.push('');
    l.push('РАСПРЕДЕЛЕНИЕ УСИЛИЙ');
    if (c.reach) {
      var mix = [
        { n: 'YouTube', v: c.yt && c.yt.subs ? c.yt.subs : 0, act: 'клипы, лайвы, шортсы' },
        { n: 'VK', v: c.vk ? c.vk.members : 0, act: 'посты с плеером, конкурсы, клипы' },
        { n: 'Telegram', v: c.tg ? c.tg.members : 0, act: 'закулисье и прямая связь с ядром' }
      ].sort(function (a, b) { return b.v - a.v; });
      mix.forEach(function (m, i) {
        l.push('• ' + m.n + ' (' + fmtShort(m.v) + ', ' + pct((m.v / c.reach) * 100) + ' охвата) — ' +
          (i === 0 ? 'основной канал: ' : 'поддержка: ') + m.act + '.');
      });
    } else {
      l.push('• Подключите API площадок, чтобы распределение считалось по реальным цифрам.');
    }
    l.push('');
    l.push('ТАТАРСКАЯ СЦЕНА');
    l.push('• Заявки в редакционные плейлисты Яндекс Музыки по татарской и этно-поп музыке — через кабинет дистрибьютора, за 2–3 недели до релиза.');
    l.push('• Радио «Болгар», «Татар радиосы», ТНВ — присылать готовый пакет: трек, обложка, пресс-релиз на татарском и русском, две фотографии.');
    l.push('• Сабантуи и городские праздники Татарстана — источник живого охвата, который потом конвертируется в стримы через QR-код смарт-ссылки на афише.');
    return l.join('\n');
  }

  function buildCopywriter(c) {
    var l = ['ГОТОВЫЕ ПОСТЫ (скопируйте и опубликуйте)'];
    var url = c.url;
    l.push('');
    l.push('— VK / Telegram, день релиза —');
    l.push('Дуслар! Яңа релиз чыкты 🔥');
    l.push('«' + c.title + '» — уже на всех площадках.');
    l.push('Одна ссылка, площадку выберет ваш телефон: ' + utmUrl(url, 'vk', slug(c.title)));
    l.push('Слушайте, сохраняйте в плейлист и пишите в комментариях, какой трек зашел.');
    l.push('#' + slug(c.artist).replace(/-/g, '') + ' #татарскаямузыка #' + slug(c.title).replace(/-/g, ''));
    l.push('');
    l.push('— Короткий пост для сторис и шортсов —');
    l.push('Новый трек. Ссылка в описании 👇');
    l.push(utmUrl(url, 'instagram', slug(c.title)));
    l.push('');
    l.push('— Описание YouTube-видео —');
    l.push('«' + c.title + '» — ' + c.artist + '.');
    l.push('Слушать на всех площадках: ' + utmUrl(url, 'youtube', slug(c.title)));
    if (c.plats.length) {
      c.plats.forEach(function (p) { l.push(p.name + ': ' + p.url); });
    }
    l.push('');
    l.push('Подписывайтесь на канал и включайте колокольчик, чтобы не пропустить следующий релиз.');
    l.push('');
    l.push('— Текст для афиши и QR-кода —');
    l.push(c.artist.toUpperCase());
    l.push('«' + c.title + '»');
    l.push('Сканируй — слушай на своей площадке');
    l.push('(QR-код с UTM-меткой афиши — во вкладке «🔗 Релиз»)');
    l.push('');
    l.push('— Питч для радио и медиа —');
    l.push(c.artist + ' выпускает «' + c.title + '» — ' +
      (c.reach ? 'аудитория проекта уже ' + fmtShort(c.reach) + ' человек в YouTube, VK и Telegram. ' : '') +
      'Современное татарское звучание для слушателя, который вырос на поп-музыке, но не хочет терять родной язык. ' +
      'Материалы и ссылки: ' + utmUrl(url, 'press', slug(c.title)));
    return l.join('\n');
  }

  function buildForecaster(c) {
    if (!c.reach) return noData(c) + 'Прогноз строится по истории замеров охвата — она начнет накапливаться, как только появятся реальные данные.';
    var rate = growthRate();
    var l = ['ПРОГНОЗ АУДИТОРИИ'];
    l.push('');
    l.push('Базовый охват сегодня: ' + fmt(c.reach));
    l.push('Дневной темп по локальной истории (' + series.length + ' замер' + plural(series.length, '', 'а', 'ов') + '): ' +
      (rate * 100).toFixed(2).replace('.', ',') + '% в сутки' + (series.length < 4 ? ' — оценка предварительная, нужно больше замеров.' : '.'));
    l.push('');
    [30, 90, 180].forEach(function (d) {
      var v = forecast(c.reach, d);
      l.push('Через ' + d + ' дней: ' + fmt(v) + ' (' + (v >= c.reach ? '+' : '') + fmt(v - c.reach) + ')');
    });
    l.push('');
    l.push('СЦЕНАРИИ');
    l.push('• Инерционный (ничего не меняем): ' + fmt(forecast(c.reach, 90)) + ' через 3 месяца.');
    l.push('• Активный (2 релиза + 1 клип за квартал, регулярные шортсы): ' + fmt(c.reach * Math.pow(1 + Math.max(rate, 0.004) * 2.2, 90)) + '.');
    l.push('• Пассивный (пауза в публикациях): ' + fmt(c.reach * Math.pow(1 - 0.0008, 90)) + ' — охват тает медленно, но восстанавливается дольше.');
    l.push('');
    l.push('ЧТО ДВИГАЕТ ЦИФРУ');
    l.push('• Один клип на YouTube обычно дает больше подписчиков, чем месяц постов: ' +
      (c.yt && c.yt.videos ? 'при текущем среднем ' + fmtShort(c.yt.views / c.yt.videos) + ' просмотров на видео каждое новое видео — прямой прирост охвата.' : 'следите за средним числом просмотров на видео.'));
    l.push('• Переходы по смарт-ссылке — опережающий показатель: рост переходов в кабинете BandLink виден за 1–2 недели до роста подписчиков.');
    l.push('• Обновляйте дашборд регулярно: чем длиннее локальная история, тем точнее этот прогноз. Выгрузка CSV — во вкладке «📈 Аналитика».');
    return l.join('\n');
  }

  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
    return many;
  }

  function buildIdeator(c) {
    var l = ['ИДЕИ ДЛЯ ПЕСЕН И ВИДЕО'];
    l.push('');
    l.push('ТЕМЫ ПЕСЕН');
    l.push('• «Казан — Мәскәү»: дорога между родным городом и большим городом, двуязычный припев — татарский куплет, русский хук.');
    l.push('• Семейная тема: голос бабушки из аудиозаписи в интро, современный бит поверх.');
    l.push('• Сабантуй в городе: праздник, вынесенный в бетонный двор — контраст этно-инструмента и электроники.');
    l.push('• Летняя коллаборация с татарской исполнительницей — дуэт расширяет обе аудитории.');
    l.push('');
    l.push('ВИДЕО');
    l.push('• Один кадр без склеек по улицам Казани — дешево в производстве, хорошо расходится репостами.');
    l.push('• Лайв-сессия на крыше или в старой татарской усадьбе: три трека, один сет, три готовых видео.');
    l.push('• Вертикальный цикл: 15 секунд припева × 8 вариантов монтажа для шортсов и клипов — тестируйте, какой выстрелит.');
    l.push('');
    l.push('ФОРМАТЫ ДЛЯ КАНАЛОВ');
    l.push('• Telegram: черновики и голосовые «как писалась песня» — контент, который не требует продакшена и держит ядро.');
    l.push('• VK: опрос о названии следующего трека — вовлеченность и бесплатное исследование аудитории сразу.');
    l.push('• YouTube: разбор татарских слов из текста песни — заходит и русскоязычной аудитории.');
    l.push('');
    l.push('ПРОМО-МЕХАНИКИ');
    l.push('• QR-код смарт-ссылки на футболках, наклейках и афишах: сканирование ведет туда, где человек уже слушает музыку.');
    l.push('• Челлендж под трек с призом от группы — условие участия: ссылка ' + utmUrl(c.url, 'challenge', slug(c.title)) + ' в описании видео.');
    l.push('• Раз в месяц — короткий отчет для подписчиков: сколько человек послушало, откуда пришли. Прозрачность создает соучастие.');
    return l.join('\n');
  }

  /* ---------------- 10. export / report ---------------- */

  function buildFullReport() {
    var c = ctx();
    var l = [];
    l.push('ОТЧЕТ ПО ПРОДВИЖЕНИЮ · ' + c.artist);
    l.push('Сформирован: ' + new Date().toLocaleString('ru-RU'));
    l.push('='.repeat(52));
    l.push('');
    l.push('РЕЛИЗ');
    l.push('Название: ' + c.title);
    l.push('Умная ссылка: ' + c.url);
    l.push('Площадок в ссылке: ' + (c.plats.length || '—'));
    c.plats.forEach(function (p) { l.push('  · ' + p.name + ' — ' + p.url); });
    l.push('');
    l.push('ПЛОЩАДКИ');
    l.push('YouTube: ' + (c.yt ? (c.yt.subs === null ? 'подписчики скрыты' : fmt(c.yt.subs) + ' подписчиков') + ' · ' + fmt(c.yt.views) + ' просмотров · ' + fmt(c.yt.videos) + ' видео' : 'нет данных'));
    l.push('VK: ' + (c.vk ? fmt(c.vk.members) + ' участников' + (c.vk.posts != null ? ' · ' + fmt(c.vk.posts) + ' записей' : '') : 'нет данных'));
    l.push('Telegram: ' + (c.tg ? fmt(c.tg.members) + ' подписчиков' : 'нет данных'));
    l.push('');
    l.push('РАСЧЕТЫ');
    l.push('Суммарный охват: ' + (c.reach ? fmt(c.reach) : '—'));
    l.push('Вовлеченность VK: ' + $('calcEng').textContent);
    l.push('Среднее просмотров на видео: ' + $('calcAvgViews').textContent);
    l.push('Прогноз на 30 дней: ' + (c.reach ? fmt(forecast(c.reach, 30)) : '—'));
    l.push('');
    l.push('АНАЛИТИКА');
    l.push('Яндекс.Метрика: ' + (metrika.ready ? 'счетчик ' + metrika.id + ' подключен' : 'не подключена'));
    l.push('Локальных замеров охвата: ' + series.length);
    l.push('Статистика стримов и переходов: https://band.link/manage/analytics/yandex-music');
    if (lastReport) {
      l.push('');
      l.push('='.repeat(52));
      l.push(lastReport);
    }
    return l.join('\n');
  }

  function exportReport() {
    download('kazan-egetlare-report-' + fileStamp() + '.txt', buildFullReport());
    toast('Отчет скачан');
    goal('report_saved', { kind: 'dashboard' });
  }

  function exportCsv() {
    if (!series.length) { toast('История пока пуста', 'warn'); return; }
    var rows = [['datetime', 'reach', 'youtube', 'vk', 'telegram']];
    series.forEach(function (p) {
      rows.push([new Date(p.t).toISOString(), p.reach, p.yt || 0, p.vk || 0, p.tg || 0]);
    });
    var csv = '﻿' + rows.map(function (r) { return r.join(';'); }).join('\r\n');
    download('kazan-egetlare-history-' + fileStamp() + '.csv', csv, 'text/csv;charset=utf-8');
    toast('CSV скачан');
    goal('report_saved', { kind: 'csv' });
  }

  function fileStamp() {
    var d = new Date();
    function p(n) { return String(n).padStart(2, '0'); }
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
  }

  /* ---------------- navigation ---------------- */

  function showPage(name) {
    currentPage = name;
    all('.nav-btn').forEach(function (b) {
      var on = b.dataset.page === name;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    all('.page').forEach(function (p) {
      var on = p.id === 'page-' + name;
      p.hidden = !on;
      p.classList.toggle('active', on);
    });
    if (location.hash.slice(1) !== name) {
      try { window.history.replaceState(null, '', '#' + name); } catch (e) { /* file:// */ }
    }
    if (name === 'dash') drawCharts();
    if (name === 'release') renderQr();
    if (name === 'social') embedAll();
    hit(name);
  }

  function showSocial(name) {
    all('.sub-tab').forEach(function (b) {
      var on = b.dataset.social === name;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    all('.social-pane').forEach(function (p) {
      var on = p.id === 'social-' + name;
      p.hidden = !on;
      p.classList.toggle('active', on);
    });
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    nextRefreshAt = Date.now() + REFRESH_MS;
    refreshTimer = setTimeout(function () { refresh(false); }, REFRESH_MS);
  }

  function tickStatus() {
    var right = $('sbRight');
    if (!hasKeys()) { right.textContent = 'Автообновление: нет ключей'; return; }
    var left = Math.max(0, nextRefreshAt - Date.now());
    var m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
    right.textContent = 'Следующее автообновление: ' + m + ':' + String(s).padStart(2, '0');
  }

  /* ---------------- 11. init ---------------- */

  var ACTIONS = {
    refresh: function () { refresh(true); },
    export: exportReport,
    'export-csv': exportCsv,
    'clear-history': function () {
      series = [];
      save(HISTORY_KEY, series);
      renderHistoryState();
      drawHistory();
      toast('История очищена');
    },
    'goto-agents': function () { showPage('agents'); },
    'goto-release': function () { showPage('release'); },
    'copy-link': function (el) {
      var url = (release && release.url) || smartUrl();
      copy(url).then(function () {
        toast('Ссылка скопирована');
        goal('link_copied', { source: el.dataset.source || 'unknown' });
      }, function () { toast('Не удалось скопировать', 'warn'); });
    },
    'copy-utm': function (el) {
      copy(el.dataset.url || '').then(function () {
        toast('Ссылка с UTM скопирована');
        goal('link_copied', { source: 'utm-' + (el.dataset.source || '') });
      }, function () { toast('Не удалось скопировать', 'warn'); });
    },
    share: function () {
      var c = ctx();
      if (!navigator.share) { toast('Браузер не поддерживает «поделиться»', 'warn'); return; }
      navigator.share({
        title: c.artist + ' — ' + c.title,
        text: 'Слушать «' + c.title + '» на всех площадках',
        url: c.url
      }).then(function () { goal('share_click', { source: 'native' }); }, function () { /* cancelled */ });
    },
    'qr-png': function () {
      var cv = $('qrCanvas');
      if (!cv || !cv.dataset.ok) { toast('QR-код не сформирован', 'warn'); return; }
      cv.toBlob(function (blob) {
        if (!blob) { toast('Не удалось сохранить PNG', 'warn'); return; }
        download(qrFileName('png'), blob);
        toast('QR-код сохранен');
        goal('qr_download', { format: 'png' });
      }, 'image/png');
    },
    'qr-svg': function () {
      try {
        var svg = window.KEQR.svg(qrText(), { scale: 8, quiet: 3, dark: '#0d0d0d', light: '#ffffff' });
        download(qrFileName('svg'), svg, 'image/svg+xml;charset=utf-8');
        toast('QR-код сохранен');
        goal('qr_download', { format: 'svg' });
      } catch (e) { toast('Слишком длинная строка для QR-кода', 'warn'); }
    },
    'copy-report': function () {
      if (!lastReport) return;
      copy(lastReport).then(function () {
        toast('Отчет скопирован');
        goal('report_saved', { kind: 'copy' });
      }, function () { toast('Не удалось скопировать', 'warn'); });
    },
    'save-report': function () {
      if (!lastReport) return;
      download('agent-report-' + fileStamp() + '.txt', lastReport);
      toast('Отчет сохранен');
      goal('report_saved', { kind: 'agent-txt' });
    },
    'save-settings': function () {
      readSettings();
      fillSettings();
      if (S.metrikaId) metrikaInit(S.metrikaId);
      renderMetrikaState();
      embedsDone = {};
      toast('Настройки сохранены');
      goal('settings_saved');
      loadBandlink();
      refresh(true);
      embedAll();
    },
    'clear-settings': function () {
      S = clone(DEFAULTS);
      save(SETTINGS_KEY, S);
      fillSettings();
      data = { yt: null, vk: null, tg: null };
      embedsDone = {};
      renderStats();
      drawCharts();
      live('Ключи удалены', '');
      toast('Ключи удалены');
    }
  };

  function bind() {
    document.addEventListener('click', function (e) {
      var goalEl = e.target.closest('[data-goal]');
      if (goalEl) goal(goalEl.dataset.goal, { source: goalEl.dataset.source || currentPage });

      var nav = e.target.closest('.nav-btn');
      if (nav) { showPage(nav.dataset.page); return; }

      var sub = e.target.closest('.sub-tab');
      if (sub) { showSocial(sub.dataset.social); return; }

      var agent = e.target.closest('.agent');
      if (agent) { runAgent(agent.dataset.agent); return; }

      var act = e.target.closest('[data-action]');
      if (act && ACTIONS[act.dataset.action]) {
        e.preventDefault();
        ACTIONS[act.dataset.action](act);
      }
    });

    /* arrow-key navigation inside the tablist */
    document.addEventListener('keydown', function (e) {
      if (!e.target.classList || !e.target.classList.contains('nav-btn')) return;
      var dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!dir) return;
      e.preventDefault();
      var btns = all('.nav-btn');
      var i = btns.indexOf(e.target);
      var next = btns[(i + dir + btns.length) % btns.length];
      next.focus();
      showPage(next.dataset.page);
    });

    var qrInput = $('qrTarget');
    qrInput.addEventListener('input', debounce(renderQr, 350));
    $('utmCampaign').addEventListener('input', debounce(function () {
      renderUtm((release && release.url) || smartUrl());
    }, 350));

    window.addEventListener('resize', debounce(function () {
      if (currentPage === 'dash') drawCharts();
    }, 200));

    window.addEventListener('hashchange', function () {
      var name = location.hash.slice(1);
      if (name && document.getElementById('page-' + name)) showPage(name);
    });
  }

  function debounce(fn, ms) {
    var t = null;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  function init() {
    fillSettings();
    renderGoals();
    renderHistoryState();
    bind();

    var start = location.hash.slice(1);
    if (start && document.getElementById('page-' + start)) showPage(start);

    $('utmCampaign').value = '';
    renderRelease();          // paint defaults immediately, then refine from the API
    drawCharts();

    fetch('/api/config', { headers: { accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        pub = j || null;
        if (pub) {
          /* env-provided values are the site-wide truth until the operator
             saves the settings form in this browser */
          ['bandlinkCode', 'vkGroup', 'ymArtist', 'tgChannel', 'ytChannel'].forEach(function (k) {
            if (pub[k] && (!S.touched || !S[k])) S[k] = pub[k];
          });
          save(SETTINGS_KEY, S);
          fillSettings();
        }
        metrikaInit((pub && pub.metrikaId) || S.metrikaId);
      })
      .catch(function () { metrikaInit(S.metrikaId); })
      .then(function () {
        renderMetrikaState();
        hit(currentPage);
        return loadBandlink();
      })
      .then(function () {
        embedAll();
        return refresh(false);
      });

    setInterval(tickStatus, 1000);
    tickStatus();
    scheduleRefresh();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
