# UI / Design system

> Extracted from CLAUDE.md §8. Visual language, color palette, typography, components, logo assets.

## 8.1 Общий вайб

Linear × Vercel × Samsara. Плотный, тёмный, профессиональный. **Не** playful, **не** glassmorphism, **не** gradient-мусор. Язык — русский и казахский (одинаково полированные).

## 8.2 Цветовая палитра

**Поверхности (multi-layer dark):**

```
Layer 0 (deepest):    #0A0A0B
Layer 1 (base):       #111113
Layer 2 (elevated):   #18181B
Layer 3 (raised):     #1F1F23
Layer 4 (hover):      #27272A
```

**Бордеры:**
```
Subtle:    #27272A
Default:   #2E2E33
Strong:    #3F3F46
```

**Текст:**
```
Primary:    #FAFAFA
Secondary:  #A1A1AA
Tertiary:   #71717A
Disabled:   #52525B
```

**Brand (Jumix orange) — палитра синхронизирована с логотипом:**

База: HSL 27.5° / 95% / 52% (извлечено из `logo-mark.png`, медианный тон градиента).
Шкала Tailwind-like, рассчитана через HSL (только L меняется, H и S фиксированы).

```
brand-50:   #FEF1E6     ← L 95%  (фоны подсказок / toast info)
brand-100:  #FDDBBE     ← L 87%
brand-200:  #FCBA83     ← L 75%
brand-300:  #FA9947     ← L 63%
brand-400:  #FA8B2E     ← L 58%  (hover)
brand-500:  #F97B10     ← L 52%  ОСНОВНОЙ (brand color, CTA, logo-mid)
brand-600:  #E06A06     ← L 45%  (pressed / active)
brand-700:  #BD5905     ← L 38%
brand-800:  #954604     ← L 30%
brand-900:  #723603     ← L 23%
```

Градиентные края логотипа: низ-слева `#FC5511`, верх-справа `#FDA714` — можно использовать для hero-секций и декоративных элементов, не для UI-контролов.

**Правило использования brand-оранжевого:** 2-5% экрана. Primary CTA, активный пункт sidebar, фокус-ring, ключевые метрики. НЕ для кнопок массово, НЕ для бордеров карточек, НЕ для иконок в sidebar (кроме активной).

**Семантические цвета:**
```
Success:  #10B981 (emerald-500)
Warning:  #EAB308 (yellow-500) ← НЕ orange, иначе путается с brand
Danger:   #EF4444 (red-500)
Info:     #3B82F6 (blue-500)
Neutral:  #71717A (zinc-500)
```

## 8.3 Типографика

- **Основной:** Inter variable (поддерживает кириллицу и казахский)
- **Monospace:** JetBrains Mono (для ID, кода, инвентарных номеров)
- Цифры в таблицах: `font-feature-settings: "tnum"` (выравнивание)

**Шкала:**
```
Display: 32/40, weight 600
Heading: 24/32, weight 600
Subhead: 18/28, weight 600
Body-L:  16/24, weight 400
Body:    14/20, weight 400  ← основа
Caption: 12/16, weight 500
Micro:   11/14, weight 500
```

Никакого weight 700 — выглядит кричаще на dark theme.

## 8.4 Spacing

Grid 4px: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.

**Плотность:**
- Строки таблиц: 40-44 px (compact 36)
- Инпуты: 36-40 px
- Кнопки: 32 / 36 / 40 px
- Padding карточек: 16-20 px

## 8.5 Компоненты

**Sidebar (240/64 px):**
Секции `OPERATIONS / PEOPLE / FINANCE / MANAGEMENT`. Активный пункт: оранжевая точка (2 px) слева + фон Layer 2. Логотип Jumix вверху, user switcher + language toggle внизу.

**Top bar (56 px):**
Breadcrumbs | Global search (Cmd+K) | Notifications bell | Аватар

**Data tables:**
- 44 px строки, hover → оранжевая полоска слева 2px
- Клик на строку → drawer справа (не модалка, не новая страница)
- Фильтры как chips над таблицей
- Density toggle: Compact / Default / Relaxed

**Status badges:**
- Dot + text, bg цвет статуса с 10-15% opacity, 1px border того же цвета
- Высота 22 px, text 12 px medium
- Warning всегда с иконкой (чтобы не путать с brand)

**Maps:**
- MapLibre GL JS + Protomaps tiles
- Dark style с оранжевыми метками активных смен, серыми — вне объекта, красными — проблемы
- Geofence = круг 10% opacity оранжевой заливки + 1 px stroke

## 8.6 Иконки

- База: **Lucide** (stroke 1.5 px)
- Домен: **Tabler Icons** (`crane`, `helmet`, `hard-hat`)
- Размеры: 16 / 20 / 24 px
- Все иконки в одном стиле (outline, не mix с filled)

## 8.7 Копирайт (UI текст)

- Не улыбчивый, не корпоративно-формальный
- Технический и точный: «Крановщик Иванов И.И. вне геозоны объекта. Расстояние: 312 м»
- Без emoji в UI

## 8.8 Логотип

**Структура `apps/web/public/brand/`:**

| Файл | Источник | Размер | Использование |
|---|---|---|---|
| `logo-full.png` | от дизайнера | 5504×1642 | Sidebar (развёрнутый), login-экран, email-шапки |
| `logo-mark.png` | от дизайнера | 1650×1642 | Favicon, PWA-иконка, collapsed sidebar, push-notification icon |

**Извлечение brand-палитры:** `python3 scripts/brand-color.py` (см. §8.2). Медианный HEX `#F97B10` совпадает с `brand-500`.

**Что нужно получить от дизайнера (backlog):**
- **SVG-версии** обоих лого — для lossless ресайза (favicon 16/32/180, retina). См. [adr/0001-logo-assets.md](adr/0001-logo-assets.md).
- **Монохромная версия** (белая на прозрачном) — для некоторых поверхностей (white-label отчёты, тёмные email-шапки).

**Не использовать прямо PNG 5504×1642 в продакшене** — при инлайне в Next.js он отдаёт полный размер. Для sidebar (реальный размер ~120×36) использовать `next/image` с явными `width`/`height` + `sizes` или экспортировать уменьшенные варианты `logo-full@1x.png`, `logo-full@2x.png` после получения SVG.

## 8.9 Light theme

**НЕ делаем в MVP.** Архитектура через CSS-переменные поддерживает, добавим позже.
