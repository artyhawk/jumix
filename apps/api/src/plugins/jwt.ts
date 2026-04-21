import { readFile } from 'node:fs/promises'
import type { AccessTokenConfig } from '@jumix/auth'
import { loadSigningKey, loadVerificationKey } from '@jumix/auth'
import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { exportPKCS8, exportSPKI, generateKeyPair } from 'jose'
import { AppError } from '../lib/errors'

/**
 * JWT access-token config plugin.
 *
 * Стратегия загрузки ключей:
 *  1. Если заданы JWT_PRIVATE_KEY_PATH и JWT_PUBLIC_KEY_PATH → читаем PEM-файлы с диска.
 *  2. Иначе в dev/test → генерируем ephemeral RSA keypair in-memory с WARN-логом.
 *     После рестарта процесса все ранее выданные access-токены становятся
 *     недействительными — это сознательный trade-off для удобства разработки.
 *  3. В production без путей к ключам → fatal при boot. Не позволяем поднять
 *     продовый сервис с эфемерными ключами (ротация ключей превратилась бы в
 *     ротацию всех сессий при каждом deploy'е).
 *
 * Декорирует fastify инстанс `app.jwtConfig` — готовым AccessTokenConfig,
 * который используется в auth-handlers для signAccessToken/verifyAccessToken.
 */
const jwtPlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  const env = app.appEnv
  const privatePath = env.JWT_PRIVATE_KEY_PATH
  const publicPath = env.JWT_PUBLIC_KEY_PATH

  let signingKey: Awaited<ReturnType<typeof loadSigningKey>>
  let verificationKey: Awaited<ReturnType<typeof loadVerificationKey>>

  if (privatePath && publicPath) {
    const [privatePem, publicPem] = await Promise.all([
      readFile(privatePath, 'utf8'),
      readFile(publicPath, 'utf8'),
    ])
    signingKey = await loadSigningKey(privatePem)
    verificationKey = await loadVerificationKey(publicPem)
    app.log.info('jwt: loaded RSA keypair from disk')
  } else {
    if (env.NODE_ENV === 'production') {
      throw new AppError({
        statusCode: 500,
        code: 'JWT_KEYS_MISSING',
        message: 'JWT_PRIVATE_KEY_PATH and JWT_PUBLIC_KEY_PATH must be set in production',
      })
    }
    const pair = await generateKeyPair('RS256', { modulusLength: 2048, extractable: true })
    const [privatePem, publicPem] = await Promise.all([
      exportPKCS8(pair.privateKey),
      exportSPKI(pair.publicKey),
    ])
    signingKey = await loadSigningKey(privatePem)
    verificationKey = await loadVerificationKey(publicPem)
    app.log.warn(
      'jwt: generated ephemeral RSA keypair — all tokens invalidated on restart. Set JWT_PRIVATE_KEY_PATH/JWT_PUBLIC_KEY_PATH for stable keys.',
    )
  }

  const config: AccessTokenConfig = {
    signingKey,
    verificationKey,
    ttlSeconds: env.JWT_ACCESS_TTL_SECONDS,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  }

  app.decorate('jwtConfig', config)
}

export default fp(jwtPlugin, { name: 'jwt' })

declare module 'fastify' {
  interface FastifyInstance {
    jwtConfig: AccessTokenConfig
  }
}
