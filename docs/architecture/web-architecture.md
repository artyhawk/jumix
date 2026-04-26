# Web architecture — `apps/web/`

Документ описывает структуру, auth-flow, API-client, motion-слой и responsive-стратегию веб-портала Jumix.
Связанные документы: [design-system.md](design-system.md), [authentication.md](authentication.md), [tech-stack.md](tech-stack.md).

---

## 1. Stack

- **Next.js 15** (App Router, Turbopack, React 19). Порт dev — 3001 (API — 3000).
- **Tailwind CSS v4** — `@theme inline` в `globals.css`, не `tailwind.config.ts`.
- **framer-motion 11** — единый motion-слой.
- **TanStack Query v5** — server-state.
- **Zustand 5** (persist → localStorage) — auth-state.
- **Radix UI primitives** — Dialog / DropdownMenu / Tooltip / Avatar / Slot / Label / Popover.
- **cmdk** — Cmd+K палитра.
- **sonner** — toast-уведомления.
- **react-hook-form + zod** — формы.
- **lucide + tabler** — иконки.
- **Biome** — lint + format (унифицирован с API).
- **Vitest + Testing Library + jsdom** — unit.

Полный список версий — в `apps/web/package.json`.

---

## 2. Структура директорий

```
apps/web/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── (auth)/                   # Публичные: login, verify
│   │   │   ├── layout.tsx            #   redirect-if-authed + decorative background
│   │   │   └── login/{page,verify/page}.tsx
│   │   ├── (app)/                    # Защищённые: ВСЁ под auth-guard
│   │   │   ├── layout.tsx            #   guard + Shell (sidebar/topbar)
│   │   │   └── page.tsx              #   welcome-placeholder
│   │   ├── globals.css               # Design tokens (@theme inline) + keyframes
│   │   ├── layout.tsx                # Root: шрифты + providers
│   │   └── not-found.tsx
│   ├── components/
│   │   ├── ui/                       # Примитивы (Button, Input, Badge, Dialog, ...)
│   │   ├── motion/                   # PageTransition, StaggerList, FadeSwap, NumberCounter
│   │   ├── layout/                   # Shell, Sidebar, SidebarDrawer, Topbar, Logo, nav-config
│   │   └── auth/                     # LoginForm, OtpForm
│   ├── lib/
│   │   ├── api/
│   │   │   ├── client.ts             # apiFetch + 401-refresh orchestration
│   │   │   ├── auth.ts               # обёртки вокруг /auth/*
│   │   │   ├── errors.ts             # AppError / NetworkError
│   │   │   └── types.ts
│   │   ├── auth-store.ts             # Zustand + persist + single-flight refresh
│   │   ├── phone-format.ts           # маска +7 XXX XXX XX XX ↔ E.164
│   │   ├── i18n.ts                   # t(key, vars?, locale)
│   │   ├── query-client.ts           # React Query config
│   │   └── utils.ts                  # cn()
│   ├── hooks/                        # useAuth, useMediaQuery, useKeyboard
│   ├── providers/                    # QueryProvider, AuthProvider, ToastProvider
│   ├── messages/                     # ru.json (полный) + kz.json (placeholder)
│   └── config/env.ts                 # NEXT_PUBLIC_API_URL + пр.
├── tests/setup.ts                    # jsdom-моки (matchMedia, scrollIntoView, ResizeObserver)
├── public/
├── .env.example
├── next.config.ts                    # typedRoutes, transpilePackages, remote images
├── postcss.config.mjs                # @tailwindcss/postcss
├── tsconfig.json                     # extends @jumix/config/tsconfig.react
├── vitest.config.ts                  # jsdom + @vitejs/plugin-react
└── package.json
```

### Rationale за route-groups

- `(auth)` — неавторизованные страницы. Layout делает `router.replace('/')` если пользователь уже авторизован. Добавлен декоративный grid + radial-gradient с брендовым оранжевым (`rgba(249, 123, 16, 0.08)`), чтобы входная точка выделялась визуально.
- `(app)` — всё под auth guard. Layout ждёт `useAuthStore.hydrated` (persist из localStorage занимает микросекунды, но в React терминах — 1 render), показывает skeleton, и редиректит на `/login` если `accessToken == null`.

Deliberately НЕ используем middleware.ts для auth-check: client-side guard достаточен для MVP (бэкенд — source of truth, middleware добавил бы сложность + flicker при SSR).

---

## 3. Auth flow

```
┌────────────┐       POST /auth/sms/request           ┌─────────┐
│ LoginForm  │─────────────────────────────────────▶ │  API    │
│ (SMS mode) │ ◀─────────── {ok: true} ─────────────  │         │
└─────┬──────┘                                         └─────────┘
      │ router.push(/login/verify?phone=...)
      ▼
┌────────────┐       POST /auth/sms/verify           ┌─────────┐
│  OtpForm   │─────────────────────────────────────▶ │         │
│            │ ◀── {accessToken, refreshToken,...} ─ │         │
└─────┬──────┘                                        └─────────┘
      │ useAuthStore.setSession(…)
      │ persist localStorage
      ▼
  router.push('/')
```

### Ключевые свойства

**`clientKind: 'web'`** передаётся в body каждого login endpoint'а (`/auth/sms/verify`, `/auth/login`). Backend выдаёт web-token TTL 30 дней (mobile — 90).

**Refresh — single-flight.** `lib/auth-store.ts` держит module-level переменную:

```ts
let refreshingPromise: Promise<boolean> | null = null
```

Первый 401 берёт лок, остальные ждут на уже-запущенном promise. Это критично: при загрузке страницы часто стартуют 3-5 параллельных запросов, каждый может попасть в 401 одновременно — без single-flight они бы каждый запустили `/auth/refresh` с одинаковым старым refreshToken, что на backend привело бы к reuse-detection и revoke цепи.

**Persist — localStorage.** Key `jumix-auth`, JSON-serializable поля: `{accessToken, refreshToken, accessTokenExpiresAt, refreshTokenExpiresAt, user}`. На старте — `onRehydrateStorage` вызывает `markHydrated()`, что разблокирует `(app)/layout.tsx` guard.

**SSR-safe.** `createJSONStorage` с fallback на no-op storage для `typeof window === 'undefined'`. В MVP мы не используем SSR для защищённых страниц, но безопасно на будущее.

**Cookie-mode — в backlog.** HttpOnly cookies — целевое решение (XSS-resistant), но бэкенд пока не поддерживает cookie-path для `/auth/*`. Миграция описана в `backlog.md / Auth / Web cookie mode`.

---

## 4. API client

`lib/api/client.ts` экспортирует `apiFetch<T>(path, options)`. Одна функция — всё HTTP взаимодействие с бэкендом.

### Контракт

```ts
interface ApiFetchOptions extends RequestInit {
  skipAuth?: boolean         // не добавлять Authorization header
  skipRefresh?: boolean      // не запускать 401-refresh dance (используется самим refresh'ем)
  organizationId?: string    // → X-Organization-Id (для operator multi-org)
}
```

### 401-refresh orchestration

```
apiFetch('/api/v1/sites')
  ├─ 200? → return JSON
  ├─ 401 AND not skipRefresh?
  │    └─ hooks.refresh() (single-flight)
  │         ├─ success → retry once с новым token
  │         └─ failure → hooks.onUnauthorized() (clear store, redirect /login)
  └─ other status → throw AppError({code, message, statusCode, details})
```

### Error envelope

Backend возвращает:
```json
{ "error": { "code": "INVALID_CREDENTIALS", "message": "...", "details": {...} } }
```

Client парсит это в `AppError` с `.code` — для точного UI-mapping'а. Network-ошибка (fetch reject) → `NetworkError`. Неожиданный формат → `AppError({code: 'UNKNOWN_ERROR'})`.

### Hooks registration

```ts
// В providers/auth-provider.tsx:
registerApiHooks({
  getAccessToken: () => useAuthStore.getState().accessToken,
  refresh: () => useAuthStore.getState().refresh(),
  onUnauthorized: () => useAuthStore.getState().clear(),
})
```

Это развязывает `client.ts` от `auth-store.ts` (клиент не импортирует store — только принимает hooks), что позволяет легко подменить реализацию в тестах.

---

## 5. Motion layer

