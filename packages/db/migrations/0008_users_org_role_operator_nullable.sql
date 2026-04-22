-- Migration 0008: relax users_org_role_consistency_chk for role='operator'.
--
-- Why: public registration flow (B2d-3) creates a user with role='operator'
-- BEFORE any organization_operator hire exists (ADR 0003 — crane_profile
-- identity is global, not org-scoped). The original constraint required
-- organization_id NOT NULL for any non-superadmin, which blocks this path.
--
-- New rule:
--   superadmin → org IS NULL   (unchanged)
--   owner      → org IS NOT NULL (unchanged — owner is always a specific org)
--   operator   → org IS NULL   (ADR 0003: operator lives at platform level;
--                               per-org context comes from organization_operators
--                               resolved via X-Organization-Id header)
--
-- Legacy rows (pre-ADR 0003) with role='operator' + org IS NOT NULL could
-- exist in production only if this migration runs after un-backfilled data;
-- in B2d-dev the operators table was fully migrated to organization_operators
-- in 0007, so all surviving user rows with role='operator' already point to
-- orphan org_id that is still tolerated here (NULL-or-not). We intentionally
-- keep the predicate permissive for operator to avoid requiring a data
-- migration at this step. A follow-up that forces org IS NULL for operator
-- can land once production snapshots are inspected.

ALTER TABLE "users" DROP CONSTRAINT "users_org_role_consistency_chk";--> statement-breakpoint

ALTER TABLE "users" ADD CONSTRAINT "users_org_role_consistency_chk" CHECK (
  ("users"."role" = 'superadmin' AND "users"."organization_id" IS NULL)
  OR ("users"."role" = 'owner' AND "users"."organization_id" IS NOT NULL)
  OR ("users"."role" = 'operator')
);
