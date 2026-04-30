# ADR 0009 — Web theme architecture: light + dark

**Date:** 2026-04-30
**Status:** Accepted
**Authors:** Yerbol (ИП-исполнитель), Claude
**Slice:** B3-THEME-1..4

---

## Context

Весь web (admin cabinet B3-UI-2/3/4/5 + landing B3-LANDING + surveys
B3-SURVEY) был dark-only. Заказчик попросил light theme + toggle. По
умолчанию — light (его предпочтение для основной аудитории — стройкомпании
работают в офисах, где светлая тема привычнее). Mobile (Expo) остаётся
dark-only до отдельной вертикали M-THEME (StyleSheet tokens hardcoded под
dark, переписывание — отдельный scope в backlog).

Требования:
- Default — light, OS `prefers-color-scheme` уважается на first visit.
- Manual toggle везде (admin + marketing + surveys).
- Persistence: localStorage для anonymous, DB для logged-in (sync на login).
- Все web surfaces поддерживают обе темы: cards, drawers, dropdowns, charts,
  карты MapLibre, SVG mockups в landing, форма опросов.
- WCAG AA contrast в обеих темах. Brand orange `#F97B10` — same в обеих
  темах (design-system §8.2).
- Smooth switch без flash of unstyled content.

---

## Decision

### 1. CSS variables как single source of truth

**НЕ** используем Tailwind `dark:` modifiers. Они дают overlapping classes
(`bg-white dark:bg-black`), сложно maintain, и на каждом компоненте нужно
дописывать пары — scale problems на 100+ компонентов.

**Используем CSS variables** на `:root, .theme-light` (default) +
`.theme-dark` (override). Components читают через `var(--color-X)` или
Tailwind utility (`bg-layer-0`, `text-text-primary`), которая через Tailwind
v4 `@theme inline { --color-layer-0: var(--layer-0); }` указывает на ту же
переменную. Theme switch — single class change на `<html>`, browser
re-paints всё, что зависит от variables.

**Tailwind v4 `@theme inline` keyword** — ключевой: preserves `var()`
expressions в выходном CSS (resolution at render-time, не build-time), что
и даёт theme-switch без перекомпиляции.

### 2. Default light + `:root` selector

`:root, .theme-light { ... light values }` — даёт корректный fallback если
ThemeScript не отработал (no-JS / first paint до hydrate). Globals
admin-кабинета используют этот pattern напрямую.

Marketing (`marketing.css` со scope `[data-marketing="true"]`) использует
другой pattern — default values на голом `[data-marketing]` selector
(specificity 0,1,0), dark override на `.theme-dark [data-marketing]` (0,2,0).
Class-prefixed выигрывает по specificity, source order не важен. Light
implicit через default — `.theme-light` явно выставляется ThemeScript'ом
но без custom-overrides.

**Hotfix B3-THEME-3:** изначально использовал `:root [data-marketing], .theme-light [data-marketing]` в marketing.css — :root имеет ту же специфичность что и `.theme-dark`, и source order решал; light (вторым) побеждал dark. Видимое последствие: переключение в dark не работало в landing. Fix: убрать `:root` + перенести defaults на `[data-marketing]`.

### 3. ThemeProvider — React context

`apps/web/src/lib/theme/theme-provider.tsx`. State:
- `mode: 'light' | 'dark' | 'system'` — user preference.
- `theme: 'light' | 'dark'` — resolved (after system-resolution).
- `hydrated` — was `useEffect` mount run.

Single useEffect mount читает localStorage → ставит state + applies class.
Второй useEffect — listener `prefers-color-scheme` matchMedia, активен
только в `mode='system'` (real-time follows OS).

`setMode(next)` — resolves, applies class, persists в localStorage. Sync с
backend живёт в отдельном hook (см. §6).

### 4. FOUC prevention — inline `<head>` script

Без mitigation страница рендерится с default theme → React hydrate →
useEffect fires → switches к user preference → user видит flash.

`<ThemeScript />` — inline blocking `<script>` в `<head>` (через
`dangerouslySetInnerHTML`). Читает localStorage, ставит class на `<html>` ДО
React hydrate. CSS применяется до first paint.

`dangerouslySetInnerHTML` использован умышленно: контент — статическая
строка без user input, XSS-вектора нет, и это единственный способ получить
inline-script в Next.js без deferred execution.

### 5. Persistence — localStorage + DB

**localStorage** (anonymous + immediate writes):
- Key: `jumix-theme-mode`, values: `'light' | 'dark' | 'system'`.
- Default: `'system'` (если нет stored value).

**DB** (logged-in users, cross-device consistency):
- New column `users.theme_mode text NOT NULL DEFAULT 'system'`, миграция 0014.
- Endpoint `PATCH /me/preferences` body `{themeMode}` — own user only,
  preHandler `app.authenticate`, Zod-валидация enum.
