-- Migration 0006: cranes approval workflow (ADR 0002 — holding-approval model).
--
-- Добавляет admin-gated approval_status к cranes, ортогональный operational
-- status. Новые записи создаются как 'pending', существующие backfill'им
-- как 'approved' (они уже работали — implicit approval).
--
-- Rebuild'ит два существующих partial index'а — включаем в их WHERE
-- условия проверку `approval_status <> 'rejected'` / `= 'approved'`.
-- Добавляет новый cranes_pending_approval_idx для hot path холдинга.
--
-- approved_by_user_id / rejected_by_user_id — ссылки на users, ON DELETE
-- SET NULL (удаление admin-пользователя не должно ломать исторический
-- audit trail; id actor'а в этих полях опциональный).

CREATE TYPE "public"."crane_approval_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint

ALTER TABLE "cranes" ADD COLUMN "approval_status" "crane_approval_status";--> statement-breakpoint

-- Backfill existing rows: все уже работающие краны считаем одобренными.
UPDATE "cranes" SET "approval_status" = 'approved' WHERE "approval_status" IS NULL;--> statement-breakpoint

ALTER TABLE "cranes" ALTER COLUMN "approval_status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "cranes" ALTER COLUMN "approval_status" SET DEFAULT 'pending';--> statement-breakpoint

ALTER TABLE "cranes" ADD COLUMN "approved_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "cranes" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cranes" ADD COLUMN "rejected_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "cranes" ADD COLUMN "rejected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cranes" ADD COLUMN "rejection_reason" text;--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "cranes" ADD CONSTRAINT "cranes_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "cranes" ADD CONSTRAINT "cranes_rejected_by_user_id_users_id_fk" FOREIGN KEY ("rejected_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

-- Rebuild partial indexes с учётом approval_status.
DROP INDEX IF EXISTS "cranes_organization_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "cranes_site_idx";--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "cranes_organization_idx" ON "cranes" USING btree ("organization_id") WHERE deleted_at IS NULL AND status <> 'retired' AND approval_status <> 'rejected';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cranes_site_idx" ON "cranes" USING btree ("site_id") WHERE site_id IS NOT NULL AND status = 'active' AND approval_status = 'approved' AND deleted_at IS NULL;--> statement-breakpoint

-- Hot path для superadmin'а: approval queue (pending заявки глобально).
CREATE INDEX IF NOT EXISTS "cranes_pending_approval_idx" ON "cranes" USING btree ("created_at" DESC) WHERE approval_status = 'pending' AND deleted_at IS NULL;