Motion — **additive** поверх design-system. Design-system описывает цвета/spacing/typography (статика); motion — как анимируются переходы. Правила:

### Физика

Spring-дефолт: `{ stiffness: 300, damping: 28 }`. Отдельные overrides допустимы для micro-interactions (кнопка press: `stiffness: 400, damping: 30, mass: 0.8`).

### Обёртки

| Компонент | Назначение |
|---|---|
| `<PageTransition>` | Fade+slide на route-change. Использует `usePathname()` как key. |
| `<StaggerList>` | Дочерние items появляются с stagger 30-60ms. Реализация — `framer-motion` variants. |
| `<FadeSwap>` | Смена содержимого с crossfade (login SMS ↔ password mode). Использует `AnimatePresence mode="wait"`. |
| `<NumberCounter>` | Tween-анимация числа через `useMotionValue` + `useTransform`. |

### Явный motion.*

Для ad-hoc анимаций (shake on error, hover-scale на кнопке) — прямое использование `motion.button`, `motion.div` с `animate`, `whileTap`, `whileHover`.

### Запреты (см. design-system §15)

- ❌ `transition-all` — список явных свойств.
- ❌ `animate-bounce/pulse/spin` (tailwindcss defaults) — слишком дёрганые, не физичные.
- ❌ Scale >1.05 на hover крупных элементов — отвлекает.
- ❌ Skeleton через spinner — только shimmer (CSS keyframes в `globals.css`).

### Skeleton vs spinner

Loading-state — **всегда skeleton** (CSS `@keyframes shimmer` + `linear-gradient`). Исключение — `<LoadingDots>` внутри `Button` (3 точки с чередующейся opacity), потому что кнопка сохраняет размер и не нужен placeholder-shape.

---

## 6. Responsive strategy (mobile-first)

### Breakpoint matrix

| bp | Tailwind | Контекст | Layout shift |
|---|---|---|---|
| 0-767 | — | Phone | Sidebar → drawer (Radix Dialog), topbar hamburger, max-width text, полноэкранные modal'ы |
| 768-1023 | `md:` | Tablet portrait | Sidebar-rail (64px), компактный topbar |
| 1024-1439 | `lg:` | Small desktop / tablet landscape | Full sidebar (240px, collapsible) |
| 1440+ | `xl:` | Desktop | Max-width контейнеры, расширенная типографика |

### Паттерны

**Touch targets.** Кнопки и инпуты:

```tsx
<button className="min-h-[44px] md:min-h-0 md:h-9 …">
```

`min-h-[44px]` на мобиле (Apple HIG); `md:h-9` (36px) на десктопе — компактнее, но уже mouse-precision context.

**Sidebar → Drawer.** Два компонента:

- `<Sidebar>` — `hidden md:flex`. Collapsible 240↔64px по `[`-shortcut / chevron.
- `<SidebarDrawer>` — `md:hidden`, использует Radix Dialog. Auto-close на `pathname` change (`useEffect`).

Общий nav-config в `layout/nav-config.ts`, оба компонента рендерят одинаковые items.

**Modal vs Drawer.** Desktop — `<Dialog>` (центр экрана, backdrop). Mobile — тот же Dialog с overrides: `sm:max-w-lg` убирается, добавляется `h-full w-full rounded-none` — полноэкранный drawer-style.

**Text no-overflow.** Все list-rows — `truncate` либо wrap с `break-words`. Никогда не допускать horizontal scroll на основной странице (scroll внутри таблиц — ok через `overflow-x-auto`).

**Hover vs touch.** Hover-эффекты только через `@media (hover: hover)`. На touch-only surface (`hover: none`) — не применяем, иначе hover «залипает» после tap'а.

### Тестирование

Unit-тесты НЕ покрывают responsive-разметку (jsdom игнорит media queries). Ручной smoke на 375/768/1024/1440 перед коммитом UI-изменений — описано в `apps/web/README.md`.

Post-MVP — visual regression (Chromatic или Playwright snapshots, см. backlog).

---

## 7. RSC vs Client Components

MVP — **почти всё Client Components**. Причина:

- Auth-state в Zustand (client-side). Любой компонент, зависящий от auth → `'use client'`.
- Motion-обёртки (framer-motion требует client).
- Формы (react-hook-form — client).

Server Components используются для:

- Статических layout'ов (Root `layout.tsx` без логики).
- Metadata (title, description) через экспорт `metadata` object.

**Не оптимизируем преждевременно.** RSC streaming даст выигрыш когда появятся heavy server-side lists (superadmin-таблица всех организаций с 500+ строк). Для MVP dashboard'а с несколькими card'ами — client-only подход проще и производительность не проблема.

---

## 8. Tailwind v4 + токены

Конфигурация **полностью в CSS** (`app/globals.css`):

```css
@import 'tailwindcss';

@theme inline {
  --color-surface-0: #09090B;
  --color-surface-1: #0F0F13;
  ...
  --color-brand-500: #F97B10;
  ...
  --font-sans: var(--font-inter), ...;
  --font-mono: var(--font-mono-jetbrains), ...;
  --radius-sm: 4px;
  ...
}

@keyframes shimmer { ... }
@keyframes shake { ... }

.shimmer { animation: shimmer 1.5s ease-in-out infinite; }
.animate-shake { animation: shake 0.5s cubic-bezier(.36,.07,.19,.97); }
```

**Нет `tailwind.config.ts`.** Все design-tokens доступны как Tailwind-утилиты (`bg-surface-1`, `text-text-secondary`, `border-border-subtle`, `bg-brand-500`).

**Custom classes** — только для того, что Tailwind не покрывает out-of-box:
- `.tabular`, `.font-mono-numbers` — числа с равной шириной (tabular-nums).
- `.bg-grid-subtle` — декоративный background-pattern (10% opacity grid).
- Анимации (`.shimmer`, `.animate-shake`, `.anim-fade`, `.anim-fade-zoom`).

**tailwindcss-animate НЕ используется** — несовместим с v4 на момент написания. Вместо него — свои keyframes в globals.css + data-state-атрибуты от Radix (`[data-state="open"].anim-fade-zoom`).

---

## 9. i18n

**Минимальный runtime.** `lib/i18n.ts` экспортирует `t(key, vars?, locale)`:

```ts
t('auth.login.title')                          // → "Вход"
t('auth.login.welcome', { name: 'Иван' })      // → "Привет, {name}!" → "Привет, Иван!"
```

- Точечная dot-notation для поиска в JSON.
- `{var}` интерполяция.
- Fallback: `kz` → `ru` → ключ as-is.

**Messages импортируются статически** (`import ruMessages from '@/messages/ru.json'`) — bundler inlines JSON в bundle, zero runtime fetch.

**Почему не next-intl:**
- Один язык в MVP (RU). KZ — placeholder.
- next-intl требует middleware + `[locale]` route structure + runtime config. Overkill для текущего scope.
- Если добавим KZ как полноценный — переоценим (backlog `Web / KZ locale`).

---

## 10. Testing

### Стек

- **Vitest** + **jsdom** — runner + DOM env.
- **@testing-library/react** — render, screen, waitFor.
- **@testing-library/user-event** — typed interactions (не fireEvent).
- **@testing-library/jest-dom** — матчеры (`toBeInTheDocument`, `toHaveTextContent`).

### Mocks (tests/setup.ts)

jsdom не реализует:
- `window.matchMedia` — моккаем дефолтом на `matches: false` (overridable).
- `Element.prototype.scrollIntoView` — no-op (нужно для OTP auto-advance tests).
- `ResizeObserver` — no-op (нужно для Radix Dialog + cmdk).

### Паттерны

**Mock next/navigation** — вручную в каждом файле где нужен router:

```ts
const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: pushMock }),
}))
```

**Mock API через vi.mock + vi.mocked.** Каждый тест сам задаёт happy/error path через `mockResolvedValueOnce` / `mockRejectedValueOnce`.

**Reset auth store в beforeEach.** `useAuthStore.setState({accessToken: null, ..., hydrated: true})` — всегда clean slate.

### Что покрыто

`lib/*`, `components/ui/*`, `components/auth/*`, `hooks/useMediaQuery`. ~60 тестов.

### Что НЕ покрыто (backlog)

- Responsive разметка (jsdom ignores media queries) — backlog `Web / Visual regression`.
- E2E flow — backlog `Web / E2E tests`.
- Accessibility — backlog `Web / Accessibility audit`.

