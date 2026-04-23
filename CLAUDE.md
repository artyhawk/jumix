# CLAUDE.md — Jumix Platform

> Индекс + критичные правила для Claude Code. Детальная архитектура — в [docs/architecture/](docs/architecture/).
> Версия: 2.0 | Дата: апрель 2026 | Проект: Jumix (платформа управления крановщиками)

---

## 0. Как Claude Code должен работать с этим документом

**Читать целиком перед любой задачей.** Этот документ — индекс и критичные правила. Детальная архитектура вынесена в `docs/architecture/*.md` — их читай по мере необходимости для текущей задачи (не все подряд).

**Если задача противоречит этому документу** — сначала спросить, не обновлять CLAUDE.md или detail docs молча.

**Если задача не покрыта документацией** — применить принципы из §3 (Decision framework) и предложить решение, не делать молча.

**Приоритет источников:**
1. Явная инструкция пользователя в текущем сообщении
2. CLAUDE.md (этот файл)
3. `docs/architecture/*.md` — детальные spec'и
4. Документы заказчика: `/docs/contract/ТЕХНИЧЕСКОЕ_ЗАДАНИЕ.docx`, `/docs/contract/Договор.docx`
5. Общие best practices

---

## 1. О проекте

SaaS-платформа для компаний Казахстана, сдающих в аренду башенные краны и предоставляющих крановщиков на стройки. Три клиента: веб-портал (Next.js, суперадмин/владелец/ограниченный operator), мобилка (Expo, крановщики — смены/GPS/СИЗ), API (Fastify) + Worker (BullMQ).

**Роли:** `superadmin` (вся платформа, без финансов компаний) · `owner` (своя организация) · `operator` (свои данные). См. [docs/architecture/authorization.md](docs/architecture/authorization.md).

**Заказчик:** ТОО «Telse», Шымкент. Исполнитель: ИП «Yerbol». Договор №T35.5/26 от 17.04.2026. Срок MVP: 5 месяцев. Полный контекст — [docs/architecture/project-overview.md](docs/architecture/project-overview.md).

---

## 2. Index — куда идти за деталями

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
| ADRs | [adr/](docs/architecture/adr/) | Architectural decision records: [0002 holding-approval](docs/architecture/adr/0002-holding-approval-model.md) (cranes approve/reject), [0003 operators multi-org](docs/architecture/adr/0003-operators-multi-org-model.md) (identity ⊥ hire), [0004 public registration](docs/architecture/adr/0004-public-registration-flow.md) (SMS signup), [0005 license flow](docs/architecture/adr/0005-license-document-flow.md) (document + expiry cron) |

**Правило чтения:** под задачу открывай 1-2 файла максимум. Не грузи всё подряд — контекст-окно не резиновое.

**Cross-references в коде:** комментарии типа `CLAUDE.md §4.2` ссылаются на секцию в соответствующем detail-файле (нумерация §X.Y сохранена — §4 → authorization.md, §6.3 → database.md §6.3, §7.1 → business-logic.md §7.1, и т.д.).

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

### Этап 1 (2 месяца): Веб-портал + инфраструктура

**Сентябрь — Октябрь** (условно, от первого платежа)

- [ ] Монорепа, конфиги, CI skeleton
- [ ] Docker dev environment
- [ ] БД: миграции, базовые таблицы
- [ ] Auth: SMS + password, JWT, refresh rotation
- [ ] RBAC: policies, repositories, middleware
- [ ] Веб: 3 кабинета (superadmin / owner / operator)
- [ ] CRUD: organizations, sites, cranes, operators
- [ ] Загрузка документов (MinIO), статус удостоверений
- [ ] i18n RU / KZ
- [ ] Dev-аккаунты Apple/Google (открывает заказчик)
- [ ] Staging развёрнут, CI/CD работает

### Этап 2 (1 месяц): Мобильное приложение + смены

**Ноябрь**

- [ ] Expo проект, navigation, auth flow
- [ ] Экраны: login, home, shifts, profile, balance
- [ ] GPS-фиксация старт/конец смены
- [ ] Геозона: расчёт is_on_site
- [ ] Подтверждение СИЗ с фото
- [ ] Сообщение о неисправности
- [ ] Веб: назначения крановщиков, условия оплаты
- [ ] Веб: live-карта смен, журнал СИЗ, неисправности
- [ ] State machine статусов операторов

### Этап 3 (1 месяц): Финансы + аналитика

**Декабрь**

- [ ] **ПОЛУЧИТЬ от заказчика спеку начислений** (в первую неделю этапа)
- [ ] **Написать unit-тесты** по спеке до кода, подписать с заказчиком
- [ ] Payroll engine: реализация по спеке
- [ ] Табель (автосбор из shifts)
- [ ] Экспорт PDF / Excel
- [ ] Замены: запросы от крановщиков, обработка владельцем
- [ ] Push-уведомления о погоде
- [ ] Аналитика: dashboard с KPI, статистика по объектам/крановщикам
- [ ] Мобилка: баланс, история смен

### Этап 4 (1 месяц): Рейтинги + запуск

