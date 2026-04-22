# @jumix/web — Next.js 15 админ-портал

Веб-портал Jumix для суперадмина, владельца организации и ограниченного интерфейса крановщика.

Детали архитектуры — в [docs/architecture/web-architecture.md](../../docs/architecture/web-architecture.md).
Дизайн-система — в [docs/architecture/design-system.md](../../docs/architecture/design-system.md).

---

## Quickstart

**Требования:** Node 20+, pnpm 9+.

```bash
# Из корня монорепы
pnpm install

# Скопировать env
cp apps/web/.env.example apps/web/.env.local

# Запустить dev (Turbopack, порт 3001)
pnpm --filter @jumix/web dev
# → http://localhost:3001
```

Бэкенд (API на порту 3000) должен быть запущен параллельно. `NEXT_PUBLIC_API_URL` по умолчанию указывает на `http://localhost:3000`.

## Скрипты

| Команда | Что делает |
|---|---|
| `pnpm --filter @jumix/web dev` | Dev-сервер с Turbopack (3001) |
| `pnpm --filter @jumix/web build` | Production build |
| `pnpm --filter @jumix/web start` | Запуск production build (3001) |
| `pnpm --filter @jumix/web typecheck` | `tsc --noEmit` |
| `pnpm --filter @jumix/web lint` | Biome check |
| `pnpm --filter @jumix/web test` | Vitest (jsdom) |

---

## Структура

```
src/
├── app/                      # Next.js App Router
│   ├── (auth)/              # Публичные роуты: login, login/verify
│   ├── (app)/               # Защищённые роуты (под auth guard)
│   ├── globals.css          # @theme inline: токены дизайн-системы + анимации
│   └── layout.tsx           # Root layout: шрифты, провайдеры
├── components/
│   ├── ui/                  # Примитивы: Button, Input, Badge, Dialog, ...
│   ├── motion/              # Motion-обёртки: PageTransition, StaggerList, FadeSwap
│   ├── layout/              # Shell: Sidebar (desktop) + SidebarDrawer (mobile) + Topbar
│   └── auth/                # LoginForm, OtpForm
├── lib/
│   ├── api/                 # apiFetch + типы + мапперы ошибок + обёртки /auth
│   ├── auth-store.ts        # Zustand + persist(localStorage) + single-flight refresh
│   ├── phone-format.ts      # Маска +7 701 000 11 22 ↔ E.164
│   ├── i18n.ts              # t(key, vars?, locale) — минимальный runtime
│   ├── query-client.ts      # React Query configuration
│   └── utils.ts             # cn()
├── hooks/                   # useAuth, useMediaQuery, useKeyboard
├── providers/               # QueryProvider, AuthProvider, ToastProvider
├── messages/                # ru.json (полный), kz.json (placeholder)
└── config/env.ts            # NEXT_PUBLIC_API_URL и пр.
```

## Ключевые решения

- **Tailwind CSS v4** — конфигурация через `@theme inline` в `globals.css`, не `tailwind.config.ts`. Все токены дизайн-системы объявлены как CSS custom properties.
- **Motion-слой** — `framer-motion` везде со стандартной spring-физикой (`stiffness: 300, damping: 28`). `PageTransition`, `StaggerList`, `FadeSwap` — обёртки; явные анимации — через `motion.*` компоненты. Никаких `transition-all`, `animate-bounce/pulse/spin`.
- **Auth refresh — single-flight.** Модульно-уровневый `refreshingPromise` гарантирует, что параллельные 401-е разделяют один refresh-вызов и не дергают backend лавиной.
- **Storage — localStorage на MVP.** Zustand persist. Миграция на HttpOnly cookie — в [backlog](../../docs/architecture/backlog.md) (Web section).
- **Минимальный i18n.** Собственный `t()` с поиском по точечной нотации + `{var}` интерполяцией. `next-intl` — overkill для одной русской локали.

---

## Mobile-first responsive

Веб писался как first-class mobile SaaS. Все компоненты и экраны проверены вручную на 4 breakpoint'ах:

| Breakpoint | Контекст | Ключевые отличия |
|---|---|---|
| **375px** | iPhone SE / базовый телефон | Hamburger-menu, полноэкранные drawer'ы, 44px touch-targets |
| **768px** | iPad portrait | Сайдбар-иконки, компактный topbar |
| **1024px** | iPad landscape / малый ноут | Полный сайдбар 240px, breadcrumbs |
| **1440px** | Desktop | Max-width контейнеры, расширенные карточки |

**Правила:**
- Touch-targets: `min-h-[44px] md:min-h-0 md:h-9` на кнопках и инпутах. Никогда — меньше 44 по высоте на мобиле.
- Сайдбар → drawer при `<md`. Радикс Dialog + авто-закрытие на смене `pathname`.
- Модальные окна на телефоне → полноэкранные drawer'ы.
- Текст без «horizontal overflow» — любая длинная строка truncate либо wrap.
- Никогда не вешать `hover:` на touch-only surface — использовать `@media (hover: hover)` pattern через отдельные media-query-based utility.

### Ручной smoke-тест

Перед коммитом UI-изменений проверить на `375 / 768 / 1024 / 1440`:

1. `/login` — SMS-режим, password-режим toggle, ввод номера (маска), disabled state.
2. `/login/verify?phone=…` — 6 боксов, paste, auto-advance, shake on error, resend countdown.
3. `/` (после auth) — sidebar/drawer, topbar, welcome-страница. Cmd+K / Ctrl+K открывает палитру.
4. DevTools throttling → **Slow 3G** — skeleton'ы не заменяются спиннерами, кнопки остаются кликабельными.
5. iOS Safari (или DevTools → iPhone) — 44px тапы, нет zoom'а на фокус (у инпута font-size ≥ 16px).

---

## Тестирование

Unit — **Vitest + jsdom + Testing Library**. Всё через `pnpm --filter @jumix/web test`.

Покрытие (~60 тестов):
- `lib/` — phone-format, i18n, api/client (401-refresh, auth-header inject), auth-store (rehydrate, single-flight), utils.
- `components/ui/` — Button (variants/sizes/loading/block/asChild), Input (invalid, touch-target), Badge (каждый variant + withDot).
- `components/auth/` — LoginForm (phone mask, режимы, error-mapping), OtpForm (paste, auto-submit, shake, resend).
- `hooks/` — useMediaQuery.

**E2E / visual regression / a11y-audit** — в backlog.

---

## Связанные документы

- Детальная архитектура web: [web-architecture.md](../../docs/architecture/web-architecture.md)
- Дизайн-система: [design-system.md](../../docs/architecture/design-system.md)
- Auth-flow (backend): [authentication.md](../../docs/architecture/authentication.md)
- Backlog (что отложено): [backlog.md](../../docs/architecture/backlog.md) (section Web)
