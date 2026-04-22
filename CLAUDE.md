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
| Mobile app | [mobile-app.md](docs/architecture/mobile-app.md) | UX для крановщика, экраны, GPS, push, offline |
| Infrastructure | [infrastructure.md](docs/architecture/infrastructure.md) | docker-compose, healthchecks, backup, monitoring, secrets |
| CI/CD | [cicd.md](docs/architecture/cicd.md) | Pipelines (PR/main/tag), миграции, rolling deploy |
| Backlog | [backlog.md](docs/architecture/backlog.md) | Отложенные задачи (post-MVP, блокеры заказчика) |
| ADRs | [adr/](docs/architecture/adr/) | Architectural decision records (см. [0002 holding-approval model](docs/architecture/adr/0002-holding-approval-model.md) — почему cranes идут через approve/reject холдингом) |

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
