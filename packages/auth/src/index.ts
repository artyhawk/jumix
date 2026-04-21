export { AuthError, type AuthErrorCode } from './errors'

export {
  type AccessTokenClaims,
  type AccessTokenConfig,
  type SignAccessInput,
  accessTokenClaimsSchema,
  JWT_ALG,
  loadSigningKey,
  loadVerificationKey,
  signAccessToken,
  verifyAccessToken,
} from './jwt'

export {
  type GeneratedRefreshToken,
  REFRESH_TOKEN_BYTES,
  REFRESH_TOKEN_HASH_BYTES,
  generateRefreshToken,
  hashRefreshToken,
  verifyRefreshToken,
} from './refresh'

export {
  ARGON2_OPTIONS,
  MIN_PASSWORD_LENGTH,
  hashPassword,
  needsRehash,
  verifyPassword,
} from './password'

export {
  type AuthContext,
  type ListScope,
  type UserRole,
  isOperator,
  isOwner,
  isSelf,
  isSuperadmin,
  sameOrganization,
  tenantListScope,
} from './policy'

export {
  type RateLimitConfig,
  type RateLimitResult,
  type RateLimiter,
  type RedisLikeClient,
  MemoryRateLimiter,
  RedisRateLimiter,
} from './rate-limit'
