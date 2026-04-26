# ADR 0008 — Safety compliance: pre-shift checklist + incidents

**Date:** 2026-04-25
**Status:** Accepted
**Authors:** Yerbol (ИП-исполнитель), Claude
**Slice:** M6-a (backend + web), M6-b (mobile — следующий коммит)

---

## Context

Закон РК о промышленной безопасности (приказ Министерства по чрезвычайным
ситуациям от 2014 года + поправки 2022) требует:

1. Перед каждой сменой крановщик проверяет наличие и исправность СИЗ
   (средства индивидуальной защиты): каска, жилет, обувь, перчатки,
   страховочный пояс (для tower-cranes), аптечка. Без подтверждения
   проверки — допуск к работе запрещён.
2. О любом инциденте (поломка крана, падение груза, near-miss, травма,
   нарушение ТБ) оператор обязан немедленно сообщить владельцу
   (handcraft entry в журнал был стандартом до сих пор).

Платформа должна:
- Гейтить shift start через checklist completion.
- Принимать reports (с фото-доказательствами для incidents) с mobile.
- Surface'ить open incidents для owner'а — counters на dashboard,
  full list page с фильтрами, drawer с workflow.
- Оставлять audit trail для legal compliance.

---

## Decision

### 1. Per-shift checklist (не per-day)

Одна checklist row на shift. Создаётся атомарно при `POST /shifts/start` —
embedded в request body. Проверка items completeness (с conditional
требованием harness для tower-cranes) валидируется на service-слое перед
insert через `findUncheckedRequiredItems` из `@jumix/shared`.

**Альтернатива:** per-day checklist с TTL 24 часа.
**Отклонена:** equipment может быть damaged между сменами (потерянные
перчатки, пробитая каска); legal interpretation — check before EACH shift.
Также упрощает schema (нет TTL логики, нет cleanup job).

### 2. Predefined item enum (не custom per-org)

Hardcoded список: `helmet / vest / boots / gloves / harness /
first_aid_kit / crane_integrity`. Labels на ru-RU. Conditional requirement
по `crane.type`: tower → harness обязателен; mobile/crawler/overhead —
без harness. Source-of-truth — `packages/shared/src/api/checklist.ts`
(`REQUIRED_ITEMS_BY_CRANE_TYPE` map).

**Альтернатива:** per-org templates.
**Отклонена для MVP:** complicates UX (mobile needs to fetch template
per crane type); per-org variations добавятся в backlog когда заказчик
покажет реальный use-case (e.g., особые требования при работе ночью).

### 3. Atomic shift creation с embedded checklist

`POST /shifts/start` body теперь включает `checklist: ChecklistSubmission`.
Backend transaction wraps:
- INSERT shifts row
- INSERT pre_shift_checklists row (UNIQUE shift_id)
- INSERT audit `shift.start`
- INSERT audit `checklist.submit`

Если любой шаг падает — rollback всего. **Нет orphan checklist** (без
shift) и **нет shift без checklist**. UNIQUE constraint на `shift_id` в
`pre_shift_checklists` — DB-level guarantee.

**Альтернатива:** отдельный endpoint `POST /api/v1/checklists` который
создаёт checklist row, потом `POST /shifts/start` с `checklistId`.
**Отклонена:** orphan-edge-case (operator submit checklist, потом
закрывает app, чек-лист повисает; cleanup job нужен).

### 4. Hard rule: cannot start shift с unchecked required items

Service-слой проверяет `findUncheckedRequiredItems(crane.type, checklist)`
перед insert. Если non-empty → `422 CHECKLIST_INCOMPLETE` с
`details.missing: ChecklistItemKey[]`. Mobile UI disables "Начать смену"
кнопку пока missing не пустой; backend дублирует проверку (defense in
depth).

**Альтернатива:** soft warning — operator может skip, audit фиксирует.
**Отклонена:** размывает legal compliance ("я нажал skip" — не оправдание
перед инспектором). Если equipment damaged — operator должен contact
owner (out-of-band, телефон) до выхода на смену.

### 5. Incident schema — denormalized reporter, nullable shift/site/crane

