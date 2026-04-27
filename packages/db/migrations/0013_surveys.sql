-- Migration 0013: customer development surveys (B3-SURVEY).
--
-- Three tables капают customer development feedback от двух сегментов
-- (владельцы кранов / стройкомпании = b2b, крановщики = b2c) на двух языках
-- (ru / kk). Surveys ХАРДКОДЕНЫ через seed (не user-creatable в MVP), но
-- структура нормализована — добавление новой survey не требует кода, только
-- INSERT'ов в seed.
--
-- 1. surveys — templates. UNIQUE(slug) — программное обращение по
--    'b2b-ru'/'b2b-kk'/'b2c-ru'/'b2c-kk'. is_active toggles visibility
--    публичного endpoint'а (admin может приостановить survey без удаления —
--    исторические responses сохраняются).
--
-- 2. survey_questions — variable questions per survey. position-ordered (UNIQUE
--    per survey), group_key+group_title для UI sections (Блок А/Б/В).
--    is_required hint для public form (server тоже валидирует).
--
-- 3. survey_responses — public submissions. answers как JSONB keyed by question
--    position-as-string ({"1": "...", "2": "..."}) — один INSERT, гибкая
--    схема, easy text search через JSONB операторы. Контактные данные
--    (full_name/phone/email) DENORMALIZED в колонки — primary use-case это lead
--    generation, поэтому нужны для index'ов и query без JSONB-extract'ов.
--    honeypot_filled — true если bot заполнил скрытое поле; такие responses
--    хранятся (для analytics) но фильтруются по умолчанию в admin UI.
--    ip_address/user_agent — опциональны для privacy + случай когда proxy
--    headers недоступны.
--
-- ON DELETE RESTRICT для responses → surveys: surveys никогда не удаляются
-- (только is_active=false), historical data integrity preserved.

CREATE TABLE IF NOT EXISTS "surveys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" text NOT NULL UNIQUE,
  "title" text NOT NULL,
  "subtitle" text NOT NULL,
  "audience" text NOT NULL,
  "locale" text NOT NULL,
  "intro" text NOT NULL,
  "outro" text NOT NULL,
  "question_count" integer NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "surveys_audience_chk" CHECK ("audience" IN ('b2b', 'b2c')),
  CONSTRAINT "surveys_locale_chk" CHECK ("locale" IN ('ru', 'kk', 'en'))
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "surveys_active_idx" ON "surveys" ("is_active") WHERE "is_active" = true;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "survey_questions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "survey_id" uuid NOT NULL,
  "position" integer NOT NULL,
  "group_key" text NOT NULL,
  "group_title" text NOT NULL,
  "question_text" text NOT NULL,
  "hint" text,
  "is_required" boolean DEFAULT true NOT NULL,
  CONSTRAINT "survey_questions_position_uq" UNIQUE ("survey_id", "position"),
  CONSTRAINT "survey_questions_position_positive_chk" CHECK ("position" > 0)
);
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "survey_questions" ADD CONSTRAINT "survey_questions_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "survey_questions_survey_position_idx"
  ON "survey_questions" ("survey_id", "position");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "survey_responses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "survey_id" uuid NOT NULL,
  "full_name" text NOT NULL,
  "phone" text NOT NULL,
  "email" text NOT NULL,
  "answers" jsonb NOT NULL,
  "ip_address" text,
  "user_agent" text,
  "honeypot_filled" boolean DEFAULT false NOT NULL,
  "submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "survey_responses_full_name_not_blank_chk" CHECK (length(trim("full_name")) > 0),
  CONSTRAINT "survey_responses_phone_format_chk" CHECK ("phone" ~ '^\+7[0-9]{10}$'),
  CONSTRAINT "survey_responses_email_format_chk" CHECK ("email" ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "survey_responses_survey_submitted_idx"
  ON "survey_responses" ("survey_id", "submitted_at" DESC);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "survey_responses_phone_idx"
  ON "survey_responses" ("phone");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "survey_responses_submitted_idx"
  ON "survey_responses" ("submitted_at" DESC);
