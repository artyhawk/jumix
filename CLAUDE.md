# CLAUDE.md — Jumix Platform

> Индекс + критичные инварианты для Claude Code. Историческая детализация по вертикалям — в [ARCHITECTURE.md](ARCHITECTURE.md). Архитектура подсистем — в [docs/architecture/](docs/architecture/).
> Версия: 3.0 | Дата: апрель 2026 | Проект: Jumix (платформа управления крановщиками)

---

## 0. Как Claude Code должен работать с этим документом

**Читать целиком перед любой задачей.** Этот документ — индекс и критичные инварианты. Историческая детализация конкретных вертикалей вынесена в `ARCHITECTURE.md` (deep history), архитектура подсистем — в `docs/architecture/*.md`. Их читай по мере необходимости для текущей задачи (не все подряд).

**Если задача противоречит этому документу** — сначала спросить, не обновлять CLAUDE.md / ARCHITECTURE.md / detail docs молча.

**Если задача не покрыта документацией** — применить принципы из §3 (Decision framework) и предложить решение, не делать молча.

**Приоритет источников:**
1. Явная инструкция пользователя в текущем сообщении
2. CLAUDE.md (этот файл) — критичные инварианты
3. `ARCHITECTURE.md` — детали по конкретной вертикали (когда задача затрагивает специфический slice)
4. `docs/architecture/*.md` — детальные spec'и подсистем
5. Документы заказчика: `/docs/contract/ТЕХНИЧЕСКОЕ_ЗАДАНИЕ.docx`, `/docs/contract/Договор.docx`
6. Общие best practices

---

## 1. О проекте

SaaS-платформа для компаний Казахстана, сдающих в аренду башенные краны и предоставляющих крановщиков на стройки. Три клиента: веб-портал (Next.js, суперадмин/владелец/ограниченный operator), мобилка (Expo, крановщики — смены/GPS/СИЗ), API (Fastify) + Worker (BullMQ).

**Роли:** `superadmin` (вся платформа, без финансов компаний) · `owner` (своя организация) · `operator` (свои данные). См. [docs/architecture/authorization.md](docs/architecture/authorization.md).

**Заказчик:** ТОО «Telse», Шымкент. Исполнитель: ИП «Yerbol». Договор №T35.5/26 от 17.04.2026. Срок MVP: 5 месяцев. Полный контекст — [docs/architecture/project-overview.md](docs/architecture/project-overview.md).

**Текущая фаза:** Этап 2 (мобилка + смены + GPS + СИЗ) почти закрыт. Последняя завершённая вертикаль — M6 (safety compliance). Следующая — M7 push-уведомления.

**Статистика:** 1749 тестов в репозитории (api 781 + web 585 + mobile 255 + shared 85 + auth 36 + db 7).

---

## 2. Index — куда идти за деталями

### Историческая детализация (per-vertical, on-demand)

| Тема | Файл |
|---|---|
| История вертикалей B3-UI-* + M* | [ARCHITECTURE.md](ARCHITECTURE.md) |

### Архитектура подсистем (always-relevant reference)

| Тема | Файл | Что внутри |
|---|---|---|
| Project overview | [project-overview.md](docs/architecture/project-overview.md) | Заказчик, договор, MVP scope, out-of-scope, роли |
| Tech stack | [tech-stack.md](docs/architecture/tech-stack.md) | Backend / frontend / mobile / DevOps / testing / code-quality — выбор и версии |
| Architecture | [architecture.md](docs/architecture/architecture.md) | Монорепа layout, слои API (route→handler→policy→service→repo), apps/worker |
| Authorization | [authorization.md](docs/architecture/authorization.md) | Four-layer defense, матрица прав, 404-вместо-403 |
| Authentication | [authentication.md](docs/architecture/authentication.md) | JWT + refresh rotation, хранение на web/mobile, rate limit, schema |
| Database schema | [database.md](docs/architecture/database.md) | Все таблицы MVP, status-инварианты, критичные индексы |
| Business logic | [business-logic.md](docs/architecture/business-logic.md) | Геозона, state machine operator, document expiry cron, payroll (DEFERRED), audit |
| Object storage | [storage.md](docs/architecture/storage.md) | MinIO bucket layout, key-конвенции, versioning, TTL, drivers |
| Design system | [design-system.md](docs/architecture/design-system.md) | Цвет, типографика, spacing, компоненты, логотип |
| Web architecture | [web-architecture.md](docs/architecture/web-architecture.md) | apps/web структура, auth-flow, API-client, motion-слой, responsive-стратегия |
| Mobile app | [mobile-app.md](docs/architecture/mobile-app.md) | UX для крановщика, экраны, GPS, push, offline |
| Infrastructure | [infrastructure.md](docs/architecture/infrastructure.md) | docker-compose, healthchecks, backup, monitoring, secrets |
| CI/CD | [cicd.md](docs/architecture/cicd.md) | Pipelines (PR/main/tag), миграции, rolling deploy |
| Backlog | [backlog.md](docs/architecture/backlog.md) | Отложенные задачи (post-MVP, блокеры заказчика) |
| ADRs | [adr/](docs/architecture/adr/) | Architectural decision records: [0002 holding-approval](docs/architecture/adr/0002-holding-approval-model.md), [0003 operators multi-org](docs/architecture/adr/0003-operators-multi-org-model.md), [0004 public registration](docs/architecture/adr/0004-public-registration-flow.md), [0005 license flow](docs/architecture/adr/0005-license-document-flow.md), [0006 shift lifecycle](docs/architecture/adr/0006-shift-lifecycle.md), [0007 gps tracking](docs/architecture/adr/0007-gps-tracking.md), [0008 safety compliance](docs/architecture/adr/0008-safety-compliance.md) |

