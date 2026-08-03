# CENTR-KE — Artist Analytics (Backend)

Кратко
CENTR-KE — аналитический backend для проекта "Казан Егетләре". Этот репозиторий содержит serverless‑эндпойнты (Vercel) которые собирают метрики (Yandex.Metrika, Band.link, Spotify, YouTube и т.д.) и возвращают унифицированный JSON для фронтенда (GitHub Pages).

Основные цели:
- Надёжный server-side сбор метрик (без секретов в клиенте).
- Единый JSON‑контракт для фронтенда.
- Места для безопасных интеграций (Yandex OAuth, Band.link, Spotify PKCE).

## Быстрый старт (локально / git)
1. Склонируйте репо:
   git clone <REPO_URL>
   cd <REPO_DIR>

2. Убедитесь, что в корне есть папка `api/` с файлами:
   - api/health.js
   - api/artist-dashboard.js
   - опционально: api/yandex-exchange.js, api/yandex-refresh.js, api/spotify-exchange.js

3. Commit & push:
   git add api/*
   git commit -m "Add backend endpoints"
   git push origin main

4. Развёртывание:
   - Рекомендуемый способ: импортируйте репозиторий в Vercel (https://vercel.com) → Deploy.
   - Или через CLI: npm i -g vercel; vercel --prod

5. Проверьте (замените PROD_URL на ваш Vercel production domain):
   curl -i https://PROD_URL/api/health
   curl -i https://PROD_URL/api/artist-dashboard

## Ожидаемые backend‑эндпойнты
(Адреса по умолчанию — пример для вашего проекта: https://centr-ke-26.vercel.app)

- GET /api/health
  - Описание: простой health‑check.
  - Пример ответа:
    HTTP/1.1 200 OK
    { "ok": true, "time": "2026-08-02T21:42:32.229Z" }

- GET /api/artist-dashboard
  - Описание: основной эндпойнт — возвращает агрегированный объект артиста (социальные ссылки, summary, tracks, sources).
  - Пример запроса:
    curl -i https://centr-ke-26.vercel.app/api/artist-dashboard
  - Пример базового ответа (скелет; реальные метрики — только при подключённых сервисах):
    {
      "artist": { "name": "Казан Егетләре", "description": "" },
      "summary": {
        "streams": null,
        "views": null,
        "audience": null,
        "streamsSource": "Нет данных",
        "viewsSource": "Нет данных",
        "audienceSource": "Нет данных"
      },
      "tracks": [],
      "socials": {
         "telegram": "https://t.me/kazanegetlare",
         "vk": "https://m.vk.ru/kazan_egetlare",
         "youtube": "https://youtube.com/@kazan_egetlare?si=...",
         "instagram": "https://www.instagram.com/kazan_egetlare_official",
         "yandexMusic": "...",
         "vkMusic": "...",
         "appleMusic": "...",
         "spotify": "...",
         "bandlink": "https://band.link/HKtfe"
      },
      "geo": [],
      "monthly": [],
      "platforms": [],
      "sources": [
        { "name": "Backend", "status": "ok", "message": "Backend развернут, ключи не подключены" },
        { "name": "Yandex.Metrika", "status": "not_configured", "message": "no token/ID" }
      ]
    }

- GET/POST /api/yandex-exchange (optional)
  - Описание: callback endpoint для обмена authorization code → access_token + refresh_token (не публикуйте client_secret в публичных местах).
  - Поведение: при GET без ?code — показывает ссылку на authorize; при редиректе с ?code — делает POST к https://oauth.yandex.ru/token и возвращает HTML с токенами для копирования.

- POST /api/yandex-refresh
  - Описание: использует YANDEX_REFRESH_TOKEN + client creds, возвращает новый access_token JSON.

- POST /api/spotify-exchange (optional)
  - Описание: серверный обмен code → token для Spotify PKCE / Authorization Code flow (реализация по необходимости).

Примечание: некоторые endpoints могут быть временно неактивны до того, как вы добавите env vars в Vercel.

## Формат JSON ответа (схема и описание полей)
Ниже — рекомендуемая схема ответа и типы полей. Поля nullable (могут быть null) — так, чтобы фронтенд правильно отображал «Нет данных».

- artist (object)
  - name (string) — название артиста
  - description (string) — краткое описание

- summary (object) — основное агрегированное представление
  - streams (number|null) — суммарные стримы (если применимо)
  - views (number|null) — просмотры (YouTube и т.д.)
  - audience (number|null) — уникальные пользователи / слушатели (например Yandex users)
  - streamsSource (string) — источник данных для streams
  - viewsSource (string)
  - audienceSource (string)

- tracks (array of objects) — список треков / релизов
  - id (string) — внутренний id или external_id
  - title (string)
  - platform (string) — e.g. "Yandex.Music", "Spotify"
  - streams (number|null)
  - audioUrl (string|null)
  - coverUrl (string|null)
  - source (string) — откуда данные

- socials (object) — ссылки
  - telegram, vk, youtube, instagram, yandexMusic, vkMusic, appleMusic, spotify, bandlink (all string)

- geo (array) — гео-агрегация
  - [{ country: "RU", plays: 1234 }, ...]

- monthly (array) — timeseries по месяцам / периоды
  - [{ date: "2026-07-01", streams: 123, views: 321 }, ...]

- platforms (array) — разбивка по платформам
  - [{ name: "Yandex.Music", streams: 123 }, ...]

- sources (array) — источникные метаданные / статусы
  - [{ name: "Yandex.Metrika", status: "ok"|"not_configured"|"error", message: "...", meta: {...} }, ...]

Примеры типов:
- Числа: integers (без кавычек)
- Пустые значения: null
- Даты: ISO 8601 строки, например "2026-08-02T21:42:32.229Z"

## Переменные окружения (рекомендуемый список)
Добавляйте через Vercel → Project → Settings → Environment Variables

Общие:
- ARTIST_NAME
- ARTIST_DESC
- SOCIAL_TELEGRAM
- SOCIAL_VK
- SOCIAL_YOUTUBE
- SOCIAL_INSTAGRAM
- SOCIAL_YANDEX_MUSIC
- SOCIAL_VK_MUSIC
- SOCIAL_APPLE_MUSIC
- SOCIAL_SPOTIFY

Yandex Metrika / OAuth:
- YANDEX_CLIENT_ID
- YANDEX_CLIENT_SECRET
- YANDEX_COUNTER_ID
- YANDEX_OAUTH_TOKEN  (access_token)
- YANDEX_REFRESH_TOKEN

Band.link:
- BANDLINK_API_URL
- BANDLINK_API_TOKEN
- BANDLINK_LINK_ID
- BANDLINK_LINK (public url)

Spotify:
- SPOTIFY_CLIENT_ID
- SPOTIFY_CLIENT_SECRET (при использовании server-side Authorization Code, иначе PKCE)
- SPOTIFY_REDIRECT_URI (если нужно)

Vercel runtime:
- VERCEL_URL (автоматически установлен Vercel при deploy)

## Шаг: добавить Yandex OAuth (быстрая инструкция)
1. На https://oauth.yandex.ru/create (или /client/new) создайте приложение, укажите Redirect URI:
   https://<YOUR_PROD_DOMAIN>/api/yandex-exchange
2. Скопируйте Client ID и Client Secret → вставьте в Vercel env vars:
   - YANDEX_CLIENT_ID
   - YANDEX_CLIENT_SECRET
3. Добавьте файл api/yandex-exchange.js (если ещё нет) и запушьте.
4. Откройте в браузере:
   https://oauth.yandex.ru/authorize?response_type=code&client_id=YANDEX_CLIENT_ID&scope=metrika:read&redirect_uri=https://<YOUR_PROD_DOMAIN>/api/yandex-exchange
5. После разрешения Yandex перенаправит вас на /api/yandex-exchange — endpoint обменяет code→tokens и покажет access_token + refresh_token. Скопируйте их и добавьте в Vercel env vars:
   - YANDEX_OAUTH_TOKEN
   - YANDEX_REFRESH_TOKEN
6. Redeploy проекта и проверьте /api/artist-dashboard — в sources появится Yandex.Metrika status=ok и summary.audience заполнится.

(Подробная инструкция и шаблон endpoints — в repo/api/ — используйте их как есть.)

## Тестирование и отладка
- Локально можно тестировать вызовы к Vercel production URL:
  curl -i https://centr-ke-26.vercel.app/api/artist-dashboard
- Логи Vercel: Vercel Dashboard → Project → Deployments → View Logs
- Инструменты:
  - jq для форматированного вывода JSON (curl ... | jq .)
  - Postman / Insomnia для интерактивных запросов

## Безопасность и рекомендации
- Никогда не храните client_secret или refresh_token в публичных репозиториях.
- Токены (access/refresh) — только в Vercel env vars.
- Закройте публичный exchange endpoint после получения токенов (например, удалите файл или добавьте простой пароль).
- Используйте Cache-Control (s-maxage / stale-while-revalidate) для снижения количества внешних вызовов и ускорения ответов.
- Логи — сохраняйте ошибки, но не токены в логах.

## Формат PR / Изменений
- Каждый новый интеграционный модуль (например bandlink, spotify) должен идти в отдельном PR с:
  - тестами локального запроса (mock),
  - документацией env vars,
  - примером запроса к API и примером ответа.

## Частые вопросы
Q: Что делать, если Yandex token истёк?  
A: Используйте /api/yandex-refresh (POST) — он обменяет refresh_token → новый access_token. Затем замените YANDEX_OAUTH_TOKEN в Vercel и Redeploy (или храните access_token в env и используйте refresh flow на сервере автоматически).

Q: Band.link не предоставляет API — как импортировать данные?  
A: Используйте CSV‑экспорт из Band.link UI и импортируйте через frontend CSV‑импорт. Можно автоматизировать: регулярная выгрузка CSV + загрузка в backend parser.

## Контакты и поддержка
Если нужно — я могу:
- Создать PR с README (этот файл) и примерами endpoints;
- Подключить Yandex «под ключ» (помогаю с exchange flow и setup);
- Написать /api/spotify-exchange и frontend‑визуализации.

## Источники
1. Yandex OAuth / регистрация приложения — https://oauth.yandex.ru/  
2. Yandex Metrika API (stat/v1/data) — https://yandex.ru/dev/metrika/doc/api2/intro.html  
3. Spotify Authorization Guide (PKCE & Auth flows) — https://developer.spotify.com/documentation/general/guides/authorization-guide/  
4. Vercel Functions & Environment Variables — https://vercel.com/docs/concepts/functions/serverless-functions ; https://vercel.com/docs/environment-variables  
5. Band.link — https://band.link/  
6. Frontend site (GitHub Pages) — https://aydaraglyamov-droid.github.io/CENTR-KE/  
7. Backend prod example — https://centr-ke-26.vercel.app/
