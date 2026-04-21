-- Migration 0003: sites table + PostGIS extension.
--
-- CREATE EXTENSION сидит внутри этой миграции потому что drizzle-kit генерирует
-- миграции по diff схемы, а extensions в diff не участвуют. IF NOT EXISTS
-- делает идемпотентным — rollback + re-apply не падает. Если эта миграция
-- когда-нибудь расщепится на отдельный шаг для extension, он ОБЯЗАН выполниться
-- до любой миграции, использующей postgis-типы.
CREATE EXTENSION IF NOT EXISTS postgis;--> statement-breakpoint
CREATE TYPE "public"."site_status" AS ENUM('active', 'completed', 'archived');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"geofence_center" geography(Point, 4326) NOT NULL,
	"geofence_radius_m" integer DEFAULT 150 NOT NULL,
	"status" "site_status" DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sites_geofence_radius_chk" CHECK ("sites"."geofence_radius_m" > 0 AND "sites"."geofence_radius_m" <= 10000)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sites" ADD CONSTRAINT "sites_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sites_organization_active_idx" ON "sites" USING btree ("organization_id") WHERE status <> 'archived';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sites_geofence_gist_idx" ON "sites" USING gist ("geofence_center");