**Январь**

- [ ] Рейтинги операторов (5 звёзд + критерии)
- [ ] Рейтинг организаций
- [ ] База «Добросовестные / Недобросовестные»
- [ ] Биржа крановщиков (opt-in, marketplace DTO, contact requests)
- [ ] Push через FCM (полная реализация)
- [ ] Центр уведомлений
- [ ] Финальное тестирование
- [ ] Публикация в App Store + Google Play
- [ ] Документация для заказчика
- [ ] Подписание актов

### Пост-сдача (60 дней гарантия)

- Обработка баг-репортов
- Мелкие правки
- Мониторинг стабильности

---

## 5. Конвенции кода

### 5.1 TypeScript

- `strict: true` в tsconfig
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

## 6. Критичные правила для Claude Code

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

16. **Web app (`apps/web/`) — Next.js 15 + Tailwind v4 + framer-motion.** Stack: App Router, React 19, Turbopack (dev на :3001), Tailwind v4 (`@theme inline` в `globals.css`, **нет** `tailwind.config.ts`), Zustand persist для auth-state, TanStack Query v5 для server-state, Radix primitives + cmdk + sonner. Auth-токены на MVP — **localStorage** (миграция на HttpOnly cookies в backlog `Web cookie mode`); persist key `jumix-auth`. Refresh — **single-flight** через module-level `refreshingPromise` в `lib/auth-store.ts` (защита от race при параллельных 401). Все login endpoints передают `clientKind: 'web'` в body → backend выдаёт TTL 30 дней (vs 90 mobile). API-client (`lib/api/client.ts`) — единая `apiFetch<T>` с registered hooks (`getAccessToken/refresh/onUnauthorized`) для развязки от store. Motion-слой — **framer-motion** везде, spring physics дефолт `{stiffness: 300, damping: 28}`, обёртки `<PageTransition>/<StaggerList>/<FadeSwap>/<NumberCounter>`. **Запрещено:** `transition-all`, `animate-bounce/pulse/spin`, scale > 1.05 на hover, spinner вместо skeleton. **Mobile-first responsive:** все компоненты пишутся для phone сначала (44px touch targets через `min-h-[44px] md:min-h-0 md:h-9`), sidebar → drawer на `<md` (Radix Dialog с auto-close на pathname change), полноэкранные модалки на phone. Manual smoke на 375/768/1024/1440 перед коммитом UI-изменений. Route-groups: `(auth)/` — public с redirect-if-authed, `(app)/` — guarded с hydration wait + `/login` redirect. i18n — собственный минимальный `t()` (lib/i18n.ts), JSON в `messages/*.json`, RU полный + KZ placeholder; `next-intl` НЕ используется (overkill для одной локали в MVP). RSC vs Client — почти всё `'use client'` (auth-state в Zustand + framer-motion + react-hook-form требуют client). Tests — Vitest + jsdom + Testing Library, моки `matchMedia/scrollIntoView/ResizeObserver` в `tests/setup.ts`, mock `next/navigation` + `vi.mocked()` для типизированных API-моков. Детали — [web-architecture.md](docs/architecture/web-architecture.md).

17. **Approval queues UX (pipelines 1+2 reconciliation surface).** Единая страница `/approvals` для superadmin с `TabsPills` (crane-profiles / hires / cranes), URL-sync через `?tab=<value>` (инвалидные значения — `router.replace` на дефолтный tab, не push). Badge counts берутся из уже активного `useDashboardStats()` cache (`stats.data?.pending.{craneProfiles,hires,cranes}`) — без дополнительных запросов. Approve — **optimistic update** в cached list (`setQueryData` flips `approvalStatus` → row исчезает из pending-фильтра), `onError` откатывает snapshot, `onSettled` инвалидирует entity-queries + dashboard stats; success — `toast.success`. Reject — модалка `RejectDialog` (shared для всех трёх entity-типов) с обязательным `reason` (trim > 0, max 500 chars, char-counter, `autoFocus` на textarea), submit disabled на пустом trim; ошибки всплывают через `toast.error(description: isAppError(err) ? err.message : fallback)`. Состояния queue-компонентов: loading → `QueueSkeleton` (3 placeholder rows с avatar + 2 lines + 2 button skeletons), error → `QueueError` (danger icon + retry button → `refetch`), empty → `EmptyQueue` (success icon + explanatory text). Row-компоненты mobile-first: column на phone с full-width buttons, row на md+. Hire row показывает FIO → Building2 + orgName (fallback на `organizationId` если нет имени). Crane row использует IconCrane из @tabler/icons-react. Metadata-строка включает `formatRelativeTime(createdAt)` («N дн назад»). Тесты через `createQueryWrapper()` helper — **НЕ** выставлять `gcTime: 0` (ломает rollback assertions после invalidate).