---

## 11. Env и deployment

`.env.example`:

```
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME=Jumix
```

`config/env.ts` валидирует через Zod на module-load. Fail-fast: если обязательная переменная отсутствует — сразу throw, не ждать runtime 404.

Production build (`pnpm --filter @jumix/web build`) — Turbopack. Деплой — Docker container (см. `infrastructure.md`), порт 3001 внутри, reverse-proxy снаружи.

---

## 12. Что НЕ вошло в B3-UI-1 (идёт в следующих вертикалях)

- ~~CRUD-страницы (organizations, sites, cranes, operators)~~ — реализованы в B3-UI-2c (см. §12a).
- Live-карта смен — Этап 2.
- Payroll UI — Этап 3.
- Marketplace + рейтинги — Этап 4.
- Notifications center + realtime — Этап 4.

Все страницы под `(app)/` будут добавляться инкрементально на существующий shell.

---

## 12a. Глобальные list-страницы (B3-UI-2c)

Четыре глобальных списка для superadmin:

- `/organizations` — реестр организаций (Create dialog + Suspend/Activate actions).
- `/crane-profiles` — global identity крановщиков (approve/reject pipeline 1).
- `/cranes` — реестр башенных кранов (approve/reject pipeline 2).
- `/organization-operators` — M:N наймы (approve/reject pipeline hire + drill-through в crane-profile).

### Примитивы (`components/ui/`)

| Компонент | Роль |
|---|---|
| `DataTable` | Unified desktop-table / mobile-cards, orange hover-bar (2-5% правило), cursor-based infinite scroll через `hasMore + onLoadMore`. IntersectionObserver-триггер — в backlog (сейчас — ручная кнопка «Загрузить ещё»). |
| `FilterBar` | Горизонтальный контейнер для search + chips + dropdowns. Overflow-x на phone. |
| `FilterChip<T>` | Dropdown с single-select. Активный чип подсвечивается `bg-brand-500/12 text-brand-400` (единственное место брендового оранжевого в фильтрах). |
| `SearchInput` | Debounced 300ms через `onDebouncedChange`. Clear-кнопка. 44px touch target. |
| `Combobox<T>` | Async-mode через `onSearchChange` callback (тогда `shouldFilter={!onSearchChange}` — cmdk не фильтрует локально, доверяем server-side поиску). |
| `LicenseStatusBadge` | Computed на boundary из `licenseStatus` (missing/valid/expiring_30d/expiring_7d/expired). |

### URL-state synchronization

Единый helper в каждой page:

```ts
const setParam = (key: string, value: string | null) => {
  const next = new URLSearchParams(params.toString())
  if (value === null || value === '') next.delete(key)
  else next.set(key, value)
  const qs = next.toString()
  router.replace(qs ? `/page?${qs}` : '/page', { scroll: false })
}
```

Все фильтры + `?open=<id>` проходят через этот helper. `scroll: false` обязателен — иначе каждая смена фильтра прыгает в top.

### Drawer orchestration

Клик по строке → `setParam('open', row.id)`. Дровер читает `?open=<id>` и открывается с `id`. Закрытие — `setParam('open', null)`. Принцип: detail-view — **часть URL**, а не component state. Это даёт back/forward navigation + shareable links бесплатно.

### Cross-drawer navigation

На `/organization-operators` hire-дровер имеет кнопку «Открыть профиль» → навигация из одного дровера в другой:

```ts
onOpenCraneProfile={(craneProfileId) => {
  const next = new URLSearchParams(params.toString())
  next.delete('open')
  next.set('openProfile', craneProfileId)
  router.replace(`/organization-operators?${next.toString()}`, { scroll: false })
}}
```

Одна транзакция URL: `?open=<hireId>` → `?openProfile=<craneProfileId>`. Hire-дровер закрывается, crane-profile-дровер открывается.

### Detail drawers (`components/drawers/`)

- `CraneProfileDrawer` — approve/reject (pipeline 1 — platform identity).
- `CraneDrawer` — approve/reject (pipeline 2 — org holding).
- `OrganizationDrawer` — suspend/activate (нет approval pipeline).
- `OrganizationOperatorDrawer` — approve/reject hire + drill-through на crane-profile.

Общие паттерны:
- Optimistic mutation (snapshot → `setQueryData` → `onError` rollback → `onSettled` invalidate).
- `RejectDialog` (shared) с обязательным `reason` (trim > 0, max 500 chars, char-counter).
- Loading — skeleton (не spinner).
- Mobile: full-screen drawer (Radix Dialog с `h-full w-full rounded-none` на phone).

### Filter patterns: server-side vs client-side

- **Server-side** — через API-параметры (`search`, `approvalStatus`, `status`, `organizationId`). Отправляются в hook, отдаются бэком.
- **Client-side** — `useMemo` поверх уже-загруженной страницы. Используется для `licenseStatus` (computed на boundary, бэк не фильтрует) и `crane.type` (ожидает бэк-поддержки). В backlog — server-side варианты для обоих.

Ограничение client-side фильтра: работает только по уже-загруженным rows. Infinite load может догрузить следующую страницу где matching rows отсутствуют — UX приемлем для MVP (< 100 rows на tenant).

### CreateOrganizationDialog

- `react-hook-form` + `zodResolver` + `@jumix/shared` validators (`isValidKzBin`, `isValidKzPhone`).
- Phone input через `Controller`: onChange пропускает value через `applyPhoneMask`, submit нормализует через `toE164`.
- Optimistic invalidate — `organizations` + `dashboardStats` после success.

**Тест phone input — `fireEvent.change` вместо `userEvent.type`.** Причина: controlled Input + applyPhoneMask reformatting + char-by-char typing приводит к accumulation bug (каждый reformatted value re-masked на каждый keystroke). `fireEvent.change` прокидывает финальный value одним вызовом — маска применяется один раз.

### Dashboard integration

`OrganizationsOverview` (`components/dashboard/`) — секция на `/dashboard`:
- `useOrganizations({ limit: 5 })` — последние 5 организаций.
- Row-link → `/organizations?open=<id>` (один клик → другая страница + открытый дровер).
- «Все →» → `/organizations`.

### Test conventions

- API-moks: `vi.mock('@/lib/api/organizations', () => ({...}))` + `vi.mocked(listOrganizations)` для типизации.
- `createQueryWrapper()` helper — **НЕ** выставляет `gcTime: 0` (ломает rollback assertions после invalidate).
- Mock `next/navigation` — `useRouter() + useSearchParams() + usePathname()` через `searchParams.get.mockImplementation((k) => k === 'open' ? 'id-1' : null)`.
- Mock `sonner` — `{ toast: { success: vi.fn(), error: vi.fn() } }` (обязательно, иначе RejectDialog упадёт).
- Reject dialog test: `userEvent.type(textarea, 'причина')` + click «Отклонить» → ждать `reject` mock call с `{ id, reason }`.

---

## 12b. Dashboard audit-feed + Cmd+K палитра (B3-UI-2d)

Финальная вертикаль superadmin-кабинета: recent-activity timeline на dashboard + declarative command-palette.

### Backend: `audit` module

`GET /api/v1/audit/recent?limit=N` (superadmin-only; default 50, max 100). Возвращает enriched events: actor (left-join `users`), organization (left-join `organizations`), metadata passthrough, ordered `DESC` by `created_at`.

Структура: `audit.policy.ts` (`canViewRecent` — superadmin-only), `audit.service.ts` (Drizzle query), `audit.routes.ts` (Zod query-schema, `.strict()`), `audit.plugin.ts` (`fp` с `dependencies: ['authenticate']`). ZodError маппится на 422 `VALIDATION_ERROR` в error-handler (не 400). Паттерн 1:1 копия `dashboard` module'а.

### Web: `RecentActivity` component

`components/dashboard/recent-activity.tsx` — timeline-feed с states:

- `ActivityRow` — size-8 icon (от action-type) + label + actor · organization · relative-time.
- `ActivitySkeleton` — 5 shimmer-rows (размер статичный чтобы не прыгало layout).
- `ActivityEmpty` — `Inbox` icon + «Пока нет событий».
- `ActivityError` — `AlertCircle` + «Повторить» button → `refetch()`.

