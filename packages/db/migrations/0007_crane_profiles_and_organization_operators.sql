-- Migration 0007: operators refactor — crane_profiles + organization_operators (ADR 0003).
--
-- Split одной плоской `operators` на две таблицы:
--   * crane_profiles — глобальная идентичность крановщика (ФИО, ИИН, avatar,
--     specialization). IIN теперь глобальный UNIQUE среди живых. Approval-gate
--     через `approval_status` (pipeline 1: platform-level).
--   * organization_operators — M:N membership (какой профиль в каких дочках
--     работает). Отдельный approval-gate (pipeline 2: per-hire). Сюда
--     переезжают employment-поля (hired_at, terminated_at, status, availability).
--
-- Backfill: каждая строка operators → 1 crane_profile + 1 organization_operator
-- (оба approved, т.к. уже implicit работают). `organization_operators.id`
-- preserved из `operators.id` для audit-log continuity (targetId ссылки).
-- `approved_by_user_id = NULL` и `approved_at = operators.created_at` для
-- backfilled записей — помечаем их как historical baseline, не как действие
-- реального актора.
--
-- Риск IIN-collision между orgs в legacy data: в B2b-dev 1 org → коллизий
-- нет. Production-deploy должен проверить `SELECT iin, COUNT(DISTINCT user_id)
-- FROM operators WHERE deleted_at IS NULL GROUP BY iin HAVING COUNT(*) > 1`
-- перед применением.
--
-- DROP TABLE operators — полная замена (не keep-for-compat): compat-shim
-- живёт на уровне OperatorRepository (JOIN), не на уровне БД.

CREATE TYPE "public"."crane_profile_approval_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."organization_operator_approval_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "crane_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"patronymic" text,
	"iin" text NOT NULL,
	"avatar_key" text,
	"specialization" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"approval_status" "crane_profile_approval_status" DEFAULT 'pending' NOT NULL,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"rejected_by_user_id" uuid,
	"rejected_at" timestamp with time zone,
	"rejection_reason" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crane_profiles_iin_format_chk" CHECK ("crane_profiles"."iin" ~ '^[0-9]{12}$')
);
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "crane_profiles" ADD CONSTRAINT "crane_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "crane_profiles" ADD CONSTRAINT "crane_profiles_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "crane_profiles" ADD CONSTRAINT "crane_profiles_rejected_by_user_id_users_id_fk" FOREIGN KEY ("rejected_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "organization_operators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"crane_profile_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"hired_at" date,
	"terminated_at" date,
	"status" "operator_status" DEFAULT 'active' NOT NULL,
	"availability" "operator_availability",
	"approval_status" "organization_operator_approval_status" DEFAULT 'pending' NOT NULL,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"rejected_by_user_id" uuid,
	"rejected_at" timestamp with time zone,
	"rejection_reason" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_operators_availability_only_when_active_chk" CHECK ("organization_operators"."availability" IS NULL OR "organization_operators"."status" = 'active')
);
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "organization_operators" ADD CONSTRAINT "organization_operators_crane_profile_id_crane_profiles_id_fk" FOREIGN KEY ("crane_profile_id") REFERENCES "public"."crane_profiles"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "organization_operators" ADD CONSTRAINT "organization_operators_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "organization_operators" ADD CONSTRAINT "organization_operators_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "organization_operators" ADD CONSTRAINT "organization_operators_rejected_by_user_id_users_id_fk" FOREIGN KEY ("rejected_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

-- Backfill. Сделано в одной транзакции для атомарности: если operators пусто
-- (свежий тестовый DB), обе INSERT ... SELECT завершатся как no-op, это OK.
-- Если operators содержит записи — каждая строка породит ровно один
-- crane_profile и один organization_operator, оба approved. crane_profile.id
-- = operator.id обеспечивает FK-связь между созданными в этой же транзакции
-- organization_operators.crane_profile_id и crane_profiles.id. (Мы
-- используем operators.id как primary key для crane_profile — безопасно, т.к.
-- далее operators DROPN'ется и id'шник больше никуда не ссылается.
-- organization_operators.id ТОЖЕ = operators.id — это важнее, т.к. на него
-- указывает audit_log.target_id, который мы не трогаем.)

INSERT INTO "crane_profiles" (
  "id", "user_id", "first_name", "last_name", "patronymic", "iin",
  "avatar_key", "specialization",
  "approval_status", "approved_by_user_id", "approved_at",
  "deleted_at", "created_at", "updated_at"
)
SELECT
  "id", "user_id", "first_name", "last_name", "patronymic", "iin",
  "avatar_key", "specialization",
  'approved', NULL, "created_at",
  "deleted_at", "created_at", "updated_at"
FROM "operators";--> statement-breakpoint

INSERT INTO "organization_operators" (
  "id", "crane_profile_id", "organization_id",
  "hired_at", "terminated_at", "status", "availability",
  "approval_status", "approved_by_user_id", "approved_at",
  "deleted_at", "created_at", "updated_at"
)
SELECT
  "id", "id", "organization_id",
  "hired_at", "terminated_at", "status", "availability",
  'approved', NULL, "created_at",
  "deleted_at", "created_at", "updated_at"
FROM "operators";--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "crane_profiles_iin_unique_active_idx" ON "crane_profiles" USING btree ("iin") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "crane_profiles_user_unique_active_idx" ON "crane_profiles" USING btree ("user_id") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crane_profiles_pending_approval_idx" ON "crane_profiles" USING btree ("created_at") WHERE approval_status = 'pending' AND deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crane_profiles_user_idx" ON "crane_profiles" USING btree ("user_id");--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "organization_operators_profile_org_unique_active_idx" ON "organization_operators" USING btree ("crane_profile_id","organization_id") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organization_operators_org_approved_idx" ON "organization_operators" USING btree ("organization_id") WHERE deleted_at IS NULL AND approval_status = 'approved' AND status <> 'terminated';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organization_operators_pending_approval_idx" ON "organization_operators" USING btree ("created_at") WHERE approval_status = 'pending' AND deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organization_operators_profile_idx" ON "organization_operators" USING btree ("crane_profile_id") WHERE deleted_at IS NULL;--> statement-breakpoint

-- Старая операторная таблица больше не нужна: compat-shim живёт в
-- OperatorRepository через JOIN, а не в БД. audit_log.target_id ссылки на
-- operators.id остаются валидными, т.к. мы сохранили тот же id в
-- organization_operators.
DROP TABLE "operators";