18. **Global list pages (B3-UI-2c).** Superadmin-only страницы: `/organizations`, `/crane-profiles`, `/cranes`, `/organization-operators`. **URL-state:** все фильтры (search/approval/status/type/org) и drawer open state (`?open=<id>`) синхронизированы через `useSearchParams` + `router.replace('?...', { scroll: false })` — **replace, не push**, чтобы не засорять history. Инвалидные значения тихо игнорируются (фильтр = null). **DataTable** (`components/ui/data-table.tsx`) — общий responsive primitive: desktop `<table>` с orange hover-bar (левая 2px полоска, единственное использование brand-500 в строке), mobile `<button>` cards с title/subtitle + inline `dl` колонок (showOnMobile=false для timestamps). Infinite loading через `useXxxInfinite({ limit: 20 })` → `fetchNextPage` + кнопка «Загрузить ещё». **FilterBar/FilterChip/SearchInput/Combobox** (`components/ui/*`): SearchInput debounce 300ms, Chip active = brand-500 border+text + отдельный X-clear, Combobox async-mode через `onSearchChange` (для org-lookup). Row click → `setParam('open', id)`. **Client-side filter на license_status + crane.type** — server не фильтрует по computed-fields, делаем `all.filter()` на загруженной странице (backlog: serverside license filter). **Cross-drawer navigation:** hire-drawer → crane-profile-drawer через `onOpenCraneProfile(id)` callback → родительская страница меняет `?open` → `?openProfile`. **CreateOrganizationDialog** (`components/organizations/*`) — react-hook-form + zod + `@jumix/shared` validators (`isValidKzBin`/`isValidKzPhone`), Controller-wrapped phone fields применяют `applyPhoneMask` на каждый onChange, submit нормализует в E.164 через `toE164`. **Drawer-компоненты** (`components/drawers/*`) используют shared `DetailRow` helper (label/value с mono-option). Approval-gated drawers (crane-profile/crane/hire) рендерят Approve/Reject только для `approvalStatus === 'pending'`, иначе footer скрыт. Тесты мокают все четыре API-модуля (`crane-profiles`, `cranes`, `organization-operators`, `organizations`) + `sonner` + `next/navigation` (searchParams через `vi.fn<(k: string) => string | null>()`), используют `createQueryWrapper()`.

25. **Mobile app foundation (M1).** Первая вертикаль Этапа 2. `apps/mobile/` — Expo SDK 52 + React Native 0.76 + React 18 (pin'нут consistent peer-deps; когда Expo 53/55 стабилизируется с React 19 — upgrade в отдельной миграции, backlog). **Стек:** Expo Router 4 (file-based routing parallel к Next.js App Router) / Zustand 5 (auth state) / TanStack Query 5 (server state — same library что web, shared query patterns в M2+) / expo-secure-store (iOS Keychain + Android EncryptedSharedPreferences hardware-encrypted) / burnt (native platform toasts) / libphonenumber-js (reused через `@jumix/shared.normalizePhone`). **Monorepo integration:** `metro.config.js` resolver.nodeModulesPaths + watchFolders для workspace — Metro видит `@jumix/shared` symlinks; `disableHierarchicalLookup` предотвращает duplicate React modules (важно для RN). **Design system:** `theme/tokens.ts` + `theme/typography.ts` (StyleSheet presets) — НЕ NativeWind (avoid build complexity, StyleSheet performant). Tokens зеркалят web design-system §8 (dark theme primary, brand-500 orange sparse usage, ≥44pt touch targets, semantic success/danger/warning). **File-based routing:** `app/(auth)/` группа (login/verify-otp/register, redirect на /(tabs)/me если user set) + `app/(tabs)/` группа (me/license/shifts placeholders, redirect на /(auth)/login если нет user'а) + `app/+not-found.tsx` + root `app/_layout.tsx` (hydration gate + QueryClientProvider + SafeAreaProvider + GestureHandlerRootView). **Auth store:** access token — memory only (rotation short TTL ~15min); refresh token + user JSON — SecureStore (user cached чтобы восстановить identity после cold start без /me round-trip). Cold start: `hydrate()` читает refresh + user → `POST /auth/refresh` с `clientKind:'mobile'` (90-day TTL backend behavior) → populates state OR clears. SplashScreen component показан пока `!isHydrated`. **API client** mirrors web apiFetch pattern: auth header injection, 401 → single-flight refresh promise → retry original. `EXPO_PUBLIC_API_URL` env. `ApiError` class (code/message/status) + `NetworkError` отдельный (fetch TypeError → offline) для toast UX. **Backend endpoints used:** `/auth/sms/{request,verify}` (login, existing) + `/auth/refresh` + `/auth/logout` + `/api/v1/registration/{start,verify}` (public registration ADR 0004). **UI primitives:** Button (primary/secondary/ghost/danger × md/lg), Input (label + error + hint), PhoneInput (`+7` locked prefix + `(XXX) XXX-XX-XX` mask + numeric keyboard + `textContentType='telephoneNumber'` для iOS autofill из контактов), OtpInput (6 separate boxes с auto-advance, `textContentType='oneTimeCode'` iOS + `autoComplete='sms-otp'` Android, paste-detection в первой клетке для SMS autofill), SafeArea wrapper. **Registration flow** (ADR 0004): identity step (ФИО + ИИН + phone) → `/registration/start` (OTP sent) → OTP step → `/registration/verify` с identity + OTP → user + crane_profile (pending) + token pair → auto-login. **Testing:** vitest + jsdom + react-native-web alias (RN primitives → HTML) — approximation для unit tests; real device QA обязателен (documented caveat). Mocks в `tests/setup.ts`: `expo-secure-store` (in-memory Map), `expo-router` (no-op router/Stack/Tabs), `burnt`, `expo-status-bar`, `expo-splash-screen`, `react-native-safe-area-context`, `globalThis.fetch`. **49 тестов в M1** (auth store 10 + API client 10 + phone validation 12 + OTP input 6 + Button 5 + LoginScreen 6). React 18.3.1 + react-dom 18.3.1 explicitly installed в mobile devDeps для vitest рендеринга (pnpm hoisting resolved react-dom@19 иначе — mismatch с react 18 crashes react-dom-client). **Не в scope M1:** full `/me` UI (M2), license upload (M3), shifts (M4-M5), push (M7), store builds (M8).