**Правило чтения:** под задачу открывай 1-2 файла максимум. Не грузи всё подряд — контекст-окно не резиновое.

**Cross-references в коде:** комментарии типа `CLAUDE.md §4.2` ссылаются на секцию в соответствующем detail-файле (нумерация §X.Y сохранена — §4 → authorization.md, §6.3 → database.md §6.3, §7.1 → business-logic.md §7.1, и т.д.). `CLAUDE.md §6 rule #N` ссылается на критичный инвариант (этот файл, §6 ниже).

---

## 3. Decision framework — как принимать решения

Когда встречаешь вопрос, не покрытый документацией:

1. **Безопасность > фичи.** Любая утечка тенант-данных = катастрофа.
2. **Простота > гибкость.** MVP, один разработчик. Не городи абстракции «на будущее».
3. **Явное > неявное.** Типы, валидация, именование. Читаемость важнее краткости.
4. **Тесты > надежды.** Критичные пути покрываются, сомнительные — тем более.
5. **Документация для заказчика.** Всё что может вызвать спор — в ТЗ / допсоглашении / аудит-логе.
6. **Rule of three.** Не выносить в абстракцию пока не встретил паттерн 3 раза.
7. **Стандартные решения.** Нет — переизобретению ORM, auth, queue. Используем проверенные библиотеки.
8. **Не начинать без ТЗ.** Если бизнес-логика неясна (движок начислений) — placeholder + явная пометка «ждём спеку».

---

## 4. Этапы разработки

### Этап 1: Веб-портал + инфраструктура — ✅ закрыт
B1-B2d backend (auth/rbac/CRUD/storage/license cron) + B3-UI-1..5 web (3 кабинета + approval workflows + maps + i18n + deploy).

### Этап 2: Мобильное приложение + смены — почти закрыт
M1 foundation + M2 /me + M3 license + M4 shifts + M5 GPS (a/b/c) + M6 safety (a/b). Осталось M7 (push) + M8 (store builds).

### Этап 3: Финансы + аналитика — pending
- [ ] **ПОЛУЧИТЬ от заказчика спеку начислений** (в первую неделю этапа)
- [ ] **Написать unit-тесты** по спеке до кода, подписать с заказчиком
- [ ] Payroll engine: реализация по спеке
- [ ] Табель (автосбор из shifts) · Экспорт PDF / Excel · Замены · Аналитика

### Этап 4: Рейтинги + запуск
Рейтинги operators/orgs · биржа · push FCM · публикация в App Store / Google Play · документация · акты.

### Пост-сдача (60 дней гарантия)
Bug-репорты · мелкие правки · мониторинг.

---

## 5. Конвенции кода

### 5.1 TypeScript

