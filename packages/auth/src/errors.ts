export type AuthErrorCode =
  | 'TOKEN_INVALID'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_MALFORMED'
  | 'TOKEN_WRONG_ISSUER'
  | 'TOKEN_WRONG_AUDIENCE'
  | 'TOKEN_CLAIMS_INVALID'
  | 'KEY_INVALID'
  | 'PASSWORD_TOO_SHORT'
  | 'PASSWORD_INVALID'
  | 'RATE_LIMITED'
  | 'FORBIDDEN'

export class AuthError extends Error {
  readonly code: AuthErrorCode

  constructor(code: AuthErrorCode, message: string) {
    super(message)
    this.name = 'AuthError'
    this.code = code
  }
}
