# ADR-0007: GPS tracking + geofence (advisory exit semantics)

- **Дата:** 2026-04-24
- **Статус:** Accepted
- **Автор:** Yerbol
- **Scope:** M5 — первая телеметрическая вертикаль поверх M4 shifts.
  Backend модуль location pings (migration 0011, shift-module extension),
  mobile tracking infrastructure (expo-location + expo-task-manager +
  expo-sqlite offline queue), web owner map upgrade. Foundation для
  owner reale-time observability, M7 push notifications (geofence exit
  → notification candidate).

## Контекст

ТЗ §5.3 требует «контроль присутствия крановщика на объекте», §5.6 —
«карта реального времени» для owner'а. После M4 есть live shift'ы, но
без location'а: owner видит что смена идёт, но не где именно кран
находится. Mobile работает «вслепую» — оператор не знает, зафиксировал
ли система что он на объекте.

M5 добавляет GPS-telemetry layer. Основные риски:

1. **Battery.** 1Hz непрерывный tracking на 8-часовой смене = 3 часа до
   mort'а батареи. Неприемлемо — крановщики не могут носить зарядные
   кабели в кабине крана.
2. **Offline.** Стройплощадки часто в «радио-дырах» (бетонные стены,
   подвалы, удалённые объекты без 4G). Pings потеря = потеря доказательной
   базы для начислений и compliance.
3. **Platform-specific permissions.** iOS и Android различаются радикально:
   iOS требует `showsBackgroundLocationIndicator` + blue bar, Android —
   `FOREGROUND_SERVICE_LOCATION` + persistent notification. App Store и
   Google Play оба могут reject приложение с неверными declarations.
4. **Geofence UX.** Строительная работа требует гибкости: крановщик может
   выйти за периметр на 5 минут (привезли стройматериалы, туалет,
   разговор с водителем грузовика). Hard auto-pause смены = disruption.

## Решение

### 1. Adaptive sampling — 15s foreground, 60s background, 50m distance filter

Fixed-frequency tracking экономически нежизнеспособен (см. «Battery»
выше). Переходим на **adaptive**:

- **App foreground + shift active:** `setInterval(15_000ms)` +
  `Location.Accuracy.High` (~10m, long fix time, higher battery drain —
  acceptable когда экран открыт).
- **App background + shift active:** `expo-task-manager` task с
  `timeInterval: 60_000ms` + `distanceInterval: 50m` + `Accuracy.Balanced`
  (~100m via WiFi+cell networks, быстрый fix, низкий drain).
- **App killed (Android):** OS-managed wake-ups через TaskManager, типично
  60-300s, работает пока `foregroundService` notification жив.
- **Shift ended:** `stopLocationUpdatesAsync` немедленно, AsyncStorage
  context cleared.

Оценочный impact: 8-часовая смена потребляет дополнительно ~15-25%
battery. Acceptable для большинства устройств.

**Configurable per-org sampling rate — в backlog.** Если выяснится что
конкретная компания требует жестче (финансовый аудит) или свободнее
(опасное оборудование, меньше нужна точность), вынесем настройку.

### 2. Offline queue — expo-sqlite, не AsyncStorage

AsyncStorage имеет лимит 6MB на Android и serialization overhead (JSON
на каждый R/W). 8-часовая смена × 60s = 480 pings = 50-100KB но
cumulative wear на keyValueStore заметен. SQLite — native транзакции,
indexed pending lookup, bounded memory.

Schema (mobile SQLite):
```sql
CREATE TABLE location_pings_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shift_id TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  accuracy_meters REAL,
  recorded_at TEXT NOT NULL,     -- ISO 8601
  inside_geofence INTEGER,        -- 0/1, nullable
  synced_at TEXT,                 -- ISO, NULL = pending
  attempts INTEGER DEFAULT 0
);
CREATE INDEX idx_pending ON location_pings_queue(synced_at) WHERE synced_at IS NULL;
```

