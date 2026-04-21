-- Migration 0004: cranes table.
--
-- Структура: §6.3 database.md. Краны привязаны к организации (ON DELETE RESTRICT
-- — нельзя удалить организацию с активными кранами) и опционально к site
-- (ON DELETE SET NULL — удаление площадки не каскадирует, кран становится
-- «без дислокации»).
--
-- Партиальный уникальный индекс по (organization_id, inventory_number) —
-- inventory_number может быть NULL (не у всех кранов есть номер), а
-- soft-deleted записи освобождают слот.

CREATE TYPE "public"."crane_type" AS ENUM('tower', 'mobile', 'crawler', 'overhead');--> statement-breakpoint
CREATE TYPE "public"."crane_status" AS ENUM('active', 'maintenance', 'retired');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cranes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"site_id" uuid,
	"type" "crane_type" NOT NULL,
	"model" text NOT NULL,
	"inventory_number" text,
	"capacity_ton" numeric(8, 2) NOT NULL,
	"boom_length_m" numeric(6, 2),
	"year_manufactured" integer,
	"tariffs_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "crane_status" DEFAULT 'active' NOT NULL,
	"notes" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cranes_capacity_positive_chk" CHECK ("cranes"."capacity_ton" > 0),
	CONSTRAINT "cranes_boom_length_positive_chk" CHECK ("cranes"."boom_length_m" IS NULL OR "cranes"."boom_length_m" > 0),
	CONSTRAINT "cranes_year_manufactured_range_chk" CHECK ("cranes"."year_manufactured" IS NULL OR ("cranes"."year_manufactured" >= 1900 AND "cranes"."year_manufactured" <= EXTRACT(YEAR FROM now())::integer))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cranes" ADD CONSTRAINT "cranes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cranes" ADD CONSTRAINT "cranes_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cranes_inventory_unique_active_idx" ON "cranes" USING btree ("organization_id","inventory_number") WHERE deleted_at IS NULL AND inventory_number IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cranes_organization_idx" ON "cranes" USING btree ("organization_id") WHERE deleted_at IS NULL AND status <> 'retired';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cranes_site_idx" ON "cranes" USING btree ("site_id") WHERE site_id IS NOT NULL AND status = 'active' AND deleted_at IS NULL;