- `strict: true` в tsconfig (mobile workspace — `verbatimModuleSyntax: false`, см. ARCHITECTURE.md#m3)
- Никаких `any` без явной причины (и тогда — с комментарием)
- Zod-схемы для всех внешних данных (HTTP request, БД JSON-поля, env vars)
- Типы выводятся из Zod через `z.infer<>`

### 5.2 Именование

- **Файлы:** kebab-case (`operator.service.ts`)
- **Классы:** PascalCase (`OperatorRepository`)
- **Функции/переменные:** camelCase (`findByOrganizationId`)
- **Константы:** SCREAMING_SNAKE_CASE (`MAX_UPLOAD_SIZE_MB`)
- **БД таблицы:** snake_case множественное (`operators`, `refresh_tokens`)
- **БД колонки:** snake_case (`organization_id`, `created_at`)
- **API endpoints:** kebab-case (`/api/v1/marketplace/contact-requests`)

### 5.3 Git

- Branch naming: `feat/operator-crud`, `fix/geofence-edge-case`, `chore/update-deps`
- Commits: Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`)
- PR должны быть маленькими (< 400 строк changed, идеально)
- Squash merge в main

### 5.4 API конвенции

- REST, версионированный через URL: `/api/v1/...`
- Стандартные HTTP статусы (200, 201, 204, 400, 401, 403, 404, 409, 422, 429, 500)
- Ошибки в формате:
  ```json
  {
    "error": {
      "code": "OPERATOR_NOT_FOUND",
      "message": "Human readable message",
      "details": { ... }
    }
  }
  ```
- Пагинация: `?page=1&limit=20` или cursor-based для больших списков
- Timestamps в ответах: ISO 8601 UTC
- OpenAPI спека автогенерируется из Zod-схем

### 5.5 Запрещено

- `console.log` в production-коде (только через logger)
- Секреты в коде или `.env` в git
- Raw SQL (кроме миграций и сложных отчётов — с явным ревью)
- `any` без обоснования
- Бизнес-логика в handlers — выносить в services
- Прямые db-запросы из handlers / services — только через repository
- Мутации state без явных причин

---

## 6. Критичные инварианты для Claude Code

> Эти инварианты **always-relevant**: применяются к любому новому коду. Нумерация стабильная — на правила #N ссылаются комментарии в коде. Если инвариант изменился — править здесь + обсудить с пользователем, не молча.

1. **Никогда не пиши auth-логику с нуля.** Используй существующие модули из `packages/auth`. Если нужно изменить — меняй там, а не копируй.

2. **Всегда проверяй tenant scope.** Любой query к данным должен быть scoped по `organization_id` или `user_id` через repository.

3. **Никогда не добавляй endpoint без тестов на авторизацию.** Минимум 4 теста: happy path, wrong role same org, wrong org, unauthenticated.

4. **Никогда не коммить секреты.** Если видишь случайно вставленный токен/пароль — останови, скажи пользователю.

5. **Не трогай движок начислений без спеки от заказчика.** Placeholder — да, реальные формулы — только после получения спеки и написания тестов.

6. **Миграции БД — только вперёд.** Никаких `DROP COLUMN` в том же релизе, где код перестаёт использовать колонку.

7. **При сомнении — спроси.** Не делай предположений в критичной логике (auth, финансы, права доступа).

8. **Обновляй документацию** когда архитектурные решения меняются. Правка в detail-файле + (если меняется critical-rule или index) — в CLAUDE.md. Не молча — сначала обсуди с пользователем.

9. **Object storage — только через `app.storage`.** Никогда не импортируй `MinioStorageClient` / `InMemoryStorageClient` из модулей. Ключи строятся через helpers в `apps/api/src/lib/storage/object-key.ts` (tenant-prefix обязателен). Детали — [storage.md](docs/architecture/storage.md).

10. **Self-service endpoints (`/me`, `/me/**`) — subject ТОЛЬКО из `ctx.userId`.** Никогда не принимай `operatorId` / `userId` из URL path, query или body в `/me`-endpoint'ах. Это cross-tenant vulnerability: параметр приглашает к злоупотреблению даже если policy «страхует». Контракт `/me` — просто `ctx.userId`, без parameters. Детали — [authorization.md §4.2a](docs/architecture/authorization.md).

11. **Approval-gated entities (cranes; в будущем — crane_profiles и т.п.) имеют двумерный статус.** `approval_status` (pending/approved/rejected) ортогонален operational `status` и меняется ТОЛЬКО через отдельные endpoints `:id/approve` и `:id/reject`, доступные superadmin'у. `POST /entity` создаёт pending; operational операции (update, setStatus) требуют `approval_status='approved'`. Rejected — read-only (только delete для cleanup). Owner НЕ одобряет свои же заявки (внешний актор обязателен — инвариант holding-approval). Детали — [authorization.md §4.2b](docs/architecture/authorization.md) + ADR [0002](docs/architecture/adr/0002-holding-approval-model.md).

12. **Operator identity ⊥ hire. Operator JWT не несёт organizationId (ADR 0003).** Крановщик живёт как `crane_profiles` (global identity, ИИН глобально уникальный) + N `organization_operators` (M:N hire). `AuthContext` для role=operator — `{ role, userId, tokenVersion }`, БЕЗ `organizationId`. Per-org действия operator'а идут через `X-Organization-Id` header; preHandler `app.requireOrganizationContext` (plugin `organization-context`) резолвит его в `organization_operators.id` с approval-gate и вешает `request.organizationContext`. Identity (self-endpoints `/me`, `/me/avatar/*`, platform CRUD + approve/reject) живёт в модуле `crane-profile/` — pipeline 1. Hire (admin-surface owner'а + approve/reject superadmin'ом) живёт в модуле `organization-operator/` — pipeline 2: POST принимает ТОЛЬКО `{craneProfileId, hiredAt?}` и создаёт pending organization_operator; superadmin апрувит через `POST /:id/approve` / отклоняет через `POST /:id/reject`. `softDelete` затрагивает ТОЛЬКО hire-запись — identity на crane_profile сохраняется (тот же человек может быть перенанят). DTO отдаёт nested `craneProfile` (анти-N+1); phone (masked) только в detail endpoint. Оба approval-pipeline'а работают по правилу #11. Детали — [authorization.md §4.2c](docs/architecture/authorization.md) + ADR [0003](docs/architecture/adr/0003-operators-multi-org-model.md).

13. **Operator может иметь `users.organization_id = NULL`.** После регистрации через public SMS-flow (ADR 0004) оператор существует в `users` как identity-row без primary org; per-org связи — только через `organization_operators`. Migration 0008 ослабила `users_org_role_consistency_chk` под этот случай. Middleware-последствия: `authenticate.ts` проверяет active-организацию ТОЛЬКО для `role='owner'` (superadmin и operator не привязаны к primary org). Owner'ы всё ещё обязаны иметь active-org — их invariant не меняется.

14. **Public registration flow (ADR 0004).** `POST /api/v1/registration/start` + `/verify` — единственные endpoints без `app.authenticate` кроме `/auth/sms/*`. Реализация — тонкий orchestration-слой поверх `SmsAuthService` + `TokenIssuerService` (переиспользуем OTP store, rate-limit окна 1/60s + 5/hour phone + 20/hour IP, audit `auth_events.sms_*`). `verify` транзакционно создаёт `users{role:'operator', organizationId:null}` + `crane_profiles{approvalStatus:'pending'}` + audit `registration.complete`, потом выдаёт JWT-пару. Enumeration protection: `/start` всегда 202, конфликты всплывают только на `/verify` (409 PHONE_ALREADY_REGISTERED / IIN_ALREADY_EXISTS). `GET /api/v1/crane-profiles/me/status` — mobile screen routing: возвращает `{profile, licenseStatus, memberships[], canWork}` где `canWork = profile.approved && some(hire: approved+active) && isLicenseValidForWork(licenseStatus)` (третий gate добавлен в B2d-4, см. rule #15). Детали — ADR [0004](docs/architecture/adr/0004-public-registration-flow.md).

15. **License document flow (ADR 0005).** Удостоверение крановщика живёт на `crane_profiles` (миграция 0009 добавила `license_key`, `license_expires_at`, `license_version`, `license_warning_{30d,7d}_sent_at`, `license_expired_at`). Storage path версионированный: `crane-profiles/{id}/license/v{N}/{filename}` — старые версии не удаляются, retention в backlog. `license_status` НЕ хранится: computed на boundary через `computeLicenseStatus(expiresAt, now) → 'missing'|'valid'|'expiring_soon'|'expiring_critical'|'expired'`. Endpoints: self-path `POST /me/license/{upload-url,confirm}` (только `approvalStatus='approved'`, иначе 409 CRANE_PROFILE_NOT_APPROVED), admin-path `POST /:id/license/{upload-url,confirm}` (superadmin only, работает с pending — onboarding override). Confirm проверяет prefix-match с `expectedPrefix = crane-profiles/{own-id}/license/v{licenseVersion+1}/` (защита от foreign-profile injection и stale version), HEAD на object, content-type whitelist (jpeg/png/pdf), size ≤ 10MB. Re-upload обнуляет все `warning_*_sent_at` — новый срок, новый цикл предупреждений. BullMQ repeatable job `license-expiry-scan` `'0 2 * * *'` tz `Asia/Almaty`: `LicenseExpiryWorker.process(now)` SELECT кандидатов (`license_expires_at IS NOT NULL AND deleted_at IS NULL AND <= now+30d`), `determineWarning()` с приоритетом **expired > 7d > 30d**, атомарно UPDATE warning-flag + INSERT audit `license.warning_sent` metadata `{variant, expiresAt}`. Worker class plain-сервис (тесты вызывают `app.licenseExpiryWorker.process()` напрямую без Redis); BullMQ — только scheduler. Worker НЕ шлёт push/SMS в MVP (отложено в backlog notifications). `canWork` — трёхфакторный: profile approved AND ≥1 approved+active hire AND `isLicenseValidForWork(status)` (блокирует только `missing`/`expired`; `expiring_*` — warning, не блок). Admin confirm использует action `license.upload_admin`, self — `license.upload_self`. `licenseUrl` в DTO — presigned GET на 15 минут, не хранится. Детали — ADR [0005](docs/architecture/adr/0005-license-document-flow.md).

---

## 7. Recent verticals (последние 5 — brief)

> Краткие summary последних завершённых вертикалей. Полная детализация — [ARCHITECTURE.md](ARCHITECTURE.md).

### B3-LANDING — Public marketing landing (April 2026)
Native Next.js public landing на `/` (заменяет Tilda template). Cabinet остаётся через `/login` (subdomain routing — deploy-vertical). Отдельный route group `(marketing)` parallel к `(app)`, отдельный visual language (deeper dark `#07070a`, generous spacing, premium scroll-driven animations через `framer-motion` `useInView`/parallax). Sections: hero (staggered fade-up + dashboard mockup с mouse parallax) / pain-points / for-companies / for-operators (phone mockup с тикающим таймером) / how-it-works (3 SVG illustrations) / why-jumix / final-cta. WhatsApp primary CTA (`wa.me/77022244428` с urlencoded text "Здравствуйте, интересует Jumix") — общий `whatsappLink()` helper в `whatsapp.ts` (не client-only, чтобы server components могли import). SVG mockups inline (НЕ screenshots). i18n — переиспользуем существующий `t()` helper (lib/i18n.ts), новый `tList<T>()` для массивов; `messages/ru.json` с namespace `marketing`; **next-intl НЕ используется** (rule #16 preserved). SEO: `sitemap.ts` + `robots.ts` (allow public, disallow `/login`/`/dashboard`/etc.) + Organization+WebSite JSON-LD. Privacy/Terms — boilerplate с TODO для legal review (требуется перед M8 store submission). `(auth)/layout.tsx` redirect role-aware (operator → `/me`, остальные → `/dashboard`) — раньше шёл на `/`, теперь это marketing. `(app)/page.tsx` удалён — root URL теперь marketing. IntersectionObserver mock добавлен в `tests/setup.ts` для framer-motion `useInView`. Tests +30. Subdomain routing (jumix.kz vs app.jumix.kz) — отдельный deploy-mini-vertical, NOT в этом коммите. → [ARCHITECTURE.md#b3-landing](ARCHITECTURE.md#b3-landing-public-marketing-landing)

### M6 — Safety compliance (April 2026)
Pre-shift checklist (embedded в startShift atomic transaction; required items per crane.type из `@jumix/shared`; hard-rule no skip) + incident reporting (operator submits с photos + GPS auto-attach из M5 SQLite queue; severity self-assignment; state machine submitted→acknowledged→resolved/escalated). Owner `/incidents` page + dashboard danger-highlight card. Three-phase photo upload mirrors license M3. Schema migration 0012, ADR 0008. Backend (M6-a) + mobile (M6-b). → [ARCHITECTURE.md#m6-a](ARCHITECTURE.md#m6-a-safety-compliance--backend--web), [ARCHITECTURE.md#m6-b](ARCHITECTURE.md#m6-b-safety-compliance--mobile)

### M5 — GPS tracking (April 2026)
Background location tracking: `expo-task-manager` + `expo-sqlite` offline queue; foreground service notification на Android, background mode на iOS; advisory geofence (consecutive-2 transitions, **не** auto-pause); server trust client `insideGeofence`. Backend ingest batch≤100 с partial-reject (FUTURE/STALE timestamps); audit `shift.geofence_{exit,entry}` на server-side transition detection. Web map: `LiveCranesLayer` 30s polling + `ShiftPathLayer` polyline + `ShiftDrawer` mini-map. Schema migration 0011, ADR 0007. Backend (M5-a) + mobile (M5-b) + web (M5-c). → [ARCHITECTURE.md#m5-a](ARCHITECTURE.md#m5-a-gps-tracking--backend), [ARCHITECTURE.md#m5-b](ARCHITECTURE.md#m5-b-gps-tracking--mobile), [ARCHITECTURE.md#m5-c](ARCHITECTURE.md#m5-c-gps-tracking--web)

### M4 — Shifts (April 2026)
Shift state machine (active/paused/ended; partial UNIQUE shifts_active_per_operator_idx — DB-level guarantee; canWork 3-gate reused для start). Pause — advisory, не hard-lock (rationale: better suboptimal time accounting чем missed work). Mobile nested stack `(tabs)/shifts/` + active card timer (client-tick 1s + 30s polling reconcile). Web — site-drawer SiteActiveShifts section. Real-time через polling, **не** WebSocket. Schema migration 0010, ADR 0006. → [ARCHITECTURE.md#m4](ARCHITECTURE.md#m4-shifts)

### M3 — Mobile license upload (April 2026)
Three-phase orchestration mirrors web B3-UI-4: presigned PUT URL → `expo-file-system/legacy.createUploadTask` (RN fetch не supports upload progress) → confirm. ActionSheet picker (camera/gallery/PDF) + permission flow (request + Alert→Linking.openSettings on denial) + client-side compression (`expo-image-manipulator` resize 1600px JPEG 0.8). DateTimePicker inline iOS / modal Android. → [ARCHITECTURE.md#m3](ARCHITECTURE.md#m3-mobile-license-upload)

### M2 — Mobile /me screen (April 2026)
Operator landing: canWork + identity + license + memberships summary. **Shared types hoist** в `@jumix/shared` (`MeStatusResponse`, `pluralRu`, format helpers) — single source of truth для web + mobile. UI primitives (Avatar/Badge/Card/EmptyState/Skeleton) StyleSheet — НЕ NativeWind. Tone palette success/warning/danger/neutral, **никогда не brand**. Nested `/memberships` stack с detail screen (timeline + rejection card surfaced только когда rejected). → [ARCHITECTURE.md#m2](ARCHITECTURE.md#m2-mobile-me-screen)

---

## 8. Полный индекс вертикалей

> Хронологический список всех завершённых вертикалей. Детали — в [ARCHITECTURE.md](ARCHITECTURE.md) под соответствующими anchor'ами.

### Backend MVP (Этап 1)
- B1 — initial scaffold, auth foundation, RBAC → [ARCHITECTURE.md#b1](ARCHITECTURE.md#b1-backend-foundation)
- B2a — organizations + crane-profiles → [ARCHITECTURE.md#b2a](ARCHITECTURE.md#b2a-organizations--crane-profiles)
- B2b — approval workflows + organization-operator → [ARCHITECTURE.md#b2b](ARCHITECTURE.md#b2b-approval-workflows)
- B2c — cranes + sites → [ARCHITECTURE.md#b2c](ARCHITECTURE.md#b2c-cranes--sites)
- B2d — license lifecycle (4 slices) → [ARCHITECTURE.md#b2d](ARCHITECTURE.md#b2d-license-lifecycle)

### Web MVP (Этап 1, продолжение)
- B3-UI-1 — Next.js foundation (rule #16, evergreen — preserved в этом файле) → [ARCHITECTURE.md#b3-ui-1](ARCHITECTURE.md#b3-ui-1-web-foundation)
- B3-UI-2a — superadmin shell → [ARCHITECTURE.md#b3-ui-2a](ARCHITECTURE.md#b3-ui-2a-superadmin-shell)
- B3-UI-2b — approval queues UX (rule #17, evergreen) → [ARCHITECTURE.md#b3-ui-2b](ARCHITECTURE.md#b3-ui-2b-approval-queues)
- B3-UI-2c — global list pages (rule #18, evergreen) → [ARCHITECTURE.md#b3-ui-2c](ARCHITECTURE.md#b3-ui-2c-global-list-pages)
- B3-UI-2d — dashboard audit-feed + Cmd+K palette → [ARCHITECTURE.md#b3-ui-2d](ARCHITECTURE.md#b3-ui-2d-dashboard--command-palette)
- B3-UI-3a — owner cabinet foundation (sites + map) → [ARCHITECTURE.md#b3-ui-3a](ARCHITECTURE.md#b3-ui-3a-owner-cabinet-foundation)
- B3-UI-3b — owner cranes + cross-role approval → [ARCHITECTURE.md#b3-ui-3b](ARCHITECTURE.md#b3-ui-3b-owner-cranes)
- B3-UI-3c — owner hires + operators management → [ARCHITECTURE.md#b3-ui-3c](ARCHITECTURE.md#b3-ui-3c-owner-hires)
- B3-UI-4 — operator web cabinet → [ARCHITECTURE.md#b3-ui-4](ARCHITECTURE.md#b3-ui-4-operator-web-cabinet)
- B3-UI-5 — polish + deploy infrastructure (3 slices) → [ARCHITECTURE.md#b3-ui-5](ARCHITECTURE.md#b3-ui-5-deploy-infrastructure--polish)
- B3-LANDING — public marketing landing → [ARCHITECTURE.md#b3-landing](ARCHITECTURE.md#b3-landing-public-marketing-landing)

### Mobile MVP (Этап 2)
- M1 — Expo foundation + auth → [ARCHITECTURE.md#m1](ARCHITECTURE.md#m1-mobile-foundation)
- M2 — /me screen → [ARCHITECTURE.md#m2](ARCHITECTURE.md#m2-mobile-me-screen)
- M3 — license upload → [ARCHITECTURE.md#m3](ARCHITECTURE.md#m3-mobile-license-upload)
- M4 — shifts → [ARCHITECTURE.md#m4](ARCHITECTURE.md#m4-shifts)
- M5-a — GPS tracking backend → [ARCHITECTURE.md#m5-a](ARCHITECTURE.md#m5-a-gps-tracking--backend)
- M5-b — GPS tracking mobile → [ARCHITECTURE.md#m5-b](ARCHITECTURE.md#m5-b-gps-tracking--mobile)
- M5-c — GPS tracking web → [ARCHITECTURE.md#m5-c](ARCHITECTURE.md#m5-c-gps-tracking--web)
- M6-a — safety compliance backend + web → [ARCHITECTURE.md#m6-a](ARCHITECTURE.md#m6-a-safety-compliance--backend--web)
- M6-b — safety compliance mobile → [ARCHITECTURE.md#m6-b](ARCHITECTURE.md#m6-b-safety-compliance--mobile)

### Pending
- M7 — push notifications (Этап 2)
- M8 — store submissions (Этап 2)
- Этап 3 — finance + analytics (требует спеку начислений от заказчика)
- Этап 4 — ratings + launch

---

## 9. Evergreen patterns (web + mobile foundation)

> Эти три pattern-блока ссылаются на rule #16-18 в исторической нумерации. Они описывают always-relevant архитектурные решения web слоя — оставлены здесь для удобства, не дублируются в ARCHITECTURE.md.

16. **Web app (`apps/web/`) — Next.js 15 + Tailwind v4 + framer-motion.** Stack: App Router, React 19, Turbopack (dev на :3001), Tailwind v4 (`@theme inline` в `globals.css`, **нет** `tailwind.config.ts`), Zustand persist для auth-state, TanStack Query v5 для server-state, Radix primitives + cmdk + sonner. Auth-токены на MVP — **localStorage** (миграция на HttpOnly cookies в backlog `Web cookie mode`); persist key `jumix-auth`. Refresh — **single-flight** через module-level `refreshingPromise` в `lib/auth-store.ts` (защита от race при параллельных 401). Все login endpoints передают `clientKind: 'web'` в body → backend выдаёт TTL 30 дней (vs 90 mobile). API-client (`lib/api/client.ts`) — единая `apiFetch<T>` с registered hooks (`getAccessToken/refresh/onUnauthorized`) для развязки от store. Motion-слой — **framer-motion** везде, spring physics дефолт `{stiffness: 300, damping: 28}`, обёртки `<PageTransition>/<StaggerList>/<FadeSwap>/<NumberCounter>`. **Запрещено:** `transition-all`, `animate-bounce/pulse/spin`, scale > 1.05 на hover, spinner вместо skeleton. **Mobile-first responsive:** все компоненты пишутся для phone сначала (44px touch targets через `min-h-[44px] md:min-h-0 md:h-9`), sidebar → drawer на `<md` (Radix Dialog с auto-close на pathname change), полноэкранные модалки на phone. Manual smoke на 375/768/1024/1440 перед коммитом UI-изменений. Route-groups: `(auth)/` — public с redirect-if-authed, `(app)/` — guarded с hydration wait + `/login` redirect. i18n — собственный минимальный `t()` (lib/i18n.ts), JSON в `messages/*.json`, RU полный + KZ placeholder; `next-intl` НЕ используется (overkill для одной локали в MVP). RSC vs Client — почти всё `'use client'` (auth-state в Zustand + framer-motion + react-hook-form требуют client). Tests — Vitest + jsdom + Testing Library, моки `matchMedia/scrollIntoView/ResizeObserver` в `tests/setup.ts`, mock `next/navigation` + `vi.mocked()` для типизированных API-моков. Детали — [web-architecture.md](docs/architecture/web-architecture.md).

17. **Approval queues UX (pipelines 1+2+3 reconciliation surface).** Единая страница `/approvals` для superadmin с `TabsPills` (crane-profiles / hires / cranes), URL-sync через `?tab=<value>` (инвалидные значения — `router.replace` на дефолтный tab, не push). Badge counts берутся из уже активного `useDashboardStats()` cache (`stats.data?.pending.{craneProfiles,hires,cranes}`) — без дополнительных запросов. Approve — **optimistic update** в cached list (`setQueryData` flips `approvalStatus` → row исчезает из pending-фильтра), `onError` откатывает snapshot, `onSettled` инвалидирует entity-queries + dashboard stats; success — `toast.success`. Reject — модалка `RejectDialog` (shared для всех трёх entity-типов) с обязательным `reason` (trim > 0, max 500 chars, char-counter, `autoFocus` на textarea), submit disabled на пустом trim; ошибки всплывают через `toast.error(description: isAppError(err) ? err.message : fallback)`. Состояния queue-компонентов: loading → `QueueSkeleton`, error → `QueueError` (danger icon + retry button → `refetch`), empty → `EmptyQueue`. Row-компоненты mobile-first: column на phone с full-width buttons, row на md+. Тесты через `createQueryWrapper()` helper — **НЕ** выставлять `gcTime: 0` (ломает rollback assertions после invalidate).

18. **Global list pages (B3-UI-2c pattern).** Superadmin-only страницы: `/organizations`, `/crane-profiles`, `/cranes`, `/organization-operators` (+ owner-only `/sites`, `/my-cranes`, `/my-operators`, `/incidents` повторяют тот же pattern). **URL-state:** все фильтры (search/approval/status/type/org) и drawer open state (`?open=<id>`) синхронизированы через `useSearchParams` + `router.replace('?...', { scroll: false })` — **replace, не push**, чтобы не засорять history. Инвалидные значения тихо игнорируются (фильтр = null). **DataTable** (`components/ui/data-table.tsx`) — общий responsive primitive: desktop `<table>` с orange hover-bar (левая 2px полоска, единственное использование brand-500 в строке), mobile `<button>` cards с title/subtitle + inline `dl` колонок (showOnMobile=false для timestamps). Infinite loading через `useXxxInfinite({ limit: 20 })` → `fetchNextPage` + кнопка «Загрузить ещё». **FilterBar/FilterChip/SearchInput/Combobox** (`components/ui/*`): SearchInput debounce 300ms, Chip active = brand-500 border+text + отдельный X-clear, Combobox async-mode через `onSearchChange`. Row click → `setParam('open', id)`. **Client-side filter на computed-fields** (license_status, crane.type) — server не фильтрует, делаем `all.filter()` на загруженной странице (backlog: serverside license filter). **Cross-drawer navigation** через callback на parent → меняет `?open` → `?openProfile`. **Drawer-компоненты** (`components/drawers/*`) используют shared `DetailRow` helper (label/value с mono-option). Approval-gated drawers рендерят Approve/Reject только для `approvalStatus === 'pending'`. Owner+role-aware footer actions (B3-UI-3b/3c). Тесты — `createQueryWrapper()`, моки API-модулей + `sonner` + `next/navigation` (searchParams через `vi.fn<(k: string) => string | null>()`).

---

## 10. Ссылки и ресурсы

**Документы заказчика:**
- `/docs/contract/ТЕХНИЧЕСКОЕ_ЗАДАНИЕ.docx` — readonly
- `/docs/contract/Договор.docx` — readonly

**Внешние сервисы (доступы управляются заказчиком):**
- Mobizon SMS: https://mobizon.kz
- Firebase (FCM): Firebase console (аккаунт заказчика)
- Apple Developer: App Store Connect (аккаунт заказчика)
- Google Play Console: (аккаунт заказчика)
- Hosting: Hetzner / Cloud.kz
- Monitoring: Uptime Kuma (self-hosted)

**Внутренняя документация:**
- `/ARCHITECTURE.md` — историческая детализация по вертикалям
- `/docs/architecture/` — архитектура подсистем (см. Index выше §2)
- `/docs/runbooks/` — runbook'и на падения, восстановление, деплой
- `/docs/api/` — экспортированная OpenAPI спека для заказчика
- `/README.md` — setup, deploy, onboarding
- `/docs/USER_GUIDE.ru.md` — клиентский guide для superadmin'а

---

**End of CLAUDE.md**

Этот документ — индекс и критичные инварианты. Историческая детализация — в `ARCHITECTURE.md`. Архитектура подсистем — в `docs/architecture/*.md`. Все расхождения — обсуждать, не игнорировать.