Height-cap `max-h-[480px] overflow-auto`. Query — `useRecentAudit(20)` со `staleTime: 30_000` (события накапливаются не быстро, 30-секундный cache снимает нагрузку).

### Audit format registry (`lib/format/audit.ts`)

Централизованная таблица `action → {icon, label}`:

```ts
const ACTION_ICONS: Record<string, LucideIcon> = {
  'organization.create': Building2,
  'crane.approve': CheckCircle2,
  'license.warning_sent': AlertTriangle,
  'registration.complete': UserPlus,
  ...30+ actions
}
const ACTION_LABELS: Record<string, string> = {...}
getActionIcon(action) // fallback: Clock
formatActionLabel(event) // fallback: action-string as-is
```

Добавление новой audit-action = одна запись в registry, никаких switch'ей по компонентам.

### Dashboard 2-col layout

`/dashboard` — `grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4`:

- Левая колонка (2fr): `OrganizationsOverview` — top-5 organizations.
- Правая колонка (1fr): `RecentActivity` — последние 20 audit-events.

На phone — stack по вертикали (1fr = 100%).

### Command palette rewrite

Полная замена прежней hardcoded-палитры на declarative registry.

**`lib/commands/registry.ts`** — массив `CommandEntry`:

```ts
type CommandEntry = {
  id: string                    // unique, e.g. 'nav.approvals'
  label: string                 // UI label (RU)
  group: 'navigation' | 'actions' | 'system'
  roles: UserRole[]             // которым доступно
  href?: string                 // static navigation
  action?: 'logout' | 'create-organization' | ...  // custom handler
  icon?: LucideIcon
  keywords?: string[]           // для fuzzy search ("одоб" → "Заявки")
  shortcut?: string[]           // e.g. ['⌘', 'B']
}
getCommandsForRole(role: UserRole): CommandEntry[]
```

Invariant: каждый entry имеет `href || action` (проверено тестом). Role-фильтрация — pure-function (тестируема без React).

**`lib/commands/use-commands.ts`** — hook возвращает `{commands, execute}`:

```ts
execute(cmd):
  cmd.href       → router.push(cmd.href)
  cmd.action:
    'logout'              → logout() + router.push('/login')
    'create-organization' → router.push('/organizations?create=true')
```

Паттерн `?create=true` — простое cross-page dialog orchestration (см. ниже) вместо lifted state или Zustand store.

**`components/ui/command-palette.tsx`** — cmdk fuzzy search + framer-motion spring modal:

- Toggle через `useKeyboard('cmd+k')` hook.
- Groups из `COMMAND_GROUP_ORDER` — headers «Переход» / «Действия» / «Система».
- Fuzzy value: `value={cmd.label + ' ' + cmd.keywords.join(' ')}` — cmdk матчит по concat-строке, поэтому «одоб» находит «Заявки на рассмотрение» через keyword «одобрение».
- Motion: spring `{stiffness: 340, damping: 28}` на контент + backdrop fade (0.15s). Overlay `z-40`, content `z-50`.
- `handleSelect` делает `setOpen(false)` + 50ms `setTimeout(() => execute(cmd))` — modal успевает закрыться до navigation, иначе StaggerList на next page «перепрыгивает».
- Accessibility: `role="dialog"` на motion.div (с biome-ignore — native `<dialog>` имеет top-layer/focus-trap семантику которую мы не хотим, backdrop/Escape обрабатываем сами).

### Тесты: jsdom + cmdk caveat

cmdk Item's `onSelect` не фаерится надёжно через `fireEvent.click`/`userEvent.click` в jsdom (Primitive.div wrapping + React 19 synthetic events + cmdk's store-driven state). Тесты палитры покрывают UI-surface (render, grouping, role-filter, fuzzy search, keyboard toggle, Escape). Интеграционная часть («select item → execute → router.push») покрыта в `use-commands.test.ts` — execute-функция pure и тестируется напрямую.

### URL-state: `?create=true` cross-page

`/organizations` читает `params.get('create') === 'true'` → open CreateOrganizationDialog. Закрытие — `setParam('create', null)` (см. §12a URL-state pattern).

Профит: команда «Создать организацию» из палитры на `/dashboard` → `router.push('/organizations?create=true')` → страница открывается с уже-открытым dialog. Проще чем global Zustand dialog store или lifted state.

---

## 12c. Owner cabinet foundation (B3-UI-3a)

Первая вертикаль owner-кабинета: role-aware dashboard + Sites CRUD + MapLibre foundation. Задаёт паттерны, которые повторят следующие вертикали owner'а (cranes 3b, operators+hire 3c).

### Role-switch на `/dashboard`

`app/(app)/dashboard/page.tsx` — тонкий switch:

```tsx
if (user.role === 'superadmin') return <SuperadminDashboard />
if (user.role === 'owner')      return <OwnerDashboard />
useEffect(() => { if (user.role === 'operator') router.replace('/') }, [...])
```

Один URL `/dashboard` для всех привилегированных ролей. Компоненты кабинетов (`components/dashboard/superadmin-dashboard.tsx`, `components/dashboard/owner-dashboard.tsx`) — полные verticals со своей загрузкой данных; page-файл не знает о конкретных props, только маршрутизирует.

Root redirect (`app/(app)/page.tsx`): `if (user.role === 'superadmin' || 'owner') router.replace('/dashboard')`. Operator остаётся на `/` с welcome-card.

### OwnerDashboard layout

- **Hero** — `Здравствуйте, ${user.name}` (fallback `Обзор организации`) + plural subtitle `${n} ${pluralRu(n, SITES_FORMS)} активно`. `SITES_FORMS = ['объект','объекта','объектов'] as const`.
- **Stats grid** — `grid-cols-2 lg:grid-cols-4 gap-3`: 1 реальный `StatCard` (Активные объекты, MapPin, href=/sites) + 3 `StatCardPlaceholder` (Краны / Крановщики / Финансы) с `"—"` + badge «Скоро». Placeholder-паттерн держит grid-shape стабильным при поэтапной доставке B3-UI-3b/3c.
- **2-col body** — `grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4`: `OwnerSitesMap` (карта active-объектов) + `RecentSitesList` (последние 5).

### Sites CRUD surface

