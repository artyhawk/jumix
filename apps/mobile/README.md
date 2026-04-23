# Jumix Mobile

Expo SDK 54 + React Native 0.81 + React 19.1. Приложение крановщика — приняты смены, GPS-трекинг, подтверждение СИЗ, загрузка удостоверения.

**Статус (M1 — 2026-04-23):** foundation + SMS auth. Полноценные экраны — в M2–M8.

---

## Prerequisites

- **Node 22 LTS** + **pnpm 9+** (из root workspace)
- **iOS:** Xcode 15+, CocoaPods, iPhone simulator (macOS only)
- **Android:** Android Studio, JDK 17, Android SDK 34+
- **Real device** для UI testing — Expo Go из App Store / Google Play
- Backend доступен через `EXPO_PUBLIC_API_URL` (по умолчанию `http://localhost:3000`)

---

## Development

```bash
# Из root workspace
pnpm install

cd apps/mobile
cp .env.example .env
# Проверь EXPO_PUBLIC_API_URL — для dev используй IP ноутбука вместо localhost
# если тестируешь на реальном телефоне: http://192.168.1.100:3000

pnpm start
# Сканирует QR из Expo Go (iOS/Android) или нажми `i` / `a` для simulator/emulator
```

### Dev build (native modules)

Для некоторых native-зависимостей (secure-store, push, camera) Expo Go недостаточно — нужен dev build:

```bash
npx eas build --platform ios --profile development
npx eas build --platform android --profile development
```

Установка через ADB (Android) или TestFlight / Ad Hoc (iOS). **M8 закроет EAS Build pipeline**.

### iOS Simulator (быстрая итерация)

```bash
pnpm ios
# → xcrun simctl boot "iPhone 15" && open -a Simulator
```

### Android Emulator

```bash
pnpm android
# → adb-connected device/emulator запустит app
```

---

## Архитектура (M1)

```
apps/mobile/
├── app/                      # Expo Router file-based routing
│   ├── _layout.tsx           # Root: hydration + providers
│   ├── (auth)/               # Auth group (redirect если user есть)
│   │   ├── _layout.tsx
│   │   ├── login.tsx         # Phone + SMS request
│   │   ├── verify-otp.tsx    # 6-digit code
│   │   └── register.tsx      # New operator registration
│   ├── (tabs)/               # Authenticated group (redirect если нет user'а)
│   │   ├── _layout.tsx       # Bottom tabs
│   │   ├── me.tsx            # Profile (placeholder в M1, полный в M2)
│   │   ├── license.tsx       # License upload (placeholder, M3)
│   │   └── shifts.tsx        # Shifts (placeholder, M4-M6)
│   └── +not-found.tsx
├── src/
│   ├── components/
│   │   ├── ui/               # Button, Input, PhoneInput, OtpInput, SafeArea
│   │   └── splash-screen.tsx
│   ├── lib/
│   │   ├── api/              # client (apiFetch), auth, registration, errors
│   │   └── validation/       # phone format helpers (reuses @jumix/shared)
│   ├── stores/
│   │   └── auth.ts           # Zustand + SecureStore (refresh в keychain)
│   └── theme/
│       ├── tokens.ts         # colors/spacing/radius/font (mirrors web §8)
│       └── typography.ts     # StyleSheet presets
├── assets/                   # icon / splash / adaptive-icon (placeholders)
├── tests/setup.ts            # expo-secure-store + expo-router + burnt mocks
└── ...
```

### Auth flow

```
Cold start → hydrate():
  1. Read refresh + user JSON from SecureStore
  2. Call /auth/refresh с clientKind:'mobile' (TTL 90 дней)
  3. Success → populate store, splash closes, user routes на /(tabs)/me
  4. Fail → clear state, route на /(auth)/login

Login:
  1. Phone input → request /auth/sms/request
  2. Navigate → /verify-otp с phone param
  3. OTP input (6 digits, iOS/Android autofill) → /auth/sms/verify
  4. Store tokens → Expo Router redirects автоматически (auth layout check)

Registration:
  1. Identity form (ФИО + ИИН + phone) → /registration/start (OTP sent)
  2. OTP step → /registration/verify с identity + OTP
  3. Backend creates user + crane_profile (pending) + returns tokens
  4. Logged in → /(tabs)/me (user profile в pending awaiting superadmin)
```

### Token storage

- **Access token** — memory (Zustand, короткий TTL ~15 минут)
- **Refresh token** — `expo-secure-store` (iOS Keychain, Android EncryptedSharedPreferences)
- **User JSON** — `expo-secure-store` (чтобы восстановить identity после cold start без /me round-trip)

### Design system

Dark theme primary (matches web). `theme/tokens.ts` зеркалит `docs/architecture/design-system.md §8`. Touch targets всегда ≥ 44pt (Apple HIG / Material).

Brand orange — только для primary actions + active states (≤ 5% surface). Semantic colors (success/danger/warning) — state indicators, никогда не brand.

---

## Testing

```bash
pnpm test           # unit tests (vitest + jsdom + react-native-web)
pnpm typecheck      # TypeScript strict
pnpm lint           # biome
```

**49 тестов** покрывают: auth store + API client + phone validation + OTP input + Button + LoginScreen smoke.

### Testing caveats

- `react-native-web` alias в vitest → RN primitives рендерятся как HTML. Подходит для unit-проверок (логика, text render, клики), **не** для native gestures / touch events / autofill.
- **Real device testing** обязателен перед релизом — simulator approximates.
- `expo-router` / `expo-secure-store` / `burnt` замоканы в `tests/setup.ts`.

### Environment variables

| Переменная | Описание | Default |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | Base URL API backend | `http://localhost:3000` |

Prod: `https://api.jumix.kz` (настраивается в EAS build config, M8).

---

## Troubleshooting

### Metro не находит `@jumix/shared`

Проверь `metro.config.js` — `watchFolders` должен включать monorepo root:

```js
config.watchFolders = [workspaceRoot]
```

### "Cannot find module react-native" при `pnpm start`

```bash
# Очистка Metro cache + повторная установка
rm -rf node_modules .expo
pnpm install
pnpm start --clear
```

### Expo Go не может подключиться

- Проверь что ноут и телефон в одной Wi-Fi сети
- `EXPO_PUBLIC_API_URL` должен быть IP ноутбука (не `localhost`) при dev на устройстве

---

## Roadmap

- **M1** ✅ (this) — Scaffold + SMS auth + navigation
- **M2** — Profile screen (canWork indicator + memberships)
- **M3** — License upload (camera + gallery + presigned PUT)
- **M4** — Shifts list + start/end с GPS
- **M5** — GPS tracking во время смены + геозона
- **M6** — СИЗ checklist + incident reporting
- **M7** — Push notifications (FCM)
- **M8** — EAS Build pipeline + TestFlight / Play Internal

См. `docs/architecture/business-logic.md` + CLAUDE.md для деталей.
