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

- CRUD-страницы (organizations, sites, cranes, operators) — B3-UI-2+.
- Live-карта смен — Этап 2.
- Payroll UI — Этап 3.
- Marketplace + рейтинги — Этап 4.
- Notifications center + realtime — Этап 4.

Все страницы под `(app)/` будут добавляться инкрементально на существующий shell.

---

## 13. Связанные документы

- [design-system.md](design-system.md) — цвет, typography, иконки, spacing.
- [authentication.md](authentication.md) — backend auth-flow, JWT, refresh rotation.
- [authorization.md](authorization.md) — RBAC, 404-вместо-403.
- [tech-stack.md](tech-stack.md) — обоснование stack'а монорепы.
- [backlog.md](backlog.md) — Web section (отложенные решения).
