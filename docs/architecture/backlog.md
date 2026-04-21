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

---

## Organizations

### Phone reuse across entity types (post-MVP)

Сейчас `users.phone` имеет глобальный UNIQUE, а `PHONE_ALREADY_REGISTERED` отдаётся при любой коллизии — вне зависимости от роли. Это корректно для MVP (один телефон = один user), но блокирует реальный кейс: человек сначала работает крановщиком в компании X, потом открывает свою компанию Y и хочет быть owner'ом. Сегодня такой сценарий требует ручной migration через суперадмина (смена роли + переназначение organization_id).

Пост-MVP options:
- **Multi-identity:** отделить `phones` от `users` — один phone → несколько user-ролей (operator в одном org, owner в другом). Требует переработки JWT claims и auth-flow (выбор роли при логине).
- **Explicit role upgrade:** API для superadmin'а "convert operator → owner", который reassigns organization_id без смены phone. Дешевле, но не покрывает одновременные роли.

Триггер: первый реальный запрос от заказчика или пользовательская жалоба. До этого — явный 409 в API документации достаточно.

### BIN external validation (post-MVP)

Сейчас валидируем BIN только по формальному checksum (KZ state algorithm, §2 shared/bin.ts). Это отклоняет случайные опечатки, но не проверяет существование юрлица в реестре — пользователь может ввести валидный-по-checksum, но несуществующий BIN.

Источники для проверки:
- **stat.gov.kz (БД юрлиц РК):** официальный государственный реестр. API существует, но требует регистрации и квоты — подходит для рабочего процесса, не для MVP где superadmin создаёт organizations вручную.
- **adata.kz:** коммерческий aggregator, возвращает name + status + адрес по BIN. Платный.
- **kgd.gov.kz (налоговая):** для проверки статуса налогоплательщика. Актуально если появится финансовый обмен.

Подключать когда: (а) self-service регистрация организаций (не через superadmin), либо (б) заказчик запросит auto-fill name/address по BIN в форме создания.

Не блокер MVP — superadmin проверяет BIN глазами по договору с клиентом.

---

## Cranes

### `cranes.tariffs_json` structured schema (blocked on payroll spec)

Сейчас `tariffs_json` хранится как свободный JSONB (`z.record(z.unknown())`). Это позволяет создавать краны и тестировать CRUD + ассоциации без финальной структуры тарифов.

Финальная структура придёт от специалиста заказчика на Этапе 3 (payroll engine). Ожидаемые поля (гипотеза, НЕ реализуется до подтверждения):

- `dayRate` / `nightRate` — часовые ставки
- `overtimeMultiplier` — коэффициент переработок
- `weekendMultiplier`, `holidayMultiplier`
- `fixedDailyRate` — альтернатива hourly
- `bonusStructure`
- `currency` (`'KZT'` в MVP)
- `effectiveFrom` / `effectiveTo` — история тарифов

Когда получим спеку → заменяем `z.record` на строгую Zod-схему + возможно JSONB CHECK constraint в БД. Сейчас owner/superadmin могут записать любой JSON в это поле. Payroll engine пока не использует `tariffs_json` (engine не написан — см. CLAUDE.md §4, Этап 3).

Триггер: получение спеки начислений от заказчика в первую неделю Этапа 3.

### Cover `siteId`-filter enumeration in cranes tests

Сейчас `GET /cranes?siteId=...` покрыт только happy-path (owner фильтрует по своему site). Foreign-siteId в query-параметре (owner A → `?siteId={orgB_siteId}`) НЕ имеет explicit теста.

Поведение скорее всего корректное: repository добавляет `WHERE organization_id = ctx.organizationId AND site_id = $filter` — пересечение пусто, вернётся `200 []` (не 403, legitimate query с бесполезным фильтром). Но без теста это полагание на имплементацию, регрессия пройдёт молча.

Отложено до Vertical B2 (operators): там появится аналогичный паттерн с `?craneId=...` query-фильтром. Добавить оба теста вместе — один для cranes.siteId, один для operators.craneId — чтобы закрыть класс "foreign resource ID in list filter" целиком.

Тест должен: создать org A (+ site + crane), org B (+ site), залогинить owner A, дёрнуть `GET /cranes?siteId={orgB_site.id}` → ожидать 200 с пустым items array.