- Login + verify + registration DTOs возвращают `user.themeMode`.

**Sync на login** (`useThemeSync` hook):
- Если `localStorage.mode !== 'system'` И `DB.themeMode === 'system'` —
  anonymous toggle wins, push в DB через PATCH.
- Иначе DB wins (cross-device consistency), provider applies DB value.
- Anti-loop через `lastPushedMode` ref — после первого sync second effect
  не PATCH'ит обратно значение, которое только что прилетело из БД.

**Sync на toggle** (logged-in): visual update мгновенный, async PATCH в
DB fire-and-forget. Ошибки логируются, не откатывают visual state
(preference-level, low stakes).

**Logout**: localStorage НЕ очищается (next login user получит ту же
preference).

### 6. Toggle UX — single button, no system option

**Изначально**: dropdown с 3 опциями (Светлая / Тёмная / Системная).

**После заказчик-feedback**: dropdown — лишний UX. Сейчас один button-toggle:
кликаешь → переключается на противоположную (light↔dark). 'system' опция
убрана из UI, но preserved в underlying `ThemeMode` model — пользователь,
который хочет следовать OS, может либо не нажимать toggle (новый юзер
начинает с 'system' → matchMedia резолвит), либо очистить localStorage.

Иконка показывает target состояние:
- сейчас light → Moon icon (click → dark)
- сейчас dark → Sun icon (click → light)

aria-label/title — динамический ("Включить тёмную тему" / "Включить
светлую тему"). Отдельный `MarketingThemeToggle` для landing-header
использует `--m-*` palette (вместо admin tokens) чтобы вписаться в
landing-style. Symmetric API.

### 7. Map style switching — MapLibre

Protomaps `@protomaps/basemaps` поддерживает named flavors. Добавлен
`LIGHT_VECTOR_STYLE` (light flavor) рядом с `DARK_VECTOR_STYLE`. Helper
`getMapStyleFor(theme)` возвращает соответствующий.

`BaseMap` подписан на `useTheme()`. На смену resolved theme — `map.setStyle(...)`.
MapLibre style replacement wipe'ит overlay sources/layers (sites geofence,
shift path polyline, etc.) — поэтому каждый layer-component
(`SitesLayer`, `ShiftPathLayer`, `MapPicker`) принимает `styleEpoch` prop
из `useMapStyleEpoch(map)` hook (counter инкрементируется на каждый
`style.load` event). Layer add `styleEpoch` в свои useEffect deps — на
инкремент counter'а пере-регистрирует свой source+layer заново.

ShiftPathLayer endpoint stroke стал theme-aware (dark → near-black, light →
white) чтобы точки начала/конца маршрута читались на обеих подложках.

### 8. SVG mockups — CSS classes inside `<defs><style>`

В B3-LANDING illustrations (dashboard-mockup, phone-mockup, step-illustration)
было ~30 hardcoded hex-цветов в SVG `fill`/`stroke` attributes. SVG
attributes не принимают `var()` expressions, нужен CSS-class layer.

Pattern: каждый SVG имеет inline `<style>` блок, определяющий classes
(`.m-svg-card`, `.m-svg-text-primary`, ...) которые читают `--m-mockup-*`
tokens (отдельный sub-palette в marketing.css). На смену темы рисунок
перекрашивается через CSS, без re-render компонента.

Phone bezel/notch (`#0a0a0b`) и near-black text on brand orange кнопках
оставлены literal — real-phone hardware всегда тёмное; near-black on orange
имеет лучший contrast чем white (~10:1 vs ~3:1 — WCAG fail для white text
on orange normal weight).

### 9. Brand foreground token (B3-THEME-4 polish)

`--brand-foreground: #0a0a0b` — отдельный fixed token (НЕ theme-aware) для
text/icons на `bg-brand-500` background (primary buttons, step-indicators).

Reason: `text-layer-0` (canvas color) автоматически flip'ит — белый в
light, near-black в dark. На orange button это даёт white-on-orange ~3:1
(AA fail) в light theme. `--brand-foreground` всегда `#0a0a0b` (~10:1, AA
pass) в обеих темах. Использование: `text-brand-foreground` Tailwind
utility.

### 10. Recharts — НЕ скоупе

План B3-THEME-2 упоминал Recharts integration через CSS variables, но в
admin кабинете Recharts не используется (планировался для analytics этапа
3, который ждёт спеку начислений от заказчика). Удалено из scope.

---

## Trade-offs

**+ CSS variables**:
- Single change на `<html>` class — все компоненты re-paint автоматически.
- Components читают token'ы абстрактно (`bg-layer-0`), не знают про темы.
- Легко добавить третью тему (high-contrast, sepia) — просто новая class +
  values.

