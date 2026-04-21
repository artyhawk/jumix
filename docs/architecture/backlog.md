# Architecture backlog

Решения, отложенные после MVP. Каждый пункт — что, зачем, когда включать.

---

## Auth

### Web cookie mode (pending arrival of `apps/web`)

Сейчас реализован mobile-first flow: `/auth/refresh` принимает `refreshToken` в JSON-body, `/auth/logout` — аналогично. Это подходит для мобилки (refresh лежит в `expo-secure-store`, передаётся явно).

Для веб-клиента нужна параллельная схема через HttpOnly-cookies (CLAUDE.md §5.2):

- **Access cookie:** `httpOnly`, `Secure`, `SameSite=Lax`, path `/api`, TTL = access TTL.
- **Refresh cookie:** `httpOnly`, `Secure`, `SameSite=Strict`, `path=/api/auth/refresh` (ограничивает отправку на refresh-endpoint).
- **CSRF:** double-submit pattern. На login сервер ставит non-HttpOnly cookie `csrf_token`, фронт копирует его в заголовок `X-CSRF-Token` на mutating запросах. Или `@fastify/csrf-protection` плагин — оценить когда появится `apps/web`.
- **Origin/Referer check:** дополнительный layer для mutating endpoints — сверять `request.headers.origin` с whitelist из `CORS_ORIGINS`.
- **Logout:** сервер шлёт `Set-Cookie` с `Max-Age=0`, клиенту ничего делать не нужно.
- **Rotation:** после успешной ротации — новые `Set-Cookie` с новой парой.

Переключение между cookie и bearer — по `clientKind` или отдельный suffix endpoint'а (`/auth/refresh/web` vs `/auth/refresh/mobile`). Решим при имплементации, зависит от того будет ли один fastify-app обслуживать оба клиента или веб пойдёт через Next.js server-actions proxy.

### `clientKind` authority

Сейчас `clientKind: 'web' | 'mobile'` приходит из тела запроса — клиент сам объявляет свой тип, а TTL refresh (30 vs 90 дней) зависит от этого. Это позволяет злонамеренному клиенту выписать себе долгоживущий mobile-токен с веб-сессии.

После запуска `apps/web` сделать серверным: `clientKind` выводится из User-Agent, Origin заголовков и наличия/отсутствия cookies (web всегда через cookies, mobile всегда через bearer). Передача в body — запрещена.

Не блокер для MVP: на стадии "только мобилка в проде" злоупотребить нечем, веб ещё не задеплоен.

### Enhanced rotation-race detection (post-MVP)

Сейчас race-detection использует 10-секундное окно + сравнение IP / User-Agent / deviceId с winner'ом. Балл 0 — чистый race (401 без revoke цепи), > 0 — эскалируется до full reuse. IP-изменение даёт 0.3 (решающее без GeoIP), UA — 1.0, deviceId — 2.0.

Улучшения когда появятся реальные данные:

- **GeoIP:** считать смену страны (через MaxMind/ipapi) решающим сигналом, IP в пределах одного ASN — не сигнал.
- **Mobile carrier ASN:** IP-флип в пределах одного оператора (переключение LTE-вышки) понижает риск, потенциально обнуляет вклад IP.
- **Device fingerprinting:** брать больше атрибутов от мобильного клиента (timezone, locale, screen size, OS version) — сравнивать как fingerprint, а не отдельные поля.
- **ML risk scoring:** если наберётся статистика реальных атак и false-positive'ов, заменить фиксированные веса.

Триггер для включения: первый реальный инцидент reuse-detection ИЛИ массовые жалобы на spurious logout после wake-from-background.