**Flush strategy:**
- On every new ping insert → try flush pending batch (up to 50).
- On app foreground → try flush.
- On `NetInfo` online event → try flush.
- If ping.attempts > 10 → mark `sync_failed`, leave в DB для debugging
  (backlog: surface to user через warning banner).

**Retention:** delete synced pings старше 7 дней на cold-start. Локальный
cleanup, не touch'ит сервер.

### 3. Geofence computation — client-side, Haversine formula

**Server-side geofence** требовал бы каждый ingest-batch считать
distance ping→site.coords. Лишний server load, геокоды сайтов хранятся
в PostGIS — выигрыша по точности нет.

**Client-side** — mobile knows current shift's site (cached в
AsyncStorage при start tracking), считает Haversine на прилёте каждого
ping'а, пишет boolean `inside_geofence` в ping row до insert в queue.
Работает offline, zero server load.

```ts
function distanceMeters(lat1, lng1, lat2, lng2): number {
  const R = 6_371_000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat/2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLng/2) ** 2
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
```

**Accuracy tolerance:** `effectiveRadius = site.radius + ping.accuracy`.
Если GPS accuracy 20m и site radius 200m, ping считается inside вплоть
до 220m. Предотвращает false-exit на краю зоны из-за шумного GPS fix'а.

**Server trust client.** Server получает `inside_geofence` как-есть,
не пересчитывает. Rationale: geofence — advisory UX (см. §4), а не
начисления. Если в будущем понадобится strict enforcement для payroll —
пересчитаем на server через PostGIS ST_DWithin.

### 4. Geofence exit — advisory warning, не auto-pause

**Вопрос заказчику (Бакыт):** «Что делать когда оператор выходит за
границы объекта во время смены?»

**Ответ (summary):** «Бывает — привезли материалы, пересменка, туалет,
кого-то надо встретить у ворот. Ни в коем случае не останавливать
смену автоматически. Нужно только видеть что он вышел, чтоб потом
проверить если возник вопрос по табелю».

Отсюда три свойства решения:

1. **UI banner** на mobile active-shift screen: «Вы покинули объект
   ({site.name}). Вернитесь чтобы продолжить работу.» Persistent пока
   не вернётся. Не blocking — кнопки pause/end остаются active.
2. **Audit log** на server: `shift.geofence_exit` / `shift.geofence_entry`
   event пишется при *изменении* состояния (см. §5). Owner может
   reconstitute «оператор был вне зоны с 14:32 до 14:58» через audit
   trail.
3. **Owner map marker color** — crane marker пульсирующий красным
   когда inside_geofence=false. Visual cue без interruption.

**Consecutive-2 state transition rule.** Single ping outside может быть
GPS noise. Client считает состояние изменённым только если N=2
consecutive pings в новом состоянии. Для re-entry — тот же порог.
Предотвращает flicker «IN/OUT/IN/OUT» от едва-на-границе позиций.

**Hard auto-pause не принят в MVP.** Если клиенты через 3-6 месяцев
запросят «строгий режим» per-org (disable геозоны, jail-pause на exit) —
добавим org setting. Пока — advisory only.

### 5. Server-side geofence transition audit

Ingest endpoint (`POST /shifts/:id/pings`) делает:

1. Находит `prevLatest = latest ping shift'а *до* этого batch'а`.
2. Inserts все валидные pings batch'а.
3. Находит `newestInBatch = ping с max(recordedAt) в batch'е`.
4. Если `prevLatest.insideGeofence !== newestInBatch.insideGeofence` и
   обе стороны не null → пишет audit entry.

```ts
if (prevInside !== null && nextInside !== null && prevInside !== nextInside) {
  const action = nextInside ? 'shift.geofence_entry' : 'shift.geofence_exit'
  await insert auditLog { action, targetType: 'shift', targetId: shiftId, ... }
}
```

**Null на одной стороне = unknown**, не transition. Первый-ever ping
не триггерит audit, поскольку не с чего сравнивать.

