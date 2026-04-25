-- Migration 0012: safety compliance — pre-shift checklist + incidents (M6, ADR 0008).
--
-- Two related but distinct safety features для крановых работ в РК:
--
-- 1. pre_shift_checklists — обязательная проверка СИЗ перед каждой
--    сменой (per-shift, не per-day — equipment может быть damaged между
--    sменами). Items predefined enum (helmet/vest/boots/gloves/harness/
--    first_aid_kit/crane_integrity), conditional по crane.type (harness
--    required только для tower cranes). Submission embedded в POST
--    /shifts/start atomic transaction — нет orphan checklist edge-case.
--    UNIQUE(shift_id) — одна checklist на shift.
--
-- 2. incidents — operator reports проблем (crane malfunction, material
--    fall, near-miss, minor injury, safety violation, other). Severity
--    operator-assigned (info/warning/critical). Status workflow:
--    submitted → acknowledged → resolved (или escalated → de-escalated).
--    shift_id/site_id/crane_id nullable — incident можно reportить и без
--    активной смены. lat/lng auto-attached if available (M5 GPS lookup),
--    но nullable — offline tolerant. reporter_name/reporter_phone
--    DENORMALIZED — для query performance + record durability after user
--    deletion (incident persists даже если operator удалён).
--
-- 3. incident_photos — multi-photo per incident (up to 5 в MVP). Three-phase
--    upload pattern reused from M3 license: client requests presigned PUT,
--    PUTs file, передаёт key в incident create. Backend HEAD + prefix-match
--    + size check на confirm. ON DELETE CASCADE — фото живут только с
--    incident'ом.

CREATE TABLE IF NOT EXISTS "pre_shift_checklists" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "shift_id" uuid NOT NULL UNIQUE,
  "submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "items" jsonb NOT NULL,
  "general_notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "pre_shift_checklists" ADD CONSTRAINT "pre_shift_checklists_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "incidents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "reporter_user_id" uuid NOT NULL,
  "reporter_name" text NOT NULL,
  "reporter_phone" text NOT NULL,
  "organization_id" uuid NOT NULL,
  "shift_id" uuid,
  "site_id" uuid,
  "crane_id" uuid,
  "type" text NOT NULL,
  "severity" text NOT NULL,
  "status" text DEFAULT 'submitted' NOT NULL,
  "description" text NOT NULL,
  "reported_at" timestamp with time zone DEFAULT now() NOT NULL,
  "acknowledged_at" timestamp with time zone,
  "acknowledged_by_user_id" uuid,
  "resolved_at" timestamp with time zone,
  "resolved_by_user_id" uuid,
  "resolution_notes" text,
  "latitude" numeric(10, 7),
  "longitude" numeric(10, 7),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "incidents_type_chk" CHECK (
    "type" IN ('crane_malfunction', 'material_fall', 'near_miss', 'minor_injury', 'safety_violation', 'other')
  ),
  CONSTRAINT "incidents_severity_chk" CHECK ("severity" IN ('info', 'warning', 'critical')),
  CONSTRAINT "incidents_status_chk" CHECK ("status" IN ('submitted', 'acknowledged', 'resolved', 'escalated')),
  CONSTRAINT "incidents_lat_range_chk" CHECK ("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90),
  CONSTRAINT "incidents_lng_range_chk" CHECK ("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180),
  CONSTRAINT "incidents_description_min_chk" CHECK (char_length("description") >= 10)
);
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "incidents" ADD CONSTRAINT "incidents_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "incidents" ADD CONSTRAINT "incidents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "incidents" ADD CONSTRAINT "incidents_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "incidents" ADD CONSTRAINT "incidents_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "incidents" ADD CONSTRAINT "incidents_crane_id_cranes_id_fk" FOREIGN KEY ("crane_id") REFERENCES "public"."cranes"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "incidents" ADD CONSTRAINT "incidents_acknowledged_by_user_id_users_id_fk" FOREIGN KEY ("acknowledged_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "incidents" ADD CONSTRAINT "incidents_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- Owner queue (status='submitted'/'acknowledged'/'escalated' = open) per-org.
CREATE INDEX IF NOT EXISTS "incidents_org_status_time_idx"
  ON "incidents" ("organization_id", "status", "reported_at" DESC);

-- Critical-severity surface для dashboard badge.
CREATE INDEX IF NOT EXISTS "incidents_severity_idx"
  ON "incidents" ("severity") WHERE "status" IN ('submitted', 'acknowledged', 'escalated');

-- Operator's own incidents history.
CREATE INDEX IF NOT EXISTS "incidents_reporter_time_idx"
  ON "incidents" ("reporter_user_id", "reported_at" DESC);

-- Filter by shift (на shift drawer'е owner может surface'ить incidents
-- этой смены — backlog feature).
CREATE INDEX IF NOT EXISTS "incidents_shift_idx"
  ON "incidents" ("shift_id") WHERE "shift_id" IS NOT NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "incident_photos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "incident_id" uuid NOT NULL,
  "storage_key" text NOT NULL,
  "uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "incident_photos" ADD CONSTRAINT "incident_photos_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "incident_photos_incident_idx"
  ON "incident_photos" ("incident_id");
