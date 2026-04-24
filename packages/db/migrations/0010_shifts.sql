-- Migration 0010: shifts table (M4 — shift lifecycle, ADR 0006).
--
-- Моделирует рабочую смену крановщика на кране. State machine:
--   active   → работает сейчас
--   paused   → на перерыве (advisory marker, GPS продолжает ping'овать)
--   ended    → завершена (terminal)
--
-- Денормализованные FK: organization_id + site_id дублируют данные доступные
-- через cranes JOIN, но нужны для fast owner-scope queries (count active
-- shifts по organization) без лишнего JOIN'а. При создании shift'а
-- берутся из crane.organizationId / crane.siteId.
--
-- Unique partial index: один operator может иметь ровно ОДНУ активную или
-- приостановленную смену. `ended` исключён из constraint'а (любое число
-- завершённых смен валидно). DB-level last-line-of-defense против race при
-- spam'е «start shift» с клиента.
--
-- Consistency CHECK'и:
--   - paused_at NOT NULL iff status='paused'
--   - ended_at NOT NULL iff status='ended'
--   - total_pause_seconds >= 0
-- DB страхует state-machine invariants на случай багов в service layer.

CREATE TYPE "public"."shift_status" AS ENUM('active', 'paused', 'ended');--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "shifts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "crane_id" uuid NOT NULL,
  "operator_id" uuid NOT NULL,
  "crane_profile_id" uuid NOT NULL,
  "organization_id" uuid NOT NULL,
  "site_id" uuid NOT NULL,
  "status" "shift_status" DEFAULT 'active' NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "ended_at" timestamp with time zone,
  "paused_at" timestamp with time zone,
  "total_pause_seconds" integer DEFAULT 0 NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "shifts_paused_at_consistency_chk" CHECK (
    (status = 'paused' AND paused_at IS NOT NULL)
    OR (status <> 'paused' AND paused_at IS NULL)
  ),
  CONSTRAINT "shifts_ended_at_consistency_chk" CHECK (
    (status = 'ended' AND ended_at IS NOT NULL)
    OR (status <> 'ended' AND ended_at IS NULL)
  ),
  CONSTRAINT "shifts_total_pause_nonneg_chk" CHECK ("total_pause_seconds" >= 0)
);
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "shifts" ADD CONSTRAINT "shifts_crane_id_cranes_id_fk" FOREIGN KEY ("crane_id") REFERENCES "public"."cranes"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "shifts" ADD CONSTRAINT "shifts_operator_id_users_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "shifts" ADD CONSTRAINT "shifts_crane_profile_id_crane_profiles_id_fk" FOREIGN KEY ("crane_profile_id") REFERENCES "public"."crane_profiles"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "shifts" ADD CONSTRAINT "shifts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "shifts" ADD CONSTRAINT "shifts_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- Один operator может иметь только одну active/paused shift. ended -
-- исключены из индекса (commit'ится история).
CREATE UNIQUE INDEX IF NOT EXISTS "shifts_active_per_operator_idx"
  ON "shifts" ("operator_id")
  WHERE status IN ('active', 'paused');
--> statement-breakpoint

-- История смен оператора, cursor по id + started_at для DESC-пагинации.
CREATE INDEX IF NOT EXISTS "shifts_operator_started_at_idx"
  ON "shifts" ("operator_id", "started_at" DESC);
--> statement-breakpoint

-- Кран → текущая смена. Partial — active/paused only.
CREATE INDEX IF NOT EXISTS "shifts_crane_active_idx"
  ON "shifts" ("crane_id")
  WHERE status IN ('active', 'paused');
--> statement-breakpoint

-- Owner dashboard: «сколько кранов сейчас работает». Partial index.
CREATE INDEX IF NOT EXISTS "shifts_organization_active_idx"
  ON "shifts" ("organization_id")
  WHERE status IN ('active', 'paused');
--> statement-breakpoint

-- Site drawer: «текущие смены на этом объекте».
CREATE INDEX IF NOT EXISTS "shifts_site_active_idx"
  ON "shifts" ("site_id")
  WHERE status IN ('active', 'paused');
