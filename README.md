# CENTR-KE — Казан Егетләре · Analytics Center

Коротко: статическая SPA (`index.html`) + serverless endpoints в `api/` (Vercel). Фронтенд хранит состояние в `localStorage` и может синхронизироваться с backend `/api/artist-dashboard`.

## Что добавлено в этой ветке
- README.md — инструкция по локальному запуску, деплою и списку ENV.
- .env.example — пример переменных окружения (без секретов).
- api/spotify-exchange.js — serverless endpoint для обмена `code` -> `access_token` (PKCE) для Spotify.

## Быстрый запуск локально
- Быстрый статический сервер:

  ```bash
  python3 -m http.server 8000
  # открыть http://localhost:8000/index.html
  ```

- С serverless (Vercel) локально:

  ```bash
  npm i -g vercel
  vercel dev
  # открыть http://localhost:3000
  ```

## Деплой на Vercel
- Установите `vercel` CLI и выполните `vercel` или `vercel --prod`.
- В Vercel Dashboard → Project → Settings → Environment Variables добавьте переменные, перечисленные ниже.

## Обязательные / рекомендуемые ENV (Vercel)
- YANDEX_COUNTER_ID — id счётчика Яндекс.Метрики
- YANDEX_OAUTH_TOKEN — OAuth токен для доступа к API Метрики
- BANDLINK_API_URL — базовый URL BandLink API (пример: https://api.band.link)
- BANDLINK_API_TOKEN — токен BandLink API
- BANDLINK_LINK_ID — id вашей BandLink ссылки
- ARTIST_NAME, ARTIST_DESC — необязательные переопределения профиля
- SPOTIFY_CLIENT_ID — client id для Spotify PKCE (публичный)
- SPOTIFY_CLIENT_SECRET — опционально (если не используете PKCE)

Опциональные соцсети (переменные): SOCIAL_TELEGRAM, SOCIAL_VK, SOCIAL_YOUTUBE, SOCIAL_INSTAGRAM, SOCIAL_SPOTIFY, SOCIAL_YANDEX_MUSIC, SOCIAL_APPLE_MUSIC, BANDLINK_LINK, BANDLINK_MANAGE

## Spotify PKCE
Фронтенд генерирует `code_verifier` и `code_challenge`. После р��директа Spotify возвращает `code` в query; фронтенд отправляет `code` и `code_verifier` в `/api/spotify-exchange`, который выполняет обмен на токены.

> По умолчанию сервер возвращает Spotify token JSON обратно фронтенду (совместимо с текущим frontend). Если вы хотите более строгую схему безопасности (хранить `refresh_token` на сервере и возвращать только идентификатор сессии), скажите — могу изменить реализацию в PR.

## Тестирование endpoint локально
- `vercel dev` поднимет endpoint локально.
- Пример curl (после редиректа):

  ```bash
  curl -X POST http://localhost:3000/api/spotify-exchange \
    -H "Content-Type: application/json" \
    -d '{"code":"CODE","code_verifier":"VERIFIER","redirect_uri":"http://localhost:3000/"}'
  ```

## Безопасность
- Не храните секреты в клиентской части. Храните `YANDEX_OAUTH_TOKEN`, `BANDLINK_API_TOKEN`, `SPOTIFY_CLIENT_SECRET` только в server-side env (Vercel).

## Следующие шаги
- Откройте PR из `feat/add-readme-env-spotify` → `main` (я закоммитил файлы в ветку). Я могу обновить реализацию, если вы хотите хранить `refresh_token` на сервере.
