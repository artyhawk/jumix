# ADR-0002: Holding approval model — дочки инициируют, холдинг одобряет

- **Дата:** 2026-04-22
- **Статус:** Accepted (согласовано с заказчиком устно 2026-04-22, полная письменная конфирмация в процессе)
- **Автор:** Yerbol
- **Scope:** cranes module (B2c) + planning для operators (B2d)

## Контекст

Заказчик — холдинговая компания Jumix с множеством дочерних организаций, все
они работают на одной платформе. Холдинг хочет централизованный контроль
качества парка кранов и кадров крановщиков: любой добавляемый кран, любой
регистрирующийся крановщик должны пройти approval холдингом перед появлением
в operational-обороте.

Это принципиально отличается от буквального прочтения ТЗ §5.1.4/§5.1.5, где
"владелец добавляет кран/крановщика" подразумевает single-tenant CRUD без
upstream-одобрения. Интерпретируем generic-формулировки ТЗ в контексте
реальной структуры заказчика: holding-owned platform с subsidiary orgs, где
super-admin = хозяин холдинга, а owner = руководитель дочки.

Terminology disambiguation:
- **Заказчик / холдинг (Jumix)** — владелец платформы. Это НЕ Telse/разработчики.
- **Суперадмин** — technical role, эквивалент "хозяина холдинга" (единственный
  actor который видит всю платформу).
- **Owner** — руководитель дочерней компании; видит только свою org.

До текущего момента (commits B1 + B2b) модели были написаны под generic
multi-tenant SaaS: owner создавал cranes/operators сразу в active/approved
состоянии. Это нужно поменять — добавить approval gate.

## Решение

### Cranes (этот коммит)

- `owner` создаёт `POST /cranes` → запись создаётся с `approval_status='pending'`
- `superadmin` делает `POST /cranes/:id/approve` → `approval_status='approved'`,
  кран доступен для operational работы (lifecycle через обычный
  `status: active ↔ maintenance → retired`)
- `superadmin` может сделать `POST /cranes/:id/reject` с причиной →
  `approval_status='rejected'`, запись становится read-only (кроме delete
  для cleanup)
- Кран всегда принадлежит одной org (1:1). Перенос между дочками — отдельное
  административное действие холдинга, backlog

### Два независимых измерения status на cranes

| approval_status | status         | Семантика                                              |
|-----------------|----------------|--------------------------------------------------------|
| pending         | active/maint/r | ждёт одобрения — в operational-обороте НЕ участвует    |
| approved        | active         | одобрен и в работе                                     |
| approved        | maintenance    | одобрен, временно на ТО                                |
| approved        | retired        | одобрен, списан (terminal)                             |
| rejected        | *              | отказано, read-only, доступен только для удаления      |

`approval_status` — админское (pending/approved/rejected). Ворота на появление в
платформе. Меняется только через `/approve` и `/reject` endpoints суперадмина.

`status` — operational lifecycle (active/maintenance/retired). Меняется только
если `approval_status='approved'`. Попытка change status на pending → 409.

Оба orthogonal к `deleted_at` (soft-delete может применяться к любому сочетанию).

### Organizations и Sites (статус-кво)

- **Organizations** создаются суперадмином напрямую, approval workflow не
  нужен — сам холдинг решает когда заводить дочку.
- **Sites** (объекты) owner создаёт без approval — это операционная работа
  дочки, холдинг видит через superadmin view но не одобряет каждый site.

### Operators (планирование, НЕ в этом коммите)

Операторы в MVP (B2b) сейчас в single-org модели, как и были — owner
создаёт operator вручную, статус сразу active. Переход на holding-approval
модель для operators — отдельная большая вертикаль (B2d), которая включает:

- Рефакторинг `operators` → `crane_profiles` (общая база холдинга) +
  `organization_operators` (M:N — какой оператор в каких дочках работает).
- Регистрация через мобилку → crane_profile pending → superadmin одобряет.
- После одобрения компании могут "нанимать" approved крановщика (создание
  записи в organization_operators).
- Один крановщик может работать в нескольких дочках одновременно (M:N).

Этот рефакторинг ломает существующий B2b API, поэтому делаем отдельной
вертикалью с собственным ADR (0003) после закрытия B2c.

## Альтернативы которые рассматривали

### 1. Буквальное прочтение ТЗ — owner создаёт сразу active

Текущая B1 реализация. **Отвергнуто**: холдинг теряет контроль качества
парка, нет централизованного реестра, любая дочка может добавить кран
не соответствующий стандартам холдинга (без нужных сертификатов, без
страховки и т.п.).

### 2. Approval на ВСЕ сущности (orgs, sites, cranes, operators)

**Отвергнуто**: избыточно. Организации создаёт сам холдинг (approval
сам у себя бессмыслен). Sites — это операционная работа дочки,
замедлять её approval-ом нет причин. Approval нужен только на ресурсы,
которые формируют общую базу качества холдинга: парк кранов + кадры
крановщиков.

### 3. Все-в-одной-транзакции approval (без отдельного поля статуса)

Например: owner делает create → endpoint "approve" по сути создаёт
настоящую запись из draft'а. **Отвергнуто**: усложняет список
"все pending" (придётся выделять отдельную draft-таблицу), ломает
инвариант "каждая мутация в audit_log", и создаёт двойные ID (draft
vs real). Отдельное поле `approval_status` — явное, простое,
легко query'ится.

### 4. Multi-stage approval (несколько холдинг-админов)

**Отвергнуто для MVP** (YAGNI). Достаточно один superadmin approve.
Если холдинг захочет разделять approval между security-officer + parc-manager,
добавим `approval_required_level` в backlog.

## Последствия

### Положительные

- Явное разделение concern'ов: `approval_status` = gate на появление в
  платформе, `status` = operational lifecycle
- Superadmin получает реальный инструмент контроля
- Аудит approve/reject действий → прозрачность для холдинга
- Pattern переиспользуется на B2d (crane_profiles, operator registration)

### Отрицательные

- B1 миграция: существующие cranes backfill'нем как `approved` (они
  уже работали — их state = "прошли implicit approval")
- Owner теперь видит отдельный список своих pending заявок (UI
  добавит фильтр `?approvalStatus=pending` на B1-экране "мои краны")
- Чуть более сложная policy: canUpdate теперь не monolithic — зависит
  от approval_status. Rejected cranes read-only

### Не решено (backlog)

- **Crane transfer between organizations**: админская операция холдинга
  перевода approved крана из org A в org B. Бэклог backlog.md "Cranes".
- **Multi-stage approval**: если понадобится — `approval_required_level`
  integer. Сейчас YAGNI.
- **Notifications при approve/reject**: blocked на notification system (B4).
  Сейчас только audit_log.
- **Auto-approval rules**: если superadmin захочет "cranes type=mobile до 10t
  auto-approve" — не в MVP.

## Референсные модули

- `apps/api/src/modules/crane/` — reference implementation паттерна
- `docs/architecture/authorization.md §4.2b` — approval workflow pattern
  как часть authorization framework
- `CLAUDE.md §6 rule #11` — critical rule для всех approval-gated entities