`reporter_user_id` RESTRICT FK + `reporter_name` + `reporter_phone`
**денормализованы** в incident row. Reasons:
- Query performance — owner queue без JOIN на users.
- Record durability если user soft-deleted позже (incident persists с
  именем reporter'а на момент события).
- Phone — отдельно от текущего user.phone (он мог поменять номер с
  тех пор).

`shift_id` / `site_id` / `crane_id` — все NULLABLE с `ON DELETE SET NULL`.
Operator может report incident **без** active shift (например, увидел
нарушение ТБ на чужом объекте проходя мимо). Если shift есть — site/crane
auto-derive в service-слое.

**`latitude` / `longitude` NULLABLE** — auto-attached на mobile из M5
GPS queue если recent ping есть, но offline-tolerant.

### 6. Severity self-assignment

Operator выбирает severity (`info` / `warning` / `critical`) при report.
Acknowledged trade-off: operator может занизить или завысить ради
escalation. Mitigations:
- Owner может re-classify (изменить severity) — backlog endpoint.
- Critical-severity — driver для danger-highlight на owner dashboard
  (видимый сигнал, что нужно оценить срочность).
- Audit trail сохраняет all submissions.

### 7. Status workflow

```
submitted → acknowledged → resolved
submitted → escalated → (superadmin) resolved | de-escalated → acknowledged
acknowledged → escalated → ...
```

**Resolved — terminal** (cannot revert).
**Escalated → resolved**: только superadmin (owner не может закрывать
эскалацию).
**De-escalate**: только superadmin (восстанавливает acknowledged).

State transitions guarded:
- Service `incident.policy.ts` `canAcknowledge` / `canResolve` /
  `canEscalate` / `canDeEscalate` — pure function checks role + status.
- Repository `WHERE status IN (...)` clauses — race-safe (при
  concurrent transitions старая state'а отвергается).

### 8. Photo upload — three-phase, reused from M3 license

```
1. POST /api/v1/incidents/photos/upload-url      → presigned PUT + key
2. Client PUT к MinIO (или InMemory в тестах)
3. POST /api/v1/incidents body: { photoKeys: [...] } → server HEAD + validate
```

Pending-prefix scoped по reporter user_id:
`pending/{userId}/{uuid}/{filename}`. Service на confirm проверяет
`isPendingKeyForUser(key, ctx.userId)` (cross-user injection prevention).

Same pattern для checklist photos — отдельный endpoint
`POST /api/v1/checklists/photos/upload-url`. Photo упоминается в
`checklist.items.{key}.photoKey`.

**Backlog:** retention/cleanup job для never-claimed pending uploads
(>24h). MVP не критично (storage ёмкости с запасом, < 100 dangling/мес.).

### 9. Owner dashboard — pending.incidents counter

`OwnerDashboardStats.pending.incidents` (open: submitted +
acknowledged + escalated) и `pending.criticalIncidents` (subset с
severity='critical').

Card на dashboard: counter + danger-highlight (border + icon tone) если
`criticalIncidents > 0`. Кликабельный — навигация на `/incidents`.

### 10. Reporter denormalization — also for resolve/escalate by

`acknowledged_by_user_id` / `resolved_by_user_id` SET NULL при удалении
user'а — для metadata в audit feed. Менее критично чем reporter (acted-by
info для UX, не legal record).

---

## Consequences

### Positive

- Legal compliance baseline: каждая смена имеет documented checklist,
  каждый incident — audit trail с photos.
- Atomic shift+checklist insert eliminates orphan edge cases.
- Reporter denormalization обеспечивает report durability через time.
- Reused storage three-phase pattern — нет нового infrastructure.
- Testable: 32 backend tests + 17 web tests cover full state machine
  + cross-role authz.

### Negative

- Shift start UX: operator делает 7 toggles (40-60 сек) **каждую** смену.
  Mitigation: long-press item → photo + notes optional, pre-checked
  defaults для experienced operators (backlog).
- Photo storage растёт без cleanup для pending uploads (backlog).
- Severity accuracy зависит от operator self-assignment; owner
  re-classify — backlog endpoint (workaround: escalate если несогласен).
- Per-org custom checklist templates — backlog (на старте все компании
  работают с одним базовым набором, что is OK для большинства).

### Out of M6 scope (в backlog)

- Per-org custom checklist items + templates
- Owner re-classify severity endpoint
- Incident assignment workflow (assign к specific user, not all owners)
- Incident comments thread
- Recurring incident detection (analytics)
- Photo annotation (draw arrows на photo)
- Voice notes на incidents
- Multi-language items (kk, en)
- Incident export (CSV/PDF для regulatory reporting)
- Periodic safety reminders push (M7)
- Incident-shift linkage analytics (frequency by crane, by site)
- Pending storage cleanup job
- Mobile flow (checklist screen + incidents reporting screens — M6-b)
- Push notifications on incident creation (M7 vertical)

---

## References

- ARCHITECTURE.md §M6-a (full implementation summary) + §M6-b (mobile slice)
- packages/db/migrations/0012_safety_compliance.sql
- packages/shared/src/api/checklist.ts (REQUIRED_ITEMS_BY_CRANE_TYPE)
- packages/shared/src/api/incident.ts (status workflow types)
- apps/api/src/modules/incident/* (policy/service/routes/plugin)
- apps/api/src/modules/checklist/checklist.plugin.ts (minimal photo upload)
- apps/web/src/app/(app)/incidents/page.tsx (list page)
- apps/web/src/components/drawers/incident-drawer.tsx (detail + actions)
