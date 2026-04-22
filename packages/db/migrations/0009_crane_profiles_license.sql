-- Migration 0009: license fields on crane_profiles (ADR 0005).
--
-- Все поля nullable: existing crane_profiles (созданные до B2d-4) не имеют
-- загруженного удостоверения. /me/status учитывает NULL как "missing" —
-- canWork=false до загрузки. Backend не форсит загрузку при registration
-- (B2d-3 создаёт профиль без license); операторы дозагружают через
-- /me/license/* endpoints.
--
-- license_version дефолтом 0 — при первом confirm становится 1 (версии с
-- единицы для читаемости в storage path).

ALTER TABLE "crane_profiles" ADD COLUMN "license_key" text;--> statement-breakpoint
ALTER TABLE "crane_profiles" ADD COLUMN "license_expires_at" date;--> statement-breakpoint
ALTER TABLE "crane_profiles" ADD COLUMN "license_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "crane_profiles" ADD COLUMN "license_warning_30d_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "crane_profiles" ADD COLUMN "license_warning_7d_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "crane_profiles" ADD COLUMN "license_expired_at" timestamp with time zone;--> statement-breakpoint

-- Sanity: если license_key заполнен, expires_at тоже должен быть.
-- NULL-оба (не загружено) и обе-заполнены (загружено) — валидные состояния.
ALTER TABLE "crane_profiles" ADD CONSTRAINT "crane_profiles_license_consistency_chk" CHECK (
  (license_key IS NULL AND license_expires_at IS NULL)
  OR (license_key IS NOT NULL AND license_expires_at IS NOT NULL)
);--> statement-breakpoint

-- Hot path для cron: все профили с известным expires_at для scan'а warning-полей.
-- Partial index — только те что могут когда-либо нуждаться в warning.
CREATE INDEX "crane_profiles_license_expiry_scan_idx"
  ON "crane_profiles" (license_expires_at)
  WHERE license_expires_at IS NOT NULL AND deleted_at IS NULL;
