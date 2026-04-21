# Database schema (основные сущности)

> Extracted from CLAUDE.md §6. Canonical schemas for all MVP tables, status invariants, critical indexes.

## 6.1 Организации и пользователи

```
organizations { id, name, bin, status ('active' | 'suspended' | 'archived'), contact_name, contact_phone, ... }

users {
  id, phone, password_hash, role,
  organization_id (nullable for superadmin), name,
  status ('active' | 'blocked'),        -- временная блокировка, обратимо
  deleted_at (timestamptz | null),       -- soft-delete, ортогонально status
  token_version (int, default 0),        -- инкремент при logout-all → обесценивает access
  last_login_at, created_at, updated_at
}
```

**Про `status` и `deleted_at`:** два независимых поля, не объединённые в один enum.
- `status='active' + deleted_at=null` — рабочий пользователь
- `status='blocked' + deleted_at=null` — временная блокировка (владелец/superadmin может снять)
- `deleted_at IS NOT NULL` — soft-delete, пользователь "удалён", но история (смены, audit) сохраняется. В списках скрывается, логин блокируется.

Middleware `authenticate` обязан отвергать вход при `deleted_at IS NOT NULL` ИЛИ `status='blocked'` ИЛИ (для non-superadmin) `organization.status != 'active'`.

## 6.2 Операторы (крановщики)

```
operators {
  id, user_id, organization_id,
  first_name, last_name, middle_name, quialification,
  status ('active' | 'pending' | 'rejected' | 'blocked'),
  availability_status ('free' | 'busy' | 'on_shift'),
  marketplace_opt_in boolean,
  rating_avg, shifts_count,
  ...
}

operator_documents {
  id, operator_id, doc_type,
  file_url, expires_at,
  status (computed: 'valid' | 'expiring' | 'expired'),
  uploaded_at
}

operator_payment_terms {
  id, operator_id,
  day_rate, night_rate, overtime_rate, fixed_rate,
  effective_from, effective_to
}
```

## 6.3 Объекты и краны

```
sites {
  id, organization_id, name, address,
  geofence_center (GEOGRAPHY(Point, 4326)),     -- PostGIS; GIST-индекс
  geofence_radius_m (int, default 150, CHECK 1..10000),
  status ('active' | 'completed' | 'archived'), -- см. transitions ниже
  notes, created_at, updated_at
}

cranes {
  id, organization_id, type, model, capacity_ton, boom_length_m,
  year, inventory_number, tariffs_json, ...
}

assignments {
  id, operator_id, crane_id, site_id,
  assignment_type ('primary' | 'shift' | 'replacement'),
  date_from, date_to (nullable), is_active,
  ...
}
```

**Sites: статусы.** Enum `site_status` в миграции 0003. Дефолт `active` (не `published` — используем один глагол «активный объект», не два). Разрешённые переходы (enforced в `SiteService`):

```
active    ⇄ completed   (объект сдан / вернули в работу)
active    → archived    (скрыть из активных списков)
completed → archived
archived  → active       (восстановить)
```

Запрещено `archived → completed` (вычеркнутый объект нельзя внезапно «сдать» — сначала `activate`, потом `complete`). Любой другой переход → `409 INVALID_STATUS_TRANSITION`. Идемпотентность: повтор status=current возвращает 200 без второй audit-записи (консистентно с organizations).

**Sites: координаты.** GEOGRAPHY(Point, 4326) хранит lng/lat как один spatial-столбец (`geofence_center`). Вставка через `ST_MakePoint(lng, lat)::geography`, чтение через `ST_Y(::geometry) AS latitude, ST_X(::geometry) AS longitude`. На слое API координаты отдаются двумя числами (`latitude`, `longitude`), округлёнными до 6 знаков (`round6`, ≈11 см — достаточно для GPS с 3-5 м accuracy). GIST-индекс по `geofence_center` готов к spatial queries (для shifts).

**Sites: REST (реализовано).** `GET /api/v1/sites`, `GET /:id`, `POST /`, `PATCH /:id`, плюс action-style переходы `POST /:id/complete|archive|activate`. Policy: owner видит только свою org, superadmin — всех, operator → 403 на list/create, 404 на read (404-вместо-403 по [authorization.md](authorization.md) §4.3). Audit: `site.create|update|activate|complete|archive` в той же транзакции что мутация.

## 6.4 Смены

```
shifts {
  id, operator_id, crane_id, site_id, organization_id,
  started_at, ended_at,
  start_lat, start_lng, end_lat, end_lng,
  is_on_site_start, is_on_site_end,  -- геозона check
  ppe_confirmed boolean, ppe_photo_url,
  calculated_hours, shift_type ('day' | 'night' | 'mixed'),
  ...
}
```

## 6.5 Финансы

```
timesheets { id, organization_id, period_from, period_to, status, ... }
timesheet_entries { id, timesheet_id, operator_id, shift_id, hours, type, ... }

payroll_rules {
  id, organization_id,
  rules_json (structured spec, задаётся специалистом заказчика),
  version, effective_from, created_by
}

payroll_calculations {
  id, timesheet_id, operator_id,
  base_amount, overtime_amount, bonus_amount, deductions,
  total_amount, breakdown_json,
  status ('draft' | 'approved' | 'paid'),
  calculated_at, approved_by, approved_at
}
```

## 6.6 Прочее

```
malfunction_reports { id, shift_id, operator_id, description, photo_url, status, ... }
ratings_operator { id, operator_id, rated_by_user_id, score, criteria_json, comment, ... }
ratings_organization { id, organization_id, rated_by_user_id, score, ... }
notifications { id, user_id, type, title, body, read_at, created_at }
contact_requests { id, from_user_id, to_operator_id, status, created_at, responded_at }

audit_log {
  id, actor_user_id, actor_role, action, target_type, target_id,
  organization_id, metadata_json, ip_address, created_at
}
```

## 6.7 Индексы

Критичные индексы:
- `operators(organization_id, status)` — частые фильтры в списках
- `shifts(organization_id, started_at DESC)` — история смен
- `shifts(operator_id, started_at DESC)` — смены оператора
- `audit_log(organization_id, created_at DESC)` — аудит по компании
- `refresh_tokens(user_id) WHERE revoked_at IS NULL`
- `refresh_tokens(token_hash) WHERE revoked_at IS NULL`
- `operators` GIN-индекс для полнотекстового поиска по ФИО
- GIST-индекс на `sites.geofence_center` для spatial queries