- **`/sites`** (`app/(app)/sites/page.tsx`) — список с `FilterBar` (status: active/completed/archived) + кнопка «Новый объект» (только для owner'а). URL-state через `useSearchParams` + `router.replace` (не push): `?status`, `?open`, `?create=true`. Row click → `?open=<id>` (drawer), Create click → `?create=true` (dialog).
- **`CreateSiteDialog`** — двухшаговый wizard:
  - Step 1 («Данные»): name (required, max 120), address (optional, trimmed → `undefined` если blank).
  - Step 2 («Локация»): `MapPicker` — pin + radius-slider, onChange передаёт `{latitude, longitude, radiusM}` родителю. «Создать» disabled пока `value === null`.
  - «Назад» возвращает на step 1 без потери form-state.
- **`SiteDrawer`** — детали + status-specific footer: active → «Сдать объект» + «Архивировать»; completed → «Вернуть в работу» + «Архивировать»; archived → «Восстановить». Archive — inline confirmation (native `confirm()` в MVP, backlog — custom dialog).

### MapLibre + CARTO tile stack

`components/map/`:

- **`base-map.tsx`** — MapLibre wrapper, CARTO Positron/Dark raster tiles (`https://{a-d}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png`) — no API key, good enough для MVP. `onReady(map)` callback для layers, `initialCenter` + defaultZoom 11.
- **`map-style.ts`** — `DEFAULT_CENTER = [71.45, 51.17]` (Астана), tile-source config.
- **`sites-layer.tsx`** — markers + geofence-polygon layer; click on marker → `onSiteClick(site)`.
- **`map-picker.tsx`** — drop-pin UX для CreateSite: click on map → pin + circle; radius-slider (50–1000m). Reverse-geocoding в backlog.
- **`geofence-polygon.ts`** — Haversine destination-formula → 64-point polygon approximating circle. Throws on `radiusM ≤ 0`. Pure-function, unit-tested (±0.5% radius accuracy).

**Protomaps в backlog** — CARTO бесплатен но зависимость от third-party CDN; self-hosted Protomaps + custom style следующим шагом если возрастёт нагрузка.

### Навигация + команды

- `components/layout/nav-config.ts` — owner nav: `/dashboard` + `/sites` активированы (myCranes / myOperators / hireRequests остаются stubs).
- `lib/commands/registry.ts` — новые commands для owner: `nav.owner-dashboard` (LayoutDashboard, /dashboard), `nav.sites` (MapPin, /sites), `action.create-site` (Plus, action).
- `lib/commands/use-commands.ts` — branch `'create-site' → router.push('/sites?create=true')` (переиспользуем cross-page URL-state pattern из §12b).
- `lib/format/audit.ts` — `site.complete` вместо несуществующего `site.suspend`; labels для `site.activate` / `site.complete`.

### Site status transitions

Backend emits `site.create`, `site.update`, `site.activate`, `site.complete`, `site.archive` (см. `apps/api/src/modules/site/site.repository.ts`). Допустимые переходы:

- `active ↔ completed` (двусторонне: сдать / вернуть)
- `active → archived`, `completed → archived` (односторонне)
- `archived → active` (восстановить)

Web API module (`lib/api/sites.ts`) предоставляет separate endpoints `completeSite` / `activateSite` / `archiveSite` — не общий `setStatus`. `useSites*` hooks (TanStack Query) invalidate `qk.sites.*` + `qk.dashboard.*` на success.

### Testing caveats

WebGL в jsdom **не работает** — каждый тест, который тащит BaseMap/MapPicker/SitesLayer, моккает их как no-op:

```ts
vi.mock('@/components/map/base-map', () => ({ BaseMap: () => <div data-testid="base-map" /> }))
vi.mock('@/components/map/sites-layer', () => ({ SitesLayer: () => null }))
vi.mock('@/components/map/map-picker', () => ({ MapPicker: ({onChange}) => <button onClick={() => onChange({latitude:51.17, longitude:71.45, radiusM:200})}>pick</button> }))
```

`geofence-polygon.ts` тестируется pure (без map), radius accuracy проверяется вычислением Haversine-distance от центра до каждой вершины → все в ±0.5% от заданного radius.

---

## 12d. Owner cranes + cross-role approval workflow (B3-UI-3b)

Вторая вертикаль owner-кабинета: парк кранов с E2E approval-потоком — owner создаёт pending-заявку, superadmin одобряет на `/approvals?tab=cranes`, после одобрения owner может назначать на свои объекты.

### Backend mutations (ADR 0002 holding-approval)

`crane.policy.ts` (см. authorization.md §4.2b):

- `canApprove` / `canReject` — **только superadmin**. Owner НЕ одобряет свои же заявки (ключевой инвариант холдинга — внешний актор обязателен).
- `canAssignToSite` / `canChangeStatus` / `canResubmit` — gate `approval_status='approved'` (для resubmit — `'rejected'`); pending/wrong-state → 404 как scope-violation.
- `canDelete` — все approval-state'ы (для cleanup'а rejected); `canUpdate` — все кроме rejected (read-only).

Service-методы (`crane.service.ts`):

- `assignToSite(ctx, id, siteId)` → валидация same-org + `site.status='active'` → audit `crane.assign_to_site`.
- `unassignFromSite(ctx, id)` → audit `crane.unassign_from_site`.
- `resubmit(ctx, id)` → rejected → pending, обнуляет `rejectionReason` → audit `crane.resubmit`.
- `changeStatus(ctx, id, 'active'|'maintenance'|'retired')` — operational transitions через существующий метод (без изменений).

Routes (`crane.routes.ts`):

```
POST   /:id/assign-site         body {siteId}; approved + same-org site
POST   /:id/unassign-site       siteId → null
POST   /:id/activate            status → active (требует approved)
POST   /:id/maintenance         status → maintenance (требует approved)
POST   /:id/retire              status → retired (требует approved)
POST   /:id/resubmit            rejected → pending (owner own / superadmin)
```

### Dashboard owner-stats endpoint

`GET /api/v1/dashboard/owner-stats` (owner-only, `dashboardPolicy.canViewOwnerStats`) — отдельный от superadmin'ского `/dashboard/stats`. Сервис `dashboardService.getOwnerStats(ctx)` scoped по `ctx.organizationId` (owner всегда имеет primary org, см. CLAUDE.md rule #13). DTO:

```ts
type OwnerDashboardStats = {
  active:  { sites: number; cranes: number; memberships: number }
  pending: { cranes: number; hires: number }
}
```

### Web surface

- **`CreateCraneDialog`** (`components/cranes/create-crane-dialog.tsx`) — одношаговый react-hook-form + zod.
  - Required: `model` (≤200), `capacityTon` (>0, до 999 999.99, comma-decimal `5,5 → 5.5`).
  - Optional: `inventoryNumber` (≤100), `boomLengthM` (>0, до 9 999.99, comma-decimal), `yearManufactured` (1900..currentYear), `notes` (≤2000).
  - `Controller`-wrapped `<select>` для type (4 варианта tower/mobile/crawler/overhead).
  - Submit success → toast `Заявка отправлена на одобрение / Платформа рассмотрит в течение 1–2 дней`, `reset()` + `onOpenChange(false)`.
  - Backend error → `toast.error('Не удалось создать', { description: isAppError(err) ? err.message : 'Попробуйте ещё раз' })`.

- **`CraneDrawer`** (`components/drawers/crane-drawer.tsx`) — role-aware footer:
  - `superadmin && pending` → Approve/Reject (через shared `RejectDialog`).
  - `(owner|superadmin) && rejected` → «Отправить повторно» (Send icon).
  - `canManage && approved` → status-specific footer:
    - `active` → «Списать» (ghost) + «На ремонт» (primary, Hammer icon)
    - `maintenance` → «Списать» (ghost) + «В работу» (primary, Power icon)
    - `retired` → «Восстановить» (primary, RotateCcw icon)
  - **Inline retire confirmation** — `confirmRetire` state flip (НЕ native `confirm()` как у sites): первый клик «Списать» → footer перерисовывается в «Отмена / Списать»; второй клик подтверждает; «Отмена» откатывает state. Pattern масштабируется на любые destructive-actions.
  - `canManage = (isOwner && user.organizationId === crane.organizationId) || isSuperadmin`.

- **`AssignmentInline`** (внутри `CraneDrawer` body) — `Combobox` (только для approved + status≠retired):
  - Source: `useSites({ status: 'active', limit: 100 })` — серверная фильтрация по статусу + scope (backend сам ограничит owner'а его org'ом).
  - `onChange(next)` → если `next === null` → `unassign.mutateAsync(crane.id)`, иначе `assign.mutateAsync({id, siteId: next})`.
  - Toasts: «Кран привязан к площадке» / «Кран снят с площадки» / «Не удалось обновить привязку».

### `/my-cranes` page

`app/(app)/my-cranes/page.tsx` — owner-only (non-owner → `router.replace('/')` в useEffect, render guard `if (!user || user.role !== 'owner') return null`).

- **FilterBar** — `SearchInput` (debounced 300ms, search by model/inventoryNumber) + `FilterChip`'ы Approval / Type / Status.
- **URL-state** — `?search/?approval/?type/?status/?open/?create` через `router.replace` (не push).
- **Backend scoping** — backend сам scopes список по `ctx.organizationId` для role=owner; **`organizationId` в query НЕ передаём** (попытка передачи была бы no-op + потенциальная атака на cross-org enumeration).
- **Client-side filter по type** — server не фильтрует по `crane.type` на MVP (см. backlog: serverside type filter); делаем `all.filter()` на загруженной странице. Search/approval/status/cursor-pagination — server-side.
- **Empty state** — context-aware: «Ничего не найдено по фильтрам» если есть фильтры, иначе «У вас пока нет кранов» + CTA «Добавить первый кран» → `setParam('create', 'true')`.
- **Drawer + Dialog** — `CraneDrawer` (open via `?open`) + `CreateCraneDialog` (open via `?create=true`).

### Map: CranesLayer

`components/map/cranes-layer.tsx` — рендерит cranes **сгруппированными по siteId**:

