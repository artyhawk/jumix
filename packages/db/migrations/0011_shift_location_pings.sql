-- Migration 0011: shift_location_pings (M5 — GPS tracking, ADR 0007).
--
-- Хранит location pings поступающие с mobile клиента во время активной
-- смены. Mobile буферизует pings в локальной SQLite queue и отправляет
-- batch'ами (до 100) на `POST /api/v1/shifts/:id/pings` когда доступна сеть.
--
-- inside_geofence — результат client-side вычисления (Haversine distance
-- ping→site.coords с accuracy tolerance). Nullable: client может прислать
-- NULL если shift's site coords недоступны на момент записи.
--
-- ON DELETE CASCADE — shifts не soft-delete'ятся, но если когда-то начнут,
-- location pings логически живут только вместе со shift'ом. В MVP shifts
-- не удаляются → cascade никогда не trigger'ится.
--
-- Без PostGIS: latest-per-active-shift query — ORDER BY recorded_at DESC
-- с LIMIT 1 по partition'у (shift_id), не geospatial поиск. PostGIS добавим
-- если scale потребует (>50M rows, bbox-поиск, heat maps — backlog).
--
-- Retention 90 дней — background cleanup в backlog.

CREATE TABLE IF NOT EXISTS "shift_location_pings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "shift_id" uuid NOT NULL,
  "latitude" numeric(10, 7) NOT NULL,
  "longitude" numeric(10, 7) NOT NULL,
  "accuracy_meters" real,
  "recorded_at" timestamp with time zone NOT NULL,
  "inside_geofence" boolean,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "shift_location_pings_lat_range_chk" CHECK ("latitude" BETWEEN -90 AND 90),
  CONSTRAINT "shift_location_pings_lng_range_chk" CHECK ("longitude" BETWEEN -180 AND 180),
  CONSTRAINT "shift_location_pings_accuracy_nonneg_chk" CHECK ("accuracy_meters" IS NULL OR "accuracy_meters" >= 0)
);
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "shift_location_pings" ADD CONSTRAINT "shift_location_pings_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- Primary access pattern: "последний ping для shift X" (owner map) и
-- "все pings shift'а в порядке времени" (path playback).
CREATE INDEX IF NOT EXISTS "shift_location_pings_shift_time_idx"
  ON "shift_location_pings" ("shift_id", "recorded_at" DESC);
