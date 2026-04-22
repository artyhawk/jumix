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

20. **Owner cabinet foundation (B3-UI-3a).** Первая вертикаль owner-кабинета: role-aware dashboard + Sites CRUD + MapLibre foundation. **Role-switch на `/dashboard`** — `app/(app)/dashboard/page.tsx` тонкий switch (`superadmin → <SuperadminDashboard/>`, `owner → <OwnerDashboard/>`, `operator → router.replace('/')`); один URL для привилегированных ролей. Root redirect в `app/(app)/page.tsx` — `superadmin||owner → /dashboard`. **OwnerDashboard:** hero `Здравствуйте, ${user.name}` + plural subtitle (SITES_FORMS), stats-grid `grid-cols-2 lg:grid-cols-4` с 1 реальным StatCard (Активные объекты) + 3 `StatCardPlaceholder` (Краны/Крановщики/Финансы) с `"—"` и бейджем «Скоро» — placeholder-паттерн держит grid-shape стабильным при поэтапной доставке 3b/3c. Body `grid-cols-1 lg:grid-cols-[2fr_1fr]`: `OwnerSitesMap` (active-sites, click → `/sites?open=<id>`) + `RecentSitesList` (top-5). **Sites CRUD** (`/sites`) — FilterBar (status), «Новый объект» button (owner-only), URL-state `?status/?open/?create=true` через `router.replace` (не push). **CreateSiteDialog** — двухшаговый wizard: step 1 «Данные» (name required, address trim→undefined), step 2 «Локация» (`MapPicker` onChange → `{latitude,longitude,radiusM}`, «Создать» disabled пока value null), «Назад» без потери form-state. **SiteDrawer** — status-specific footer: active → Сдать+Архивировать, completed → В работу+Архивировать, archived → Восстановить. **MapLibre + CARTO stack** (`components/map/`): `base-map.tsx` (MapLibre wrapper, CARTO Dark raster tiles — no API key в MVP, Protomaps self-hosted в backlog), `sites-layer.tsx` (markers + geofence-polygon, onSiteClick), `map-picker.tsx` (drop-pin + radius 50–1000m slider), `geofence-polygon.ts` (pure Haversine destination → 64-point polygon approximating circle; throws на r≤0; unit-tested ±0.5%), `map-style.ts` (DEFAULT_CENTER `[71.45,51.17]` = Астана). **Status transitions** — backend emits `site.{create,update,activate,complete,archive}` (НЕ `site.suspend` — stale!); переходы: active↔completed (bidir), active→archived, completed→archived, archived→active. Web API (`lib/api/sites.ts`) предоставляет separate endpoints `completeSite/activateSite/archiveSite` (не общий setStatus); `useSites*` hooks invalidate `qk.sites.*` + `qk.dashboard.*`. **Commands + nav:** owner nav активированы `/dashboard + /sites` (others остаются stubs); registry добавляет `nav.owner-dashboard/nav.sites/action.create-site`, execute `'create-site' → router.push('/sites?create=true')` (переиспользуем cross-page URL-state из rule #19). **Testing:** WebGL в jsdom не работает — все map-компоненты мокаются как no-op в тестах (`BaseMap → div`, `SitesLayer → null`, `MapPicker → button stub`); geofence-polygon тестируется pure.

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
