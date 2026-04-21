# Tech stack

> Extracted from CLAUDE.md §2. Full list of technologies, versions, and rationale.

## 2.1 Backend

| Компонент | Выбор | Версия | Почему |
|---|---|---|---|
| Runtime | **Node.js** | 22 LTS | Экосистема, опыт команды |
| Язык | **TypeScript** | 5.x | strict mode обязателен |
| HTTP framework | **Fastify** | 5.x | Быстрее Express, встроенные JSON Schema, type-safe |
| Валидация | **Zod** | 3.x | Compile-time + runtime type safety |
| ORM | **Drizzle ORM** | latest | Type-safe SQL без рантайм-магии Prisma, легче читать генерируемые запросы |
| БД | **PostgreSQL** | 16 | ACID, PostGIS, RLS, JSONB |
| Геоданные | **PostGIS** | 3.4 | Геозоны, расчёт расстояний |
| Cache/queue | **Redis** | 7.x | Rate limit, cache, BullMQ backend |
| Job queue | **BullMQ** | 5.x | Отложенные задачи, cron, retry, DLQ |
| Файлы | **MinIO** (S3-совместимо) | latest | Удостоверения, фото СИЗ, фото неисправностей |
| Auth | `@fastify/jwt`, `argon2`, `@fastify/cookie` | — | См. [authentication.md](authentication.md) |

## 2.2 Frontend (веб)

| Компонент | Выбор | Почему |
|---|---|---|
| Framework | **Next.js 15** (App Router) | SSR, RSC для dashboards, Server Actions для форм |
| UI kit | **shadcn/ui** + custom компоненты | Полный контроль над стилями, без vendor lock |
| Styling | **Tailwind CSS v4** | Стандарт, хорошо работает с shadcn |
| State (client) | **Zustand** (локальный) + **TanStack Query** (server state) | Минимум boilerplate |
| Forms | **React Hook Form** + **Zod resolver** | Тот же Zod что на бэке |
| Tables | **TanStack Table** | Сложные таблицы с фильтрами, сортировкой |
| Maps | **MapLibre GL JS** + **Protomaps** | Open source, полный контроль стилей |
| i18n | **next-intl** | RU / KZ |
| API client | **openapi-fetch** + **openapi-typescript** | Автогенерация типов из OpenAPI |
| Icons | **Lucide** + **Tabler Icons** (домен-специфика) | Одинаковый stroke, кириллица-friendly |

## 2.3 Mobile

| Компонент | Выбор | Почему |
|---|---|---|
| Framework | **React Native** + **Expo SDK 52+** | Опыт команды, fast iteration |
| Navigation | **Expo Router** | File-based routing, deep linking |
| State | **Zustand** + **TanStack Query** | Консистентность с вебом |
| Secure storage | **expo-secure-store** | Keychain / EncryptedSharedPreferences |
| Biometric | **expo-local-authentication** | Re-auth для чувствительных действий |
| Location | **expo-location** | GPS с фоновым режимом |
| Push | **expo-notifications** → FCM | Android + iOS |
| Maps | **react-native-maps** (Yandex/2GIS tiles) | Familiar для локального пользователя |
| i18n | **i18n-js** или **expo-localization** | RU / KZ |

## 2.4 DevOps / Infrastructure

| Компонент | Выбор |
|---|---|
| Контейнеризация | **Docker** + **docker-compose** |
| Reverse proxy | **Nginx** + **Let's Encrypt** |
| Hosting | **Hetzner** (MVP) или **Cloud.kz / PS Cloud** при требовании data residency |
| CI/CD | **GitHub Actions** |
| Registry | **GitHub Container Registry** (GHCR) |
| Monitoring | **Uptime Kuma** (MVP) → Prometheus + Grafana (post-MVP) |
| Logs | json-file driver + ротация (MVP) → Loki (post-MVP) |
| Backup storage | S3-совместимое (Cloud.kz / Hetzner Storage Box) |

## 2.5 Testing

| Layer | Инструмент |
|---|---|
| Unit | **Vitest** |
| Integration (API) | **Vitest** + **Testcontainers** (PostgreSQL) + **fastify.inject()** |
| E2E (веб, minimal) | **Playwright** (2-3 критичных сценария) |
| Component tests | **React Testing Library** (только 3-5 сложных компонентов) |
| Mobile | Ручное через TestFlight / Internal Testing на старте |
| Coverage | **Vitest coverage** + **Codecov** (free) |

## 2.6 Code quality

| Что | Чем |
|---|---|
| Linting + formatting | **Biome** (замена ESLint + Prettier, быстрее в разы) |
| Sonar-правила | **eslint-plugin-sonarjs** как дополнение (если Biome не покрывает) |
| Secrets scanning | **gitleaks** в pre-commit hook |
| Pre-commit hooks | **lefthook** (быстрее husky) |
| Dependencies | **Dependabot** (GitHub) |
| AI code review | **CodeRabbit Pro** с `.coderabbit.yaml` под проект |
| Type check в CI | `tsc --noEmit` |
