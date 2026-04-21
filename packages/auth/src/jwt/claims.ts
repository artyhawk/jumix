import { z } from 'zod'

const uuid = z.string().uuid()

/**
 * Access token claims, §5.1 CLAUDE.md.
 * - sub: user_id
 * - org: organization_id (null только для superadmin)
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
    // CLAUDE.md §4.2 + users_org_role_consistency_chk: superadmin → org=null, остальные → org!=null
    if (c.role === 'superadmin' && c.org !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'superadmin must have org=null',
        path: ['org'],
      })
    }
    if (c.role !== 'superadmin' && c.org === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${c.role} must have non-null org`,
        path: ['org'],
      })
    }
  })

export type AccessTokenClaims = z.infer<typeof accessTokenClaimsSchema>
