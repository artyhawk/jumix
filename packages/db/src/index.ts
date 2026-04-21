export * as schema from './schema/index'
export {
  organizations,
  users,
  refreshTokens,
  authEvents,
  passwordResetTokens,
  auditLog,
  userRoleEnum,
  userStatusEnum,
  organizationStatusEnum,
  authEventTypeEnum,
  type Organization,
  type NewOrganization,
  type User,
  type NewUser,
  type RefreshToken,
  type NewRefreshToken,
  type AuthEvent,
  type NewAuthEvent,
  type PasswordResetToken,
  type NewPasswordResetToken,
  type AuditEntry,
  type NewAuditEntry,
} from './schema/index'

export { createDatabase, type DatabaseClient, type CreateDatabaseOptions } from './client'