**Почему server, а не client-side event?** Client мог бы отправлять
отдельный `POST /geofence-events` на каждый exit. Но:
- Server уже получает все pings → state change выводится тривиально.
- Отдельный endpoint = больше кода + больше edge cases (client отправил
  event но потерял ping = inconsistent).
- Audit trail через централизованный server compute гарантирует
  консистентность между map, audit feed, future reporting.

### 6. Batch ingestion — до 100 pings per request

Single-ping endpoint неэффективен: network radio wake-up на каждый
ping = battery killer. Batch'и позволяют group'ировать pings каждые
30s network windows.

**Ingest schema:**
```ts
POST /api/v1/shifts/:id/pings
Body: { pings: [ { latitude, longitude, accuracyMeters, recordedAt, insideGeofence }, ... ] }
```

- **min 1, max 100** pings per request (Zod-валидация).
- **Graceful partial reject:** невалидные pings не блокируют весь batch.
  Response `{ accepted: N, rejected: [{ index, reason }] }`. Client
  помечает accepted'ы как synced (по order), остальные retry'ит.
- **Timestamp sanity:** rejected если >5min в будущем (`FUTURE_TIMESTAMP`)
  или >30 дней в прошлом (`STALE_TIMESTAMP`) — edge-cases clock-skew.

### 7. Schema (migration 0011)

```sql
CREATE TABLE shift_location_pings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  latitude numeric(10,7) NOT NULL,        -- ~11mm precision
  longitude numeric(10,7) NOT NULL,
  accuracy_meters real,                    -- nullable
  recorded_at timestamptz NOT NULL,        -- device clock
  inside_geofence boolean,                 -- nullable
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT lat_range CHECK (latitude BETWEEN -90 AND 90),
  CONSTRAINT lng_range CHECK (longitude BETWEEN -180 AND 180),
  CONSTRAINT accuracy_nonneg CHECK (accuracy_meters IS NULL OR accuracy_meters >= 0)
);

CREATE INDEX shift_location_pings_shift_time_idx
  ON shift_location_pings(shift_id, recorded_at DESC);
```

**Без PostGIS.** Primary query — «latest per active shift» + «full path
of single shift» — оба не geospatial (filter by shift_id + sort by
recorded_at). PostGIS добавим если:
- Появится «shifts within bounding box» (owner map загружает только
  viewport) — scale threshold ~1000 concurrent shifts.
- Heat-map analytics (backlog).
- «Найди все pings в радиусе X от точки Y» для incident reconstruction.

**Retention 90 дней.** Compliance + debugging + payroll disputes ≤ 90
days typically. Background cleanup job — backlog.

**Partitioning by month.** Когда `shift_location_pings > 50M rows`
(оценка: 100 active operators × 480 pings/day × 365 days = 17.5M/year,
threshold ~3 years). Backlog.

### 8. Query endpoints

- **`GET /shifts/owner/locations-latest?siteId?`** — latest ping per
  active/paused shift в scope owner.org (owner) или all (superadmin).
  Использует `ROW_NUMBER() OVER (PARTITION BY shift_id ORDER BY recorded_at DESC)`
  + `WHERE rn=1` filter. Anti-N+1 JOIN на crane/site/profile.
  Client polling 30s.

- **`GET /shifts/:id/path?sampleRate=N`** — все pings смены ASC.
  `sampleRate=5` возвращает каждый 5-й → для визуализации polyline
  достаточно (500 pings / 5 = 100 points, ухудшение visual detail
  незаметное, сокращение network 5×).

- **`GET /shifts/my/active/location`** — operator's own latest ping.
  Mostly debug — mobile имеет state локально.

- **`POST /shifts/:id/pings`** — batch ingest (описан §6).

### 9. Authz

- **Ingest:** строго operator-владелец shift'а. Owner/superadmin не могут
  «писать GPS за оператора» — business invariant (данные из устройства
  крановщика, не из веб-панели).