**− CSS variables**:
- Static analysis сложнее: `bg-layer-0` не подсказывает реальный цвет в
  IDE без смотрения CSS.
- Tailwind v4 `@theme inline` обязателен — `var()` expressions ломаются в
  старых Tailwind 3 которые inline'ят значения at build time.

**+ inline ThemeScript**:
- Zero FOUC, theme применяется до first paint.

**− inline ThemeScript**:
- `dangerouslySetInnerHTML` — CSP-friendly only с nonce (backlog когда
  CSP затянем).
- Дублирование логики (provider + script делают примерно то же самое
  при mount).

**+ system option preserved в model**:
- ThemeMode остаётся `'light'|'dark'|'system'`, можно вернуть toggle
  в dropdown обратно если pref'ы изменятся.

**− system option скрыт в UI**:
- Юзер должен вручную очистить localStorage чтобы вернуться к
  `'system'` — non-discoverable. Acceptable trade-off (заказчик upreked).

**+ map style swap через setStyle()**:
- Не пересоздаём map instance — preserves zoom/pan, не дёргает tiles
  cache.

**− map style swap через setStyle()**:
- Wipe'ит overlay sources/layers, нужен styleEpoch trigger в каждом
  layer. Nontrivial для maintainers, но изолировано в `useMapStyleEpoch`
  hook + `styleEpoch` prop pattern.

---

## Alternatives considered

1. **Tailwind `dark:` modifiers** (rejected) — overlapping classes,
   maintenance overhead, не работает для CSS-variables, hardcoded HEX
   colors в SVG, MapLibre paint expressions.

2. **CSS Modules + theme files** (rejected) — изоляция per-component
   нарушает global token consistency, верстка сложнее.

3. **next-themes library** (rejected) — добавляет dependency, дублирует то
   что мы и так пишем (~80 строк provider + script). Наш подход проще.

4. **Server-driven theme** (cookie + SSR) (rejected на MVP) — потребовал
   бы middleware + переписать root layout под server component с динамическим
   class на `<html>`. Backlog: `Web cookie mode` (одновременно с миграцией
   auth tokens на HttpOnly cookies).

5. **Mobile (Expo) — дублировать ту же tokens-структуру** (rejected на
   MVP) — StyleSheet tokens в Expo hardcoded под dark, переписывание
   охватывает все ~50 mobile screens. Отдельная вертикаль M-THEME в
   backlog.

6. **High-contrast accessibility theme** (deferred) — третий вариант
   palette с увеличенным contrast'ом (>AA). Backlog: можно добавить
   `.theme-high-contrast` classes без рефакторинга.

---

## Consequences

### Positive

- Web theme system complete; user preference cross-device через DB.
- Foundation для будущих тем (high-contrast, custom user palettes) — просто
  новая class + values.
- Brand orange centralized (`--brand-500` + `--brand-foreground`) — design-
  system §8.2 enforce'ится автоматически.
- Map тоже theme-aware — отличает Jumix от competitor'ов с фиксированно-
  тёмными картами.

### Negative

- Mobile отстаёт в восприятии бренда (всегда dark) — пока заказчик
  сегодня соглашается, но при store submission (M8) если store reviewer
  раскритикует — приоритет M-THEME повысится.
- На admin pages в light theme white text on orange (если developer
  напишет `text-white` instead of `text-brand-foreground`) — easy mistake.
  Mitigation: design-system docs (B3-THEME-4 ARCHITECTURE.md update).

### Mitigations

- ESLint rule (backlog) — warn on `text-white` под `bg-brand-500` (custom
  rule via `tailwindcss/no-custom-classname` хак). Сейчас manual review.
- Visual regression testing (Playwright + screenshot diff) для key surfaces
  в обеих темах — backlog post-MVP.

---

## Open questions

- Когда CSP затянем (post-MVP), как ThemeScript будет работать с
  `script-src` без nonce? Варианты: nonce через middleware на `<head>`
  injection, OR move к runtime `Script id strategy="beforeInteractive"`
  (но он не блокирует, FOUC возвращается).
- Mobile (M-THEME) — когда? Заказчик пока не просил, но если в M8 store
  reviewer раскритикует «всегда dark» — bump приоритет.
- High-contrast theme — может ли быть требованием от госзаказчика
  (доступность для людей со слабым зрением)? Не упомянуто в ТЗ, но
  государственные мониторинговые системы РК часто требуют WCAG AAA.

---

## References

- ARCHITECTURE.md#b3-theme — implementation history (4 slices + hotfix +
  toggle simplification).
- CLAUDE.md §6 (critical invariants) — added theme-token rule.
- design-system.md §8 — color tokens reference.
- migrations/0014_user_theme_preference.sql — DB schema.
