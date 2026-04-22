import { z } from 'zod'

/**
 * Zod-схемы для organization-operators endpoints (ADR 0003 — hire pipeline 2).
 *
 * Strip-режим молча удаляет незнакомые поля — попытки передать organizationId,
 * approvalStatus, userId, status, availability через body/query игнорируются.
 * Защита от injection'а:
 *   1) tenant scope идёт через ctx (owner → ctx.organizationId; superadmin → global);
 *   2) approval_status меняется ТОЛЬКО через :id/approve + :id/reject;
 *   3) status меняется ТОЛЬКО через :id/status;
 *   4) identity полей (ФИО, ИИН, specialization) в этом модуле нет — они
 *      живут на crane_profiles и правятся в crane-profile модуле.
 */

const reasonSchema = z.string().trim().min(1).max(500)

/**
 * POST /api/v1/organization-operators — owner hires existing approved crane_profile.
 * Создаёт pending organization_operator (approval pipeline 2). identity'ные
 * поля НЕ принимает — crane_profile должен уже существовать и быть approved.
 */
export const hireOrganizationOperatorSchema = z
  .object({
    craneProfileId: z.string().uuid(),
    hiredAt: z.coerce.date().optional(),
  })
  .strict()
export type HireOrganizationOperatorInput = z.infer<typeof hireOrganizationOperatorSchema>

/**
 * PATCH /api/v1/organization-operators/:id — admin update hire-level fields.
 * identity (ФИО, ИИН, specialization) переехал на crane_profiles. Здесь остаётся
 * только hiredAt — `terminatedAt` вычисляется state machine'ом changeStatus.
 * status/approvalStatus/availability через отдельные endpoints.
 */
export const updateOrganizationOperatorAdminSchema = z
  .object({
    hiredAt: z.coerce.date().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' })
export type UpdateOrganizationOperatorAdminInput = z.infer<
  typeof updateOrganizationOperatorAdminSchema
>

export const changeOrganizationOperatorStatusSchema = z.object({
  status: z.enum(['active', 'blocked', 'terminated']),
  reason: reasonSchema.optional(),
})
export type ChangeOrganizationOperatorStatusInput = z.infer<
  typeof changeOrganizationOperatorStatusSchema
>

export const rejectOrganizationOperatorSchema = z.object({
  reason: reasonSchema,
})
export type RejectOrganizationOperatorInput = z.infer<typeof rejectOrganizationOperatorSchema>

/**
 * GET /api/v1/organization-operators — список найма.
 *   - owner scope: только своя org (ctx.organizationId). `organizationId` query
 *     отсутствует в схеме и strip'ится.
 *   - superadmin scope: global; `organizationId` / `craneProfileId` — optional
 *     фильтры для навигации по pending-очереди или истории конкретного профиля.
 *   - approvalStatus default — 'approved' (operational список, не шумит
 *     pending/rejected). approvalStatus=pending — approval queue UX.
 */
export const listOrganizationOperatorsQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(200).optional(),
  status: z.enum(['active', 'blocked', 'terminated']).optional(),
  approvalStatus: z.enum(['pending', 'approved', 'rejected', 'all']).default('approved'),
  craneProfileId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
})
export type ListOrganizationOperatorsQuery = z.infer<typeof listOrganizationOperatorsQuerySchema>

export const organizationOperatorIdParamsSchema = z.object({
  id: z.string().uuid(),
})
