-- Migration 0014: per-user theme preference (B3-THEME).
--
-- Web UI gets a light theme + manual toggle (Sun/Moon/Monitor dropdown в
-- header). Anonymous users persist the choice в localStorage; logged-in users
-- — здесь, в `users.theme_mode`, чтобы preference переживала смену устройства
-- и refresh.
--
-- Three values:
--   'light'  — explicit light
--   'dark'   — explicit dark
--   'system' — follow OS `prefers-color-scheme` (default for new users)
--
-- На login client сравнивает localStorage vs DB; explicit choice (≠ 'system')
-- wins над DB-default 'system' и пишется обратно через PATCH /me/preferences.
-- DB wins при cross-device consistency (если оба explicit).
--
-- NOT NULL DEFAULT 'system' для existing rows безопасно: для logged-in users
-- результат на первом visit'е будет таким же, как раньше (system preference
-- — light для подавляющего большинства desktop OS дефолтов).
--
-- Mobile (Expo) пока остаётся dark-only — отдельная вертикаль M-THEME в
-- backlog'е. Колонка живёт на users (не на отдельной таблице preferences),
-- потому что:
--   1. Это единственная preference в MVP — лишняя таблица overkill.
--   2. JOIN'ить per-request на /me / login — лишние ms на hot-path; колонка
--      на users возвращается тем же SELECT'ом.
--   3. Когда появится >1 preference (notifications opt-in, locale override,
--      density compact/comfortable, etc.) — нормализуем в `user_preferences`
--      JSONB одним shot'ом.

ALTER TABLE "users" ADD COLUMN "theme_mode" text NOT NULL DEFAULT 'system';--> statement-breakpoint

ALTER TABLE "users" ADD CONSTRAINT "users_theme_mode_chk"
  CHECK ("users"."theme_mode" IN ('light', 'dark', 'system'));