- **Read path:** operator-own / owner-org / superadmin-all (как `/shifts/:id`).
- **Latest locations list:** owner/superadmin (как `/shifts/owner`).
- **My active location:** operator только свою.

Cross-operator / cross-org → 404 (не 403) чтобы не раскрывать
существование shift'а чужого tenant'а.

### 10. App Store & Google Play compliance

**iOS:**
- `Info.plist`: `NSLocationWhenInUseUsageDescription`,
  `NSLocationAlwaysAndWhenInUseUsageDescription`, `UIBackgroundModes: [location]`.
- `showsBackgroundLocationIndicator: true` — **обязательно** с iOS 14+.
  Blue bar показывается когда app tracks в фоне — App Store review
  rejections за отсутствие.
- Activity type `AutomotiveNavigation` — hint OS что это "vehicle
  tracking", не "pedometer fitness app".

**Android:**
- Permissions: `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`,
  `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE`,
  `FOREGROUND_SERVICE_LOCATION`.
- `foregroundService` notification с title/body — обязательна для
  background tracking начиная с Android 10+. Notification показывает
  «Jumix отслеживает смену» + `notificationColor: #F97B10` (brand
  orange — первое и единственное use brand на platform chrome).
- OEM-specific: Xiaomi/Huawei/OnePlus имеют aggressive background kill.
  Требуется user-education «Не убирайте Jumix из battery optimization».

## Последствия

**Положительные:**
- Owner реал-тайм observability (polling 30s — MVP adequate).
- Offline resilience — смена в удалённом объекте без 4G работает,
  sync'ится при возвращении в зону.
- Advisory UX + audit trail = flexibility для операторов + доказательная
  база для споров по табелю.
- Foundation для M7 push (geofence exit → push-candidate) и Этап 3
  payroll (корреляция time-on-site).

**Отрицательные:**
- Battery impact 15-25% на 8h смену — acceptable но требует
  user-education.
- Native linking complexity — Expo dev build нужен для real-device test
  (Expo Go не поддерживает background location).
- Real-device QA критичен — simulator'ы не воспроизводят permission
  flows, battery behavior, OEM-specific kills. Expect multi-week QA
  cycle на iOS/Android.

**Compatibility:** shifts table не меняется. Существующие endpoints
(M4) работают без изменений. Дополнения — только добавления (новая
таблица, новые endpoints, новый policy-метод).

## Альтернативы

1. **1Hz continuous tracking.** Rejected — battery.
2. **Server-side geofence.** Rejected — нужен offline-первый UX,
   client знает site coords, lookup latency на каждый ping излишен.
3. **Auto-pause смены на exit.** Rejected — disruption для легитимных
   случаев выхода (см. §4). Клиенты могут toggle'нуть strict mode
   per-org в будущем.
4. **WebSocket real-time push.** Rejected на MVP — polling 30s adequate
   для 100+ concurrent shifts, WebSocket требует Redis pub/sub infra.
   Upgrade — backlog.
5. **PostGIS spatial index.** Rejected на MVP — primary queries не
   geospatial (by shift_id, by time). Добавим когда scale warrants.
6. **Single-ping endpoint.** Rejected — battery (network radio wake-up
   на каждый ping).

## Открытые вопросы для backlog

- **Ping anomaly detection** — «teleport» (impossible distance between
  consecutive pings) → indicates GPS malfunction или data-forgery.
  Server-side detection + warning + potential auto-reject.
- **Configurable sampling rate per-org** — strict mode UI-toggle.
- **Strict geofence mode** — per-org option: auto-pause смены при exit.
- **Ping retention job** — cron `DELETE FROM shift_location_pings WHERE
  created_at < now() - 90 days`.
- **Partitioning by month** — когда table > 50M rows.
- **WebSocket real-time** — upgrade polling → pub/sub когда scale нужен.
- **Location analytics** — speed histogram, heat maps, time-at-location.