24. **Deploy infrastructure + polish (B3-UI-5).** Production-ready stack без mobile. **Slice 5a (polish):** `EmptyState` primitive (blurred radial glow + icon + title + description + action, tone neutral/success/danger) — унифицирует 10+ ad-hoc empty states. `ErrorBoundary` (components/error-boundary.tsx) — shared для Next.js error.tsx files (app/error.tsx root + app/(app)/error.tsx group), semantic danger icon + digest ID + reset, useEffect hook prepared для Sentry forward. `LicenseStatusBadge` enriched variant (expiresAt → «Действует · до 12 апр 2027» / «Истекает · через 14 дней» / «Просрочено · 3 дня назад») — используется в drawers. `useDensity` hook (`useSyncExternalStore` + localStorage + cross-tab sync через `storage` event, SSR-safe) → DataTable respects global preference, `DensityToggle` в Topbar (desktop only). Organization archive endpoint (`POST /:id/archive` service+route+4 tests) + `EditOrganizationDialog` (react-hook-form + zod, isDirty gate) + extended OrganizationDrawer footer superadmin-only 3-actions ([Редактировать][Архивировать]+[Приостановить/Активировать], archive — inline confirmation `danger` variant). `jest-axe` baseline test scans primitives (Button/Badge/Input/EmptyState/Card/Avatar/LicenseStatusBadge) — zero violations. Date helpers `formatRuDate` + `daysUntil` в lib/format/date.ts. **Slice 5b (deploy infrastructure):** Docker prod stack (postgres/redis/minio/api/web/nginx) в `infra/docker/docker-compose.prod.yml` с persistent volumes на `/var/lib/jumix/*`, no host port exposure кроме nginx:80 (SSL termination на хостовом reverse proxy — Caddy/certbot). `apps/api/Dockerfile` multi-stage Node22 alpine non-root user tsx runtime (монорепа packages/* шарятся source tree — без JS compile step). `apps/web/Dockerfile` Next.js standalone output (`next.config.ts output: 'standalone'`, ~150MB final). `infra/nginx/nginx.conf` — / → web, /api/ → api, /health(ready) passthrough access_log off, `/tiles/` → static с `Accept-Ranges: bytes` для pmtiles Range requests, `client_max_body_size 12M` (license upload + margin), security headers baseline. `.env.prod.example` полностью документирован (postgres/minio secrets, JWT_SECRET, SMS gateway, SENTRY_DSN optional, PUBLIC_API_URL, PUBLIC_TILES_URL). `.gitignore`: `!.env.prod.example` exception. `infra/scripts/backup-db.sh` — `pg_dump` через `docker compose exec`, 7-day rotation, cron-friendly; `restore-db.sh` — explicit 'restore' confirmation + drop/recreate db. **Production pmtiles:** pmtiles npm package + `components/map/register-pmtiles.ts` idempotent protocol registration (on base-map.tsx module load). `map-style.ts` env-gated — `NEXT_PUBLIC_TILES_URL` → `pmtiles://<url>` source (self-hosted .pmtiles через Range requests); пусто → fallback на публичный api.protomaps.com demo. env.ts: `NEXT_PUBLIC_TILES_URL` optional schema. Docs: `docs/runbooks/deploy.md` (VPS setup + secrets + pmtiles download ~500MB KZ region + первый superadmin CLI + SSL варианты + backup cron + monitoring + troubleshooting). **Slice 5c (onboarding):** `packages/db/scripts/create-superadmin.ts` — CLI с `--phone --name --password` args, argon2id hash, insert, 23505 dupe detection. Script entry `pnpm --filter @jumix/db admin:create-superadmin`. `packages/db/scripts/seed-demo.ts` — realistic demo data (3 orgs Алматы/Астана/Шымкент, superadmin+3 owners+15 operators, 12 crane_profiles mix approval, 15 cranes, 8 sites с геозонами, ~10 hire records mix statuses), `--clear` flag с safeguard (>5 orgs → refuse без explicit clear). Пароль для всех — `JumixDemo123!`. `README.md` финальный — prerequisites + dev/prod setup + env reference + commands table + docs links. `docs/USER_GUIDE.ru.md` — client-friendly guide для superadmin'а (первый вход, dashboard, approvals workflow 3-tab, organizations CRUD, archive terminal semantic, что делать если... troubleshoot section, безопасность, hotkeys). Не вошло: Sentry SDK install (noop-prepared через DSN env, activate post-MVP); Redis/MinIO health probe enrichment (DB-only сейчас достаточно); off-site backup к Backblaze B2 (manual в MVP).

23. **Operator web cabinet (B3-UI-4).** Minimal surface — operator primarily использует mobile app (смены/GPS/СИЗ/incidents, M1-M8). Web для edge cases: upload license с ноутбука, check approval status, view memberships. **Три страницы:** `/me` (identity + canWork overview + memberships summary), `/license` (dedicated license state + upload flow), `/memberships` (read-only list всех trudoustroystv). **Root redirect** (`app/(app)/page.tsx`) — operator → `/me` (НЕ `/dashboard` — operator не имеет dashboard role-wise; superadmin/owner → /dashboard). **`/me/status` endpoint** extended (B3-UI-4): `profile` теперь full DTO (toPublicDTO + phone + license fields), `memberships[]` обогащён `hiredAt/approvedAt/rejectedAt/terminatedAt/rejectionReason` (flat `organizationName` сохранён для mobile backward-compat), top-level `canWorkReasons: string[]` (empty при canWork=true; иначе — human-readable blocking reasons: «Профиль ожидает одобрения платформой», «Профиль отклонён платформой», «Нет активных трудоустройств», «Удостоверение не загружено», «Срок действия удостоверения истёк»). Service computes reasons после canWork-derivation; порядок — profile → hire → license. **`useMeStatus` query** staleTime 60_000 (operator opens web rarely) — single source-of-truth для всех трёх pages (не N separate fetches). **License upload flow — three-phase backend, single-step UI** (`useUploadLicense` mutation): (1) `POST /me/license/upload-url` → presigned PUT + key; (2) client `fetch(uploadUrl, PUT, body: file)` напрямую к MinIO; (3) `POST /me/license/confirm` {key, expiresAt} → backend HEAD + prefix-match + atomic state update. Errors: client-side content-type check pre-request (LICENSE_CONTENT_TYPE_INVALID), non-OK PUT → LICENSE_UPLOAD_FAILED (keep dialog open), confirm AppError surfaces through message. `onSuccess` invalidates `qk.meStatus` — canWork + licenseStatus re-computed. **FilePicker primitive** (`components/ui/file-picker.tsx`) — drag-drop zone + click fallback через hidden `<input type="file">`, показывает file metadata (name, size, type), inline error, accept filter. Структура: `<div>` wrapper с drag-handlers + `<button>` для click-trigger + optional sibling `<button aria-label="Удалить файл">` (nested buttons запрещены — useSemanticElements lint). Reusable для future uploads (avatar, incidents — backlog). **LicenseUploadDialog** single-step: FilePicker + `<input type="date">` (min tomorrow, max +20 лет — matches backend refine) + agreement text. Client validation: type whitelist jpg/png/pdf, size ≤ 10MB. `fireEvent.change` в тестах вместо `userEvent.upload` для invalid-type проверок (userEvent respects accept attr и не фаерит change event). **`/me` page** — hero + `MeStatusCard` (semantic colors success/danger — НЕ brand orange — canWork indicator critical) + 2-col grid (`MeIdentityCard` + `MeLicenseCard`) + `MeMembershipsSummary` (первые 3 + link). **Identity read-only** в MVP (edit requires re-approval flow — backlog). **`/license` page** — full state card с version badge + expiry formatting («12 апреля 2027 · Через 354 дня») + upload CTA + conditional warning banner (expired=danger, expiring_soon/critical=warning). `?upload=true` URL-state opens dialog (cross-page команда «Загрузить удостоверение» из command palette). **`/memberships` page** — list с `MembershipCard` (button role когда clickable), `MembershipDrawer` с extended details + full rejection reason. Read-only — operator cannot create/terminate/approve. Empty state helpful hint: «Вам нужен владелец организации, который подаст заявку на ваш найм». **Commands+nav:** operator получает nav.me (UserCircle, `/me`) / nav.license (IdCard, `/license`) / nav.memberships (Building2, `/memberships`) / action.upload-license (Upload, → `/license?upload=true`). Sidebar operator nav ВСЕ три links functional (заменили placeholder `/`). **Avatar upload UI, identity edit, phone change, license version history — backlog** (avatar backend endpoint ready с B2d-2a, но cosmetic; identity changes требуют re-approval flow).

22. **Owner hires + operators management (B3-UI-3c).** Третья (и последняя функциональная) вертикаль owner-кабинета. Workflow разделён на две страницы по фазе: `/hire-requests` — **только pending** hires (submit + await approval); `/my-operators` — **только approved** memberships (management после одобрения). Rejected hires скрыты в MVP (backlog — rejected-tab). **Backend** (`organization-operator/`): новый error code `OPERATOR_ALREADY_HIRED` (переименован из `ALREADY_MEMBER`), DTO расширен `craneProfile.licenseStatus` + `licenseExpiresAt` (computed на boundary через `computeLicenseStatus`). `POST /:id/{block,activate,terminate}` — convenience wrappers поверх существующего `changeStatus` (generic `PATCH /:id/status` остаётся для completeness). State machine **operator-status**: `active ↔ blocked`, `active/blocked → terminated` (terminal). `OPERATOR_STATUS_TRANSITIONS: Record<OperatorStatus, ReadonlySet<OperatorStatus>>` — terminated set пустой; попытка revert → 409 `INVALID_STATUS_TRANSITION`. Restart увольнённого — через НОВЫЙ hire-request (softDelete hire освобождает UNIQUE-slot, identity на crane_profile persists). Owner-dashboard stats без изменений — `active.memberships` уже подходит для «Активные операторы» card. **Web mutations:** `useCreateHireRequest` / `useBlockOrganizationOperator` (принимает `{id, reason?}`) / `useActivateOrganizationOperator` / `useTerminateOrganizationOperator` — optimistic status-flip через shared `buildOptimisticStatusMutation` helper, rollback snapshot на error. Block-mutation handles optional reason inline (одинаковый rollback-паттерн). **CreateHireRequestDialog** two-step (pattern из CreateSiteDialog): step 1 — `SearchInput` debounce 300ms, min 2 chars UI-gate, `useCraneProfiles({approvalStatus:'approved', search})`, `ProfileSearchResult` radio-card (border brand-500 на selected, 44px touch); step 2 — summary + license warning banner (`missing`/`expired` — informational, НЕ блокирует submit, реальный work-gate через `canWork` rule #15) + `<input type="date">` hiredAt (default today, max +1 год). 409 `OPERATOR_ALREADY_HIRED` → специальный toast «Этот крановщик уже работает в вашей компании». **OrganizationOperatorDrawer footer role+status aware:** superadmin+pending — Approve/Reject (B3-UI-2b); owner+approved+active — [Приостановить][Уволить]; owner+approved+blocked — [Разблокировать][Уволить]; owner+approved+terminated — неактивный notice «Сотрудник уволен»; rejected — read-only rejection reason (owner+superadmin). Block-flow: click «Приостановить» → inline textarea reveal (optional reason, max 300 chars, autoFocus); terminate: inline confirmation (`mode='terminate-confirm'` state flip, НЕ native `confirm()`). `canManage = (isOwner && hire.organizationId === user.organizationId) || isSuperadmin`. **`/hire-requests`** — owner-only, PageHeader с pending count, empty state с CTA, `StaggerList<PendingHireRow>` карточек (click → `?open=<id>`). **`/my-operators`** — standard B3-UI-2c list: FilterBar (search + status), DataTable (Крановщик/ИИН/Удостоверение/Статус/Принят, iin + hiredAt `showOnMobile:false`), infinite scroll, empty state → CTA на `/hire-requests?create=true`. `approvalStatus='approved'` хардкодом (pending — в другой странице). **OwnerDashboard:** placeholder «Операторы на смене» → real `StatCard` «Активные операторы» (`stats.active.memberships`, href=/my-operators). Grid 4 cards, остался один placeholder «Расходы за месяц» (Этап 3). **Commands+nav:** owner получает `nav.hire-requests` (Shield) / `nav.my-operators` (UsersRound) / `action.create-hire-request` (UserPlus, → `/hire-requests?create=true`). Sidebar owner nav ВСЕ links functional (`/hire-requests` + `/my-operators` заменили placeholder `/`). **Audit format registry** — organization_operator.* entries уже существовали с B3-UI-2b (submit/approve/reject/block/activate/terminate/update/delete). **Testing gotcha:** terminate-confirm mutation test flaky в jsdom при оптимистичном update — разделили тест на два: (1) confirmation surface появляется + mutation НЕ вызвана до подтверждения (поведенческий контракт), (2) block/activate purely — optimistic flips через `useMutation` tests. Owner-drawer mutable `mockUser` pattern из B3-UI-3b — `asOwner(orgId)` / `asSuperadmin()` flip. Three pipelines complete: crane_profile → hire → crane — все через superadmin approval.

21. **Owner cranes + cross-role approval workflow (B3-UI-3b).** Вторая вертикаль owner-кабинета: парк кранов + E2E approval workflow (owner creates pending → superadmin approves). **Backend mutations** (ADR 0002 holding-approval, §4.2b): policy `canAssignToSite` / `canResubmit` / `canChangeStatus` требуют `approval_status='approved'` (pending/rejected → 404); `canApprove` / `canReject` — **только superadmin** (owner НЕ одобряет свои же заявки — инвариант холдинга). Service-методы: `assignToSite(ctx, id, siteId)` валидирует same-org + site.status='active' → audit `crane.assign_to_site`; `unassignFromSite` — audit `crane.unassign_from_site`; `resubmit` (rejected→pending, обнуляет `rejectionReason`) — audit `crane.resubmit`. Operational transitions (`activate/maintenance/retire`) — через существующий `changeStatus`. **Routes:** `POST /:id/{assign-site,unassign-site,activate,maintenance,retire,resubmit}`. **Dashboard owner-stats:** `GET /api/v1/dashboard/owner-stats` (owner-only, `dashboardService.getOwnerStats(ctx)` scoped по `ctx.organizationId`) возвращает `{active:{sites,cranes,memberships}, pending:{cranes,hires}}` — отдельный от superadmin'ского `/dashboard/stats`. **Web surface:** `CreateCraneDialog` — одношаговый react-hook-form + zod, required model + capacity (comma-decimal support `5,5 → 5.5`), optional inventoryNumber/boomLengthM/yearManufactured (1900..currentYear), toast `Заявка отправлена на одобрение / Платформа рассмотрит в течение 1–2 дней`. `CraneDrawer` role-aware footer: superadmin pending → Approve/Reject; owner+superadmin rejected → Resubmit; approved+canManage → status transitions (Hammer=maintenance / Power=activate / Trash2=retire / RotateCcw=restore); retire через inline confirmation (`confirmRetire` state flip, не native `confirm()` как у sites). `AssignmentInline` — `Combobox` в теле drawer'а (только approved + status≠retired), `useSites({status:'active', limit:100})` → onChange вызывает assign/unassign + toast. `canManage = (isOwner && same-org) || isSuperadmin`. **`/my-cranes`** — owner-only (non-owner → `router.replace('/')`), FilterBar (search/approval/type/status), URL-state `?search/?approval/?type/?status/?open/?create`, client-side filter по `type` (server не фильтрует по типу на MVP). Backend scopes по ctx.organizationId для owner — `organizationId` в query НЕ передаём. **CranesLayer** — **один маркер на site** с count-badge'ом при N>1 (groups cranes by siteId via Map); skip cranes с null siteId или unknown site; element offset `translate(8px,-8px)` чтобы не перекрывать site-marker; клик → `onCraneClick(first-in-group)` (на MVP без picker'а для группы). Интеграция в `OwnerSitesMap`: `useCranes({approvalStatus:'approved', status:'active', limit:100})` + `<CranesLayer>` поверх `<SitesLayer>`, click → `router.push('/my-cranes?open=<id>')`. **OwnerDashboard stats** — «Краны в работе» продвинут из `StatCardPlaceholder` в real `StatCard` (href=/my-cranes, icon=IconCrane, value=`stats.active.cranes`); source заменён с `useSites({status:'active'}).items.length` на `useOwnerDashboardStats().active.sites` — hero subtitle теперь plural от реального числа активных. Placeholder'ов осталось 2 (Операторы, Расходы — для 3c/финансов). **Commands + nav:** owner получает `nav.my-cranes` (IconCrane, /my-cranes) + `action.create-crane` (Plus, action); execute `'create-crane' → router.push('/my-cranes?create=true')`; sidebar myCranes href переключён с `/` на `/my-cranes`. **Audit format** — registry дополнен `crane.assign_to_site` (Link2, «Кран привязан к объекту»), `crane.unassign_from_site` (Link2Off, «Кран снят с объекта»), `crane.resubmit` (Send, «Заявка отправлена повторно»). **Testing:** CranesLayer тестируется через spy'ный `maplibre-gl.Marker` (capture element → assert count badge + click handler); crane-drawer использует mutable `mockUser` pattern (`asOwner(orgId)` / `asSuperadmin()` flip `mockUser.value`) для per-test роли; owner-dashboard моккает BaseMap/SitesLayer/CranesLayer как no-op (WebGL в jsdom).

20. **Owner cabinet foundation (B3-UI-3a).** Первая вертикаль owner-кабинета: role-aware dashboard + Sites CRUD + MapLibre foundation. **Role-switch на `/dashboard`** — `app/(app)/dashboard/page.tsx` тонкий switch (`superadmin → <SuperadminDashboard/>`, `owner → <OwnerDashboard/>`, `operator → router.replace('/')`); один URL для привилегированных ролей. Root redirect в `app/(app)/page.tsx` — `superadmin||owner → /dashboard`. **OwnerDashboard:** hero `Здравствуйте, ${user.name}` + plural subtitle (SITES_FORMS), stats-grid `grid-cols-2 lg:grid-cols-4` с 1 реальным StatCard (Активные объекты) + 3 `StatCardPlaceholder` (Краны/Крановщики/Финансы) с `"—"` и бейджем «Скоро» — placeholder-паттерн держит grid-shape стабильным при поэтапной доставке 3b/3c. Body `grid-cols-1 lg:grid-cols-[2fr_1fr]`: `OwnerSitesMap` (active-sites, click → `/sites?open=<id>`) + `RecentSitesList` (top-5). **Sites CRUD** (`/sites`) — FilterBar (status), «Новый объект» button (owner-only), URL-state `?status/?open/?create=true` через `router.replace` (не push). **CreateSiteDialog** — двухшаговый wizard: step 1 «Данные» (name required, address trim→undefined), step 2 «Локация» (`MapPicker` onChange → `{latitude,longitude,radiusM}`, «Создать» disabled пока value null), «Назад» без потери form-state. **SiteDrawer** — status-specific footer: active → Сдать+Архивировать, completed → В работу+Архивировать, archived → Восстановить. **MapLibre + Protomaps stack** (`components/map/`): `base-map.tsx` (MapLibre wrapper, `@protomaps/basemaps` dark flavor через `layers('protomaps', namedFlavor('dark'), { lang: 'ru' })` для RU labels где available; glyphs + sprites — protomaps-assets CDN; tile source `api.protomaps.com/tiles/v3` demo-endpoint в MVP, self-hosted pmtiles в production — см. backlog. **Never** inline-style MapLibre без `glyphs` top-level URL — strict Style Spec в maplibre-gl 5.x валит на load c `glyphs: string expected, undefined found`), `sites-layer.tsx` (markers + geofence-polygon, onSiteClick), `map-picker.tsx` (drop-pin + radius 50–1000m slider), `geofence-polygon.ts` (pure Haversine destination → 64-point polygon approximating circle; throws на r≤0; unit-tested ±0.5%), `map-style.ts` (DEFAULT_CENTER `[71.45,51.17]` = Астана). **Status transitions** — backend emits `site.{create,update,activate,complete,archive}` (НЕ `site.suspend` — stale!); переходы: active↔completed (bidir), active→archived, completed→archived, archived→active. Web API (`lib/api/sites.ts`) предоставляет separate endpoints `completeSite/activateSite/archiveSite` (не общий setStatus); `useSites*` hooks invalidate `qk.sites.*` + `qk.dashboard.*`. **Commands + nav:** owner nav активированы `/dashboard + /sites` (others остаются stubs); registry добавляет `nav.owner-dashboard/nav.sites/action.create-site`, execute `'create-site' → router.push('/sites?create=true')` (переиспользуем cross-page URL-state из rule #19). **Testing:** WebGL в jsdom не работает — все map-компоненты мокаются как no-op в тестах (`BaseMap → div`, `SitesLayer → null`, `MapPicker → button stub`); geofence-polygon тестируется pure.

19. **Dashboard audit-feed + Cmd+K палитра (B3-UI-2d).** Dashboard `/dashboard` — `grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4`: левая колонка `OrganizationsOverview` (top-5), правая `RecentActivity` (последние 20 audit-events). **Backend audit-модуль** (`apps/api/src/modules/audit/`): `GET /api/v1/audit/recent?limit=N` (superadmin-only, default 50, max 100), enriched events — left-join `users` (actor) + `organizations`, metadata passthrough, `DESC` by `created_at`; ZodError → 422 `VALIDATION_ERROR` (не 400). **Web audit format registry** (`lib/format/audit.ts`) — central `ACTION_ICONS` + `ACTION_LABELS` (action → {icon, label}), fallback `Clock`/action-as-is. Добавление новой audit-action = одна запись в registry. **Commands system** — declarative registry в `lib/commands/registry.ts`: каждый `CommandEntry` имеет `id` (unique), `label`, `group` ('navigation' | 'actions' | 'system'), `roles`, `href || action` (инвариант), optional `keywords` (для fuzzy search — «одоб» находит «Заявки» через keyword «одобрение»). `getCommandsForRole(role)` — pure function, role-фильтруемый список. `useCommands()` возвращает `{commands, execute}`; `execute(cmd)` маршрутизирует на `router.push(cmd.href)` или на handler по `cmd.action` ('logout' / 'create-organization'). **Command palette** (`components/ui/command-palette.tsx`) — cmdk fuzzy search + framer-motion spring modal (stiffness 340, damping 28), groups через `COMMAND_GROUP_ORDER`, `value={label + ' ' + keywords.join(' ')}` для concat-fuzzy-match, `handleSelect` → `setOpen(false)` + 50ms `setTimeout(execute)` (чтобы modal успел закрыться до navigation). **URL-state cross-page dialog** — команда «Создать организацию» из палитры → `router.push('/organizations?create=true')` → страница читает `params.get('create') === 'true'` и открывает dialog; закрытие — `setParam('create', null)`. Проще чем global Zustand store или lifted state. **jsdom + cmdk caveat:** cmdk Item's onSelect не фаерится через simulated clicks в jsdom — палитровые тесты покрывают UI-surface (render/grouping/role-filter/fuzzy/keyboard toggle), интеграция «select → execute → router.push» — в `use-commands.test.ts` (execute pure function).

---

## 7. Ссылки и ресурсы

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
- `/docs/architecture/` — вся архитектура (см. Index выше §2)
- `/docs/runbooks/` — runbook'и на падения, восстановление, деплой (создаются по ходу)
- `/docs/api/` — экспортированная OpenAPI спека для заказчика

---

**End of CLAUDE.md**

Этот документ — индекс и критичные правила. Детали — в `docs/architecture/*.md`. Все расхождения — обсуждать, не игнорировать.
