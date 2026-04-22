-- Migration 0005: operators table.
--
-- Структура: docs/architecture/database.md (operators). Operator — профиль
-- крановщика в составе organization, 1:1 с users (partial UNIQUE на
-- user_id+organization_id для живых; multi-org в backlog).
--
-- ИИН уникален по (organization_id, iin) среди не-soft-deleted: повторный
-- наём того же человека после terminated+delete освобождает слот.
--
-- terminated_at — исторический факт (не очищается при восстановлении).
-- availability — только при status='active' (CHECK constraint).

CREATE TYPE "public"."operator_status" AS ENUM('active', 'blocked', 'terminated');--> statement-breakpoint
CREATE TYPE "public"."operator_availability" AS ENUM('free', 'busy', 'on_shift');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "operators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"patronymic" text,
	"iin" text NOT NULL,
	"avatar_key" text,
	"hired_at" date,
	"terminated_at" date,
	"specialization" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "operator_status" DEFAULT 'active' NOT NULL,
	"availability" "operator_availability",
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operators_iin_format_chk" CHECK ("operators"."iin" ~ '^[0-9]{12}$'),
	CONSTRAINT "operators_availability_only_when_active_chk" CHECK ("operators"."availability" IS NULL OR "operators"."status" = 'active')
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "operators" ADD CONSTRAINT "operators_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "operators" ADD CONSTRAINT "operators_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "operators_iin_unique_active_idx" ON "operators" USING btree ("organization_id","iin") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "operators_user_org_unique_active_idx" ON "operators" USING btree ("user_id","organization_id") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "operators_organization_idx" ON "operators" USING btree ("organization_id") WHERE deleted_at IS NULL AND status <> 'terminated';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "operators_user_idx" ON "operators" USING btree ("user_id");
