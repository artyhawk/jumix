import { z } from 'zod'

const uuid = z.string().uuid()

/**
 * Access token claims, §5.1 CLAUDE.md + ADR 0003 (operator loses org).
 * - sub: user_id
 * - org: organization_id — null для superadmin И operator (последнее — с
 *        B2d-1: operator работает в N дочках через organization_operators,
 *        JWT не несёт одну). Only `owner` всегда имеет org != null.
 * - role: superadmin | owner | operator
 * - tv: token_version — инкрементируется при logout-all и обесценивает
 *       все выданные ранее access-токены (§5.5)
 * - jti: unique id — для аудита и чёрного списка при инциденте
 */
export const accessTokenClaimsSchema = z
  .object({
    sub: uuid,
    org: uuid.nullable(),
    role: z.enum(['superadmin', 'owner', 'operator']),
    tv: z.number().int().nonnegative(),
    iat: z.number().int().nonnegative(),
    exp: z.number().int().positive(),
    jti: uuid,
    iss: z.string().min(1),
    aud: z.string().min(1),
  })
  .superRefine((c, ctx) => {
    // Only owner должен иметь org. superadmin — всегда null (constraint БД).
    // operator после B2d-1 — null (работает через organization_operators M:N).
    if (c.role === 'superadmin' && c.org !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'superadmin must have org=null',
        path: ['org'],
      })
    }
    if (c.role === 'operator' && c.org !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'operator must have org=null (M:N via organization_operators)',
        path: ['org'],
      })
    }
    if (c.role === 'owner' && c.org === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'owner must have non-null org',
        path: ['org'],
      })
    }
  })

export type AccessTokenClaims = z.infer<typeof accessTokenClaimsSchema>
