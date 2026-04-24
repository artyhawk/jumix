# ADR-0006: Shift lifecycle + advisory pause + canWork enforcement

- **Дата:** 2026-04-24
- **Статус:** Accepted
- **Автор:** Yerbol
- **Scope:** M4 — первая операционная вертикаль Этапа 2. Moдуль `shifts`
  (backend) + site drawer active-shifts section (web) + nested `/shifts`
  stack (mobile). Foundation для M5 (GPS tracking), M6 (СИЗ/incidents),
  Этапа 3 (payroll engine).

## Контекст

ТЗ §5.2 требует фиксировать рабочие смены крановщика: кто, на каком
кране, на каком объекте, когда начал, когда закончил, с паузами/перерывами.
Оператор управляет жизненным циклом сам (кнопка «Начать смену» в мобилке),
owner видит реал-тайм картинку своей организации.

До M4 работала identity/approval/hire plumbing (ADR 0002–0005) — но
ничего живого над ней не существовало. После ADR 0005 оператор может
быть approved, нанят и с валидным удостоверением — `canWork=true` —
но без shifts-таблицы «работа» не начинается в буквальном смысле.

M4 добавляет:
1. **Схему shifts** с state machine (active / paused / ended).
2. **canWork enforcement на backend** — defense-in-depth поверх UI gate'а.
3. **Eligible-crane logic** — operator может взять только крана из своей
   (approved+active) организации, не в другой живой смене, привязанного
   к active site.
4. **Dashboard semantic change** — `active.cranes` теперь «в работе»,
   а не «в парке».

## Решение

### Schema (migration 0010)

```sql
CREATE TYPE shift_status AS ENUM ('active', 'paused', 'ended');

CREATE TABLE shifts (
  id uuid PRIMARY KEY,
  crane_id uuid NOT NULL REFERENCES cranes(id),
  operator_id uuid NOT NULL REFERENCES users(id),
  crane_profile_id uuid NOT NULL REFERENCES crane_profiles(id),
  organization_id uuid NOT NULL REFERENCES organizations(id),   -- денормализовано
  site_id uuid NOT NULL REFERENCES sites(id),                    -- денормализовано
  status shift_status NOT NULL DEFAULT 'active',
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  paused_at timestamptz,
  total_pause_seconds int NOT NULL DEFAULT 0,
  notes text,
  ...
);
```

**Денормализация** `organization_id` + `site_id`: оба поля доступны
через `cranes` JOIN, но hot-path queries (owner dashboard «кранов в
работе» per-org, site drawer «смены на объекте») избегают JOIN'а.
Consistency (shift.org === crane.org) обеспечивается service layer —
shift создаётся атомарно с crane lookup (single writer).

**Partial UNIQUE index** `shifts_active_per_operator_idx` — один operator
может иметь ровно одну active/paused смену. DB-level защита от race при
spam'е «start» button с клиента. Service-level guard тоже существует;
DB — последняя линия.

**CHECK constraints** state-machine invariants:
- `paused_at` NOT NULL iff `status='paused'`
- `ended_at` NOT NULL iff `status='ended'`
- `total_pause_seconds >= 0`

Страхуют от багов в service layer — невалидный state просто не залетит
в таблицу.

**Shifts НЕ soft-delete'ятся в MVP.** Трудовая история должна оставаться
неизменной. Если понадобится «скрыть» ошибочно созданную запись —
отдельный migration добавит `deleted_at`, но пока rule-of-three не
сработал.

### State machine (advisory pause)

```
null ──start──► active ◄──resume── paused
                  │                   │
                  └──pause────────────┘
                  │                   │
                  └──end──► ended ◄───┘
```

Три состояния: `active`, `paused`, `ended`. `ended` — terminal.