- Группировка: `Map<siteId, Crane[]>`; cranes без `siteId` («на складе») и cranes с unknown site **не отображаются**.
- Один маркер на site с count-badge'ем при `length > 1`.
- Маркер — квадрат (`rounded-[3px] bg-brand-400`), визуально отличается от круглых site-маркеров.
- Element offset `translate(8px, -8px)` — anchor на правый-верх site-маркера, не перекрывает его.
- Click → `onCraneClick(list[0])` (открываем первый из группы; на MVP без picker'а для группы — backlog).
- Пересоздаёт markers при изменении `cranes` или `sites` (full diff cleanup).

### Integration в OwnerDashboard

`OwnerSitesMap` теперь рендерит **два слоя поверх `BaseMap`**:

```tsx
<BaseMap initialCenter={initialCenter} onReady={setMap} />
<SitesLayer  map={map} sites={sites}  onSiteClick={s => router.push(`/sites?open=${s.id}`)} />
<CranesLayer map={map} sites={sites} cranes={cranes} onCraneClick={c => router.push(`/my-cranes?open=${c.id}`)} />
```

`useCranes({ approvalStatus: 'approved', status: 'active', limit: 100 })` — только approved+working краны попадают на карту.

`OwnerDashboard` stats: «Краны в работе» продвинут из `StatCardPlaceholder` в реальный `StatCard` (href=/my-cranes, value=`stats.active.cranes`). Source данных полностью заменён: hero plural-subtitle, «Активные объекты» и «Краны в работе» теперь читают `useOwnerDashboardStats()` вместо старого `useSites({status:'active'}).items.length`. Placeholder'ов осталось 2 (Операторы на смене + Расходы за месяц — будут заполнены в B3-UI-3c/B3-финансы).

### Commands + nav + audit

- `lib/commands/registry.ts` — owner получает `nav.my-cranes` (IconCrane, `/my-cranes`) + `action.create-crane` (Plus, action).
- `lib/commands/use-commands.ts` — branch `'create-crane' → router.push('/my-cranes?create=true')` (повтор cross-page URL-state pattern из §12b).
- `components/layout/nav-config.ts` — owner sidebar: `nav.myCranes.href` переключён с `/` (stub) на `/my-cranes`.
- `lib/format/audit.ts` — добавлены три новые actions: `crane.assign_to_site` (Link2, «Кран привязан к объекту»), `crane.unassign_from_site` (Link2Off, «Кран снят с объекта»), `crane.resubmit` (Send, «Заявка отправлена повторно»). Добавление новой audit-action — одна запись в registry.

### Hooks pattern

`lib/hooks/use-cranes.ts`:

- `useApproveCrane()` — **optimistic update** через `setQueriesData` flip `approvalStatus → 'approved'`, `onError` rollback из snapshot, `onSettled` invalidate `qk.cranes` + `qk.dashboard`. Pattern переиспользован из B3-UI-2d (см. §12b).
- Остальные мутации (`useAssignCraneToSite/useUnassignCraneFromSite/useActivateCrane/useSetCraneMaintenance/useRetireCrane/useResubmitCrane`) — простой invalidate `qk.cranes` + `qk.craneDetail(id)` + (для status-changes) `qk.dashboard`.
- `useOwnerDashboardStats(enabled = true)` — отдельный hook для `getOwnerDashboardStats`, queryKey `qk.dashboardOwnerStats`, staleTime 15s.

### Testing caveats

- **CranesLayer** — `vi.mock('maplibre-gl', () => ({default: {Marker: markerCtor}, Marker: markerCtor}))`. `markerCtor` — `vi.fn(() => ({setLngLat, remove}))` где `setLngLat` возвращает `{addTo}`. Тесты ассертят `markerCtor.mock.calls[0][0].element` для проверки DOM-структуры (count-badge как `span`, click handler).
- **CraneDrawer multi-role tests** — pattern mutable `mockUser`:
  ```ts
  const mockUser = { value: { id, role, organizationId, name } }
  vi.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: mockUser.value, ... }) }))
  function asOwner(orgId = 'o-1') { mockUser.value = { ..., role: 'owner', organizationId: orgId } }
  function asSuperadmin() { mockUser.value = { ..., role: 'superadmin', organizationId: null } }
  beforeEach(() => { asSuperadmin() })
  ```
  Каждый тест-кейс сам вызывает `asOwner(...)` если нужна owner-перспектива. Альтернатива (отдельные suite'ы на роль) — overkill для одного компонента.
- **Owner-dashboard tests** — продолжаем моккать `BaseMap/SitesLayer/CranesLayer` как no-op (WebGL в jsdom не работает; см. §12c testing caveats).
- **`getOwnerDashboardStats` mock** — все тесты `OwnerDashboard` мокают и `listSites`, и `getOwnerDashboardStats`; забыть второе → flaky на cards «Активные объекты» / «Краны в работе».

---

## 12e. Owner hires + operators management (B3-UI-3c)

### Workflow phase split

Отношение owner ↔ оператор имеет две фазы с разной UX-семантикой: **submit → await** (workflow) и **ongoing management** (stable). Отдельные routes отражают это:

- `/hire-requests` — workflow-страница. Только pending hires, доступна CTA «Нанять крановщика».
- `/my-operators` — management-страница. Только approved memberships, FilterBar (status/search), DataTable. Здесь делается block/activate/terminate.

Rejected hires скрыты в MVP (бесконечный накопитель без CTA удаления). Rejected-tab или dedicated page — backlog.

Альтернатива (single `/my-operators` с approval filter) отвергнута: mental-models разные (submit-form vs management-table), микс pending со stable создавал бы шум в управлении.

### License invariant pragmatic

Owner может подать hire-request даже для crane_profile с `licenseStatus='missing'` или `'expired'`. Warning banner в step 2 CreateHireRequestDialog объясняет последствия, но submit **не блокируется**. Реальный work-gate — `canWork` (ADR 0005, rule #15, 3-gate: profile approved AND hire approved+active AND license valid).

Обоснование: блокировать hire-request при expired license создаёт dead-lock — оператор может получить оффер на работу и уже в процессе обновления документов. UI warning сохраняет владельца awareness, backend `canWork` всё равно блокирует реальный выход на смену.

### Status state machine (operators)

```
active  ↔ blocked        (bidir)
active  →  terminated    (terminal)
blocked →  terminated    (terminal)
terminated → ∅           (irreversible)
```

`OPERATOR_STATUS_TRANSITIONS: Record<OperatorStatus, ReadonlySet<OperatorStatus>>` в `organization-operator.service.ts`. Попытка transition'а вне allowed set → 409 `INVALID_STATUS_TRANSITION`.

Terminated — terminal by policy: restart = новая hire-request (softDelete освобождает UNIQUE-slot (craneProfileId, organizationId, deletedAt IS NULL); identity на crane_profile не трогается — тот же человек может быть перенанят в эту же или другую организацию). Это simpler audit trail: «кого уволили, когда» однозначно через audit_log + terminatedAt.

### UI flows

**CreateHireRequestDialog** — two-step (pattern совпадает с CreateSiteDialog, §12c):

1. Search: `SearchInput` (debounce 300ms), `min 2 chars` UI-gate (показ hint; query fire'ит в background для simplicity, это OK — backend ограничивает limit=20), `useCraneProfiles({approvalStatus:'approved', search, limit: 20})`. `ProfileSearchResult` — radio-style `<button>` с `aria-pressed`, selected = border brand-500, 44px min-height.
2. Confirm: summary card (Avatar + ФИО + IIN + LicenseStatusBadge), license warning banner conditional, `<input type="date">` hiredAt (default today через `todayISODate()`, max +1 год через `maxFutureDate(1)`), Назад + Создать заявку.

409 `OPERATOR_ALREADY_HIRED` ловится в `handleSubmit` → специальный toast «Этот крановщик уже работает в вашей компании» (остальные ошибки — generic через AppError.message).

**OrganizationOperatorDrawer footer** — role+status aware matrix:

```
(superadmin, pending)    → [Одобрить][Отклонить]       (B3-UI-2b)
(superadmin, approved)   → ∅ (read-only identity view)
(superadmin, rejected)   → rejection reason notice
(owner, pending)         → ∅ (workflow pending — нет cancel flow в MVP)
(owner, approved.active)    → [Приостановить][Уволить]
(owner, approved.blocked)   → [Разблокировать][Уволить]
(owner, approved.terminated) → «Сотрудник уволен · <дата>»
(owner, rejected)        → rejection reason notice
(owner, not-own-org)     → ∅ (cross-tenant hidden)
```

`canManage` = `isOwner && hire.organizationId === user.organizationId` OR `isSuperadmin`.

Block-flow: click `[Приостановить]` → `setMode('block')` → footer reveals inline `<textarea>` (optional reason, max 300 chars, autoFocus) + [Отмена][Приостановить (submit)]. Empty reason → `undefined` в payload (строка-trim-check).

Terminate-flow: click `[Уволить]` → `setMode('terminate-confirm')` → footer reveals warning text «Это действие нельзя отменить. Для повторного найма понадобится новая заявка.» + [Отмена][Да, уволить]. Inline confirmation (не native `confirm()`) — консистентно с crane retire в §12d.

### Dashboard metric reuse

OwnerDashboard placeholder «Операторы на смене» → real `StatCard` «Активные операторы» с `stats.active.memberships` (backend `getOwnerStats` уже возвращает этот field с B3-UI-3a). Field semantics: approved+active memberships в own org.

«Операторы на смене» (real-time from mobile shifts) — отложено до shifts-endpoint. Grid 4 cards: Sites / Cranes / Operators / Expenses-placeholder.

### Three pipelines complete

После B3-UI-3c все три approval pipelines работают end-to-end:

1. **crane_profile** registration (B2d-3 SMS signup → B3-UI-2b approve)
2. **organization_operator** hire (B3-UI-3c submit → B3-UI-2b/2c approve)
3. **crane** submission (B3-UI-3b submit → B3-UI-2b/2c approve)

Owner full workflow: create site → submit crane → submit hire. Superadmin одобряет каждый gate. Все три surface'а разделяют общие паттерны: `TabsPills` в `/approvals`, `DataTable` + filters в global lists, `Drawer` + role-aware footer, optimistic mutations + rollback.

### Testing caveats

- **`buildOptimisticStatusMutation` закрывает mutationFn через explicit lambda** `(id: string) => mutationFn(id)` — react-query v5 передаёт `(vars, context)` во внутренний mutationFn, и прямой reference ломает `toHaveBeenCalledWith('h-1')` assertions. Wrapper-lambda дропает context-arg.
- **`useCraneProfiles` внутри CreateHireRequestDialog** всегда вызывает API даже при search-length < 2 (гейтинг только UI-rendering). Тесты проверяют, что `screen.queryByText(<result>).not.toBeInTheDocument()` — НЕ `expect(list).not.toHaveBeenCalled()`.
- **FilterChip/DropdownMenu** в тестах — использовать `screen.getByLabelText('Фильтр: <label>')` для trigger + `findByText` для option (item'ы mount'ятся после open). `getByText` на закрытом dropdown не находит option.
- **Terminate-confirm mutation test flaky** в jsdom при paired с optimistic update (click «Да, уволить» → optimistic flip → invalidate → re-fetch). Разделили на два теста: (1) confirmation UI appears + mutation НЕ вызвана до подтверждения; (2) mutation itself — через hook test без drawer UI (optimistic flip assertions через `setQueriesData`).

---

## 12f. Operator web cabinet (B3-UI-4)

### Scope rationale

Operator primarily использует mobile app (смены/GPS/СИЗ/incidents, M1-M8). Web cabinet — minimal surface для edge cases:

- Upload license с ноутбука (частый сценарий: новое удостоверение, сканер на компьютере)
- Check approval status (после submit через public registration — operator заходит проверить «одобрили ли меня»)
- View memberships (где я работаю + rejection reasons если отклонили)

Не daily workflow — operator открывает web изредка. staleTime на queries адекватен 60s (не hot-path).

### Three-page structure

- `/me` — overview landing: MeStatusCard (canWork indicator) + MeIdentityCard + MeLicenseCard + MeMembershipsSummary (first 3)
- `/license` — dedicated upload + detail с expiry formatting + warning banners
- `/memberships` — read-only list с MembershipDrawer для extended details

Все три pages используют same `useMeStatus` query — single source of truth. DTO `/me/status` возвращает всё нужное (profile + memberships + licenseStatus + canWork + canWorkReasons) одним запросом. Operator **не может** fetch memberships через `/organization-operators` (policy filters by organizationId которого operator не имеет в ctx — возвращает empty list).

### `/me/status` DTO evolution (B3-UI-4)

Минимальный mobile-shape (B2d-3) расширен для web:

```ts
// Before (B2d-3 mobile):
{ profile: {id, approvalStatus, rejectionReason}, memberships: [...], licenseStatus, canWork }

// After (B3-UI-4):
{
  profile: FullCraneProfileDTO,  // toPublicDTO — identity + phone + license
  memberships: [{
    ...,
    hiredAt, approvedAt, rejectedAt, terminatedAt, rejectionReason  // new
  }],
  licenseStatus,
  canWork,
  canWorkReasons: string[]  // new — empty when canWork=true
}
```

Backward-compatible additive — flat `organizationName` на membership сохранён (mobile). Web использует full shape.

### License upload flow

Three-phase orchestration в `useUploadLicense` mutation:

1. **Request URL** — `POST /me/license/upload-url` {contentType, filename} → {uploadUrl, key, version, headers, expiresAt}
2. **Client PUT** — `fetch(uploadUrl, {method:'PUT', body: file, headers: {'Content-Type': file.type, ...backendHeaders}})` — прямая загрузка в MinIO (не через backend — byte-heavy bypass backend)
3. **Confirm** — `POST /me/license/confirm` {key, expiresAt} → HEAD + prefix-match + atomic state update (увеличивает licenseVersion, обнуляет warning flags)

Error boundaries:
- Client-side pre-upload validation (content-type + size) — **inline error** в FilePicker (НЕ toast, less disruptive)
- Step 2 non-OK → LICENSE_UPLOAD_FAILED — toast + **keep dialog open** для retry
- Step 3 AppError (e.g., LICENSE_CONFIRM_KEY_MISMATCH) — toast с server message

`onSuccess` invalidates `qk.meStatus` — UI re-fetches, canWork flips если license был блокером, licenseStatus badge обновляется.

### FilePicker primitive

Reusable drag-drop zone в `components/ui/file-picker.tsx`. Structure ограничена useSemanticElements lint-rule:

```
<div>  (drag-handlers)
  <input type="file" className="sr-only">
  <button onClick={openPicker}>   (primary — opens native picker)
    <!-- content: placeholder OR file metadata -->
  </button>
  <button> (optional — remove file)  (sibling, не nested)
</div>
```

Nested `<button>`s запрещены biome's `useSemanticElements` — remove-button рендерится как sibling с `absolute` positioning. Drag-drop не работает на mobile (как обычно), но tap → native file picker.

### Testing caveats

- **Dialog portal rendering** — `container.querySelector('input[type="file"]')` возвращает null потому что RadixDialog.Portal рендерит content вне component root. Use `document.querySelector` или `screen.*` queries.
- **`userEvent.upload` respects accept attr** — файл с non-matching type молча не триггерит onChange. Для invalid-type validation tests используй `fireEvent.change(input)` после `Object.defineProperty(input, 'files', {value: [file]})` — bypass accept-check, имитирует drop или user-clicks-through.
- **jsdom + globalThis.fetch mocking** — `const originalFetch = globalThis.fetch; globalThis.fetch = mock; afterEach(() => { globalThis.fetch = originalFetch })`. Vitest не auto-restores globals.
- **`canWorkReasons` order deterministic** — service computes в фиксированном порядке (profile → hire → license). Tests assert через `.toContain` или `arrayContaining` — НЕ positional equality (добавление нового reason-типа не должно ломать тесты).

### Role redirect semantics

Root `(app)/page.tsx` routes by role:
- superadmin → `/dashboard` (platform overview)
- owner → `/dashboard` (org-scoped overview, B3-UI-3a)
- operator → `/me` (self-profile)

Operator НЕ имеет dashboard — role не уполномочена видеть aggregate stats. `/me` полностью заменяет dashboard concept для этой роли: canWork status + identity + license quick-access + memberships summary.

### Read-only memberships invariant

Operator видит memberships (approved/pending/rejected/blocked/terminated) но **не может** mutate:
- No create — owner action (owner submits hire-request)
- No terminate — owner action
- No approve/reject — superadmin action

Это consistent с ADR 0003 (M:N hire model — owner как hirer, superadmin как approver). Rejection reasons surfaced critical UX — operator понимает WHY отклонили (может быть identity issue → admin path через superadmin).

---

## 12g. Public marketing landing (B3-LANDING)

Публичный маркетинг-лендинг на `/` (заменяет Tilda template `jumix.kz`). Cabinet остаётся через `/login` — production routing `jumix.kz` vs `app.jumix.kz` будет настроен через nginx в deploy-mini-vertical, в B3-LANDING — single domain в dev.

### Routing structure

```
src/app/
  layout.tsx                  # root: html lang="ru" dark + providers (НЕ меняется)
  (marketing)/                # ← новый route group, public, без auth
    layout.tsx                # body data-marketing="true" + Header + Footer
    marketing.css             # CSS переменные scoped через [data-marketing]
    page.tsx                  # main landing
    privacy/page.tsx
    terms/page.tsx
  (auth)/                     # login flow (existing)
    layout.tsx                # ← MODIFIED: redirect role-aware
    login/...
  (app)/                      # cabinet (existing)
    layout.tsx                # auth-gated
    dashboard/, sites/, ...   # (app)/page.tsx УДАЛЁН — root теперь marketing
  sitemap.ts                  # ← новое
  robots.ts                   # ← новое
```

`(app)/page.tsx` (старый role-redirect stub) удалён — `(marketing)/page.tsx` теперь owns root URL `/`. `(auth)/layout.tsx` теперь редиректит authed user сразу в кабинет (`operator → /me`, остальные `→ /dashboard`), потому что `/` стал public landing.

### Visual divergence — marketing vs admin

Admin cabinet — dense, productivity-focused, info-rich. Marketing — generous spacing, premium scroll-driven анимации, более глубокий dark palette. Разделены через `data-marketing="true"` body-attribute scoping `marketing.css` переменных:

| | Admin (`globals.css`) | Marketing (`marketing.css`) |
|---|---|---|
| BG | `--color-layer-0: #0a0a0b` | `--m-bg: #07070a` (deeper) |
| Surface | `--color-layer-2: #18181b` | `--m-surface: #0e0e12` |
| Brand | `--color-brand-500: #f97b10` | `--m-brand: #f97b10` (shared) |
| Radius | `--radius-lg: 12px` | cards 16px, badges full |
| Section padding | `p-4 md:p-8` | `py-20 md:py-32 px-5 md:px-8` |
| Container | `max-w-7xl` | `max-w-7xl` (matches) |

Premium ease константа `cubic-bezier(0.22, 1, 0.36, 1)` — везде в marketing motion. CSS-only utilities `m-card-glow` (gradient border ::before), `m-cta-glow` (box-shadow expansion + translate -1px), `m-radial-hero` (hero radial gradient), `m-grid-bg` (faint dotted grid с radial mask), `m-pulse-dot` (live indicator keyframe).

### i18n — переиспользуем существующий `t()` helper

**next-intl НЕ устанавливаем** — CLAUDE.md rule #16 preserved. Существующий `lib/i18n.ts` `t(key, vars?, locale?)` подходит, добавлен новый `tList<T>(key)` для не-строковых значений (массивы items в sections). Контент в `messages/ru.json` под namespace `marketing.{...}`. KZ/EN — empty placeholders (`marketing: {}`); URL routing для `/kk`/`/en` — backlog когда контент готов.

### Animations — framer-motion scroll-triggered

- `<AnimatedSection>` — wrapper с `whileInView` + `viewport: { once: true, amount: 0.2 }`, fade-up 28px @ 0.7s
- `<StaggeredChildren>` + `<StaggerItem>` — sequential reveal (0.08s stagger)
- `<HeroSection>` — staggered manual variants (tagline → h1 → subtitle → CTAs → mockup), delays 0/100/200/300/400ms
- `<DashboardMockup>` — mouse parallax (max 14px) через `useMotionValue` + `useSpring stiffness:80, damping:14`. Inner content opposite direction (max 8px) — depth illusion. Chart bars `scaleY` rise on viewport entry.
- `<PhoneMockup>` — таймер `setInterval(1s)` decorative tick (статичный demo, не настоящая смена)
- Везде `useReducedMotion()` ветка — раздаёт raw children без motion если pref enabled
- CSS `@media (prefers-reduced-motion: reduce)` глобально клампит anim/transition к 0.01ms

### SVG mockups — inline, НЕ screenshots

Три mockup-компонента в `components/marketing/visuals/`:
- `<DashboardMockup>` — browser frame + 6-item sidebar + 4 stat cards + animated chart + 3-row table + floating "Активная смена" overlay card
- `<PhoneMockup>` — iPhone frame + active shift screen с timer + stat cards + mock buttons
- `<StepIllustration variant={1|2|3}>` — registration / site-assignment / digital-tracking abstract illustrations

Wrapper `role="img"` + `aria-label`. Decorative inner SVGs — либо lucide-react React-components (биome не flag'ает), либо собственный `<title>` (для satisfying `noSvgWithoutTitle` биome rule).

### WhatsApp CTA pattern

```ts
// whatsapp.ts (non-client utility — server и client могут import)
export const WHATSAPP_NUMBER = '77022244428'
export function whatsappLink(message?: string): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message ?? defaultMsg)}`
}
```

Helper extracted в **non-client** `whatsapp.ts` модуль — server components (Footer) должны импортировать. Если оставить export в `whatsapp-button.tsx` (`'use client'`), Next.js refuses cross-boundary call. Default message — "Здравствуйте, интересует Jumix" из `marketing.whatsappMessage`. Все `<a>` — `target="_blank" rel="noopener noreferrer"` обязательно.

### SEO

- `lib/marketing-metadata.ts` — `landingMetadata()`/`privacyMetadata()`/`termsMetadata()` factories. `title: { absolute: ... }` чтобы не вешать `· Jumix` template из root layout.
- `app/sitemap.ts` — 3 URLs (`/` priority 1.0, `/privacy` + `/terms` priority 0.3)
- `app/robots.ts` — allow `/`/`/privacy`/`/terms`, disallow ВСЕ cabinet routes (`/login`/`/dashboard`/`/me`/etc.) + `/api/`
- JSON-LD `Organization` (KZ address + +7 phone + ru/kk languages) + `WebSite` (inLanguage `ru-KZ`) — inject через `<script type="application/ld+json">` в `(marketing)/page.tsx`
- OG + Twitter cards в metadata helpers; OG image — `/brand/logo-full.png` placeholder (динамическая generation через `@vercel/og` — backlog)

### Privacy / Terms — boilerplate с TODO для legal review

Оба документа — 7 sections each + intro + contacts. Privacy: данные / цели / передача 3-м лицам / сроки хранения / права / безопасность / изменения. Terms: предмет / права+обязанности user / права+обязанности operator / IP / ответственность / расторжение / applicable law. Каждый завершается italic `<p>` notice "Документ требует юридической редактуры перед публичным запуском платформы." + inline `// TODO(legal):` comment. **Required перед M8 store submission** (App Store Connect / Google Play требуют publicly hostable privacy URL).

### Testing infrastructure

`tests/setup.ts` — добавлен IntersectionObserver mock alongside ResizeObserver (jsdom не реализует, framer-motion `useInView` требует). +30 tests: WhatsApp link encoding + target/rel attrs, login link href, header/footer rendering + correct hrefs, page composition (sections via stable IDs `id="pain-points"`/etc.), single h1 hierarchy, JSON-LD parse + types, privacy/terms rendering + section count + legal notice, metadata helper shape (canonical URLs + Organization JSON-LD + ru-KZ locale).

### Subdomain routing — отдельный mini-vertical

`jumix.kz` → marketing landing. `app.jumix.kz` → cabinet (login + protected routes). В B3-LANDING **единый домен** в dev (`localhost:3001/` = landing, `localhost:3001/login` = login). Production routing — deploy-vertical через nginx host-based vhost (или `next.config.ts rewrites` если nginx-less). НЕ в этом коммите.

---

## 13. Связанные документы

- [design-system.md](design-system.md) — цвет, typography, иконки, spacing.
- [authentication.md](authentication.md) — backend auth-flow, JWT, refresh rotation.
- [authorization.md](authorization.md) — RBAC, 404-вместо-403.
- [tech-stack.md](tech-stack.md) — обоснование stack'а монорепы.
- [backlog.md](backlog.md) — Web section (отложенные решения).