**Pause semantics — advisory, не hard-lock.** Решение против варианта
hard-enforcement (отклонять GPS ping'и / любые mutations во время pause).

Аргументы за advisory:
- На стройке оператор может забыть нажать «Продолжить» после перекура.
  Hard-lock привёл бы к тому, что часть работы не зафиксировалась.
- Simpler mental model: pause = «я на перерыве» marker, не блок.
- Hard-lock создаёт edge cases (что если авария во время pause?
  операции не должны быть заблокированы).

Последствия:
- **GPS pings** (M5) принимаются во время pause — просто помечаются
  флагом. Payroll engine (Этап 3) может или не может считать их
  «рабочим временем» — отдельное решение на уровне тарифов.
- **Auto-resume на end.** Если оператор завершает смену со статусом
  `paused`, service вычисляет `now - paused_at`, добавляет к
  `total_pause_seconds`, обнуляет `paused_at`. Никакой отдельной
  «resume before end» mutation нужно.

### canWork enforcement (defense-in-depth)

ADR 0005 определил canWork как трёхфакторный gate:
```
canWork = profile.approved
        AND ≥1 approved+active hire
        AND isLicenseValidForWork(licenseStatus)
```

На M4 backend **повторно проверяет** canWork на `POST /shifts/start`:

```ts
const status = await craneProfileService.getMeStatus(ctx)
if (!status.canWork) {
  throw AppError({ 422, CANNOT_START_SHIFT, reasons: status.canWorkReasons })
}
```

Mobile UI скрывает «Начать смену» CTA если canWork=false (UX hint), но
backend-reject — source of truth. Reasons пробрасываются клиенту в
`error.details.reasons` — мобилка показывает тот же список, что на /me.

Причина дублирования: логика canWork уже существует в
`crane-profile.service.computeMeStatus`. Не писать второй raw-SQL
query — переиспользовать function. Небольшой overhead (1 extra DB
round-trip) мы принимаем.

### Crane eligibility

`loadEligibleCrane(operatorUserId, profile, craneId)` — атомарный lookup,
возвращает crane либо null (404 для клиента). Условия:
1. `cranes.id = craneId AND approval_status='approved' AND status='active' AND deleted_at IS NULL`
2. `cranes.site_id IS NOT NULL` — без привязки к объекту shift не начать (смена «в воздухе» нет смысла).
3. `organization_operators` existence с `approvalStatus='approved' AND status='active' AND deleted_at IS NULL` для operator+crane.organization_id.
4. (Отдельно) `shifts.findActiveOnCrane` = null (не занят другим оператором).

Критичная subtlety: condition 3 — это **не** прямой `ctx.organizationId`
check (оператор не несёт organizationId в JWT — ADR 0003). Это явный
lookup в hire-таблице, per-org basis. Для dual-org operator это «в какой
org он сейчас работает» решается по crane'у, который он выбрал.

### Dashboard semantic change

`OwnerDashboardStats.active.cranes` был count(approved+active cranes in
org) = fleet size. Меняем на count(distinct crane_id with active/paused
shift in org) = currently operating.

Shape не меняется, TypeScript тип остаётся. Web label «Кранов в работе»
уже соответствовал новой семантике.

Fleet size (approved+active cranes) доступен через `/my-cranes` list с
фильтром — отдельный dashboard-card под него не нужен в MVP.

### Real-time update strategy

**Решение: polling 30s + refetch on focus.** Альтернативы: WebSocket,
SSE, Server-Push.

Мотивация:
- Типичный operator делает 1-2 transition'а в день (start / end). Owner
  dashboard не требует sub-second latency.
- WebSocket требует infra (Redis pub/sub, connection pool, reconnect logic).
- 30s polling на стройке (~10 operators / 3 orgs) — тривиальная нагрузка.

Когда станет bottleneck (100+ operators per org, multi-tenant scale) —
пересмотреть (probably WebSocket через Redis Streams).

### Elapsed time (mobile timer)

`useShiftTimer(shift)` — client-side compute с tick 1s:
```
elapsedMs = (now - startedAt) - total_pause_seconds*1000
           - (now - paused_at if status=paused)
```

Server refetch каждые 30s (useMyActiveShift polling) корректирует drift
клиентских часов. Timer — visual only, не timing-sensitive; ~1 секунда
ошибки в день допустима.

Alternative (server-authoritative elapsed endpoint) overkill:
- Запрос каждую секунду = DDoS.
- «Сколько прошло» можно вычислить на клиенте с той же точностью.

## Последствия

**Положительные:**
- Operator может выполнять базовую рабочую операцию (старт → работа →
  завершение). MVP больше не «demo mode».
- Owner видит реал-тайм картинку. Dashboard метрика «Кранов в работе»
  теперь осмысленная.
- Foundation для M5–M7 готов: shifts — якорь для GPS tracks,
  СИЗ-подтверждений, incidents.

**Риски / debt:**
- **Нет scheduled shifts** (запланированная смена на завтра). Делается
  в backlog, когда появится UI планирования.
- **Нет cancel shift** (ошибочный старт). Сейчас оператор обязан end,
  даже если смена 30 секунд. Backlog: `shift.cancel` с reason.
- **Нет offline queue** (без интернета в лифте / подвале). Depends on
  M5 offline pattern — тогда and re-examined.
- **Нет payroll integration.** Tariffs на `cranes.tariffs_json` — pure
  placeholder. Payroll engine (Этап 3) будет потреблять shift data
  напрямую.

**Принятые trade-off'ы:**
- Advisory pause vs hard-lock — simpler mental model, ценой потенциально
  неточного time accounting (оператор забывает resume).
- Client-computed timer — drift допустим (refresh 30s исправит).
- Polling > WebSocket — proof-over-elegance на MVP-scale.

## Альтернативы, отвергнутые

- **Shifts как cron job с GPS geofence** (auto-start при входе в
  геозону). Отложено в M5 как optional — сейчас explicit user action
  проще и более audit-friendly («оператор явно начал смену в 9:05»).
- **assignments table (operator × crane × period)** как интермедиация —
  добавляет layer без пользы: owner владелец не «назначает оператора на
  кран» в MVP; оператор сам выбирает из eligible-pool.
- **Hard-lock pause.** Убирает гибкость; unclear UX когда у оператора
  emergency во время pause.
