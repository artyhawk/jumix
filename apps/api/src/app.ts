import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import sensible from '@fastify/sensible'
import type { DatabaseClient } from '@jumix/db'
import { type FastifyInstance, fastify } from 'fastify'
import type { Env } from './config/env'
import authPlugin from './modules/auth/auth.plugin'
import craneProfilePlugin from './modules/crane-profile/crane-profile.plugin'
import cranePlugin from './modules/crane/crane.plugin'
import organizationOperatorPlugin from './modules/organization-operator/organization-operator.plugin'
import organizationPlugin from './modules/organization/organization.plugin'
import registrationPlugin from './modules/registration/registration.plugin'
import sitePlugin from './modules/site/site.plugin'
import authenticatePlugin from './plugins/authenticate'
import { registerErrorHandler } from './plugins/error-handler'
import jwtPlugin from './plugins/jwt'
import organizationContextPlugin from './plugins/organization-context'
import redisPlugin from './plugins/redis'
import storagePlugin from './plugins/storage'
import { registerHealthRoutes } from './routes/health'

export interface AppDeps {
  env: Env
  database: DatabaseClient
}

/**
 * Единая точка создания Fastify-инстанса. Вызывается и в server.ts (prod),
 * и в tests/helpers/build-test-app.ts (integration-тесты через fastify.inject()).
 *
 * App декорируется зависимостями (`app.db`, `app.appEnv`) — модули достают
 * их через request.server.db, не через глобальные имопорты. Это даёт
 * изоляцию тестовых инстансов (каждый тест — свой app + свой Testcontainers).
 */
export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = fastify({
    logger: buildLoggerConfig(deps.env),
    trustProxy: true,
    disableRequestLogging: deps.env.NODE_ENV === 'test',
    ajv: {
      customOptions: {
        coerceTypes: false,
        removeAdditional: 'all',
      },
    },
  })

  app.decorate('appEnv', deps.env)
  app.decorate('db', deps.database)

  registerErrorHandler(app)

  await app.register(sensible)
  await app.register(helmet, {
    contentSecurityPolicy: false, // CSP настраивается на edge (nginx)
  })
  await app.register(cors, {
    origin: deps.env.CORS_ORIGINS.length > 0 ? deps.env.CORS_ORIGINS : false,
    credentials: true,
  })
  await app.register(cookie)

  await app.register(jwtPlugin)
  await app.register(redisPlugin)
  await app.register(storagePlugin)
  await app.register(authenticatePlugin)
  await app.register(organizationContextPlugin)

  await app.register(registerHealthRoutes)
  await app.register(authPlugin)
  await app.register(organizationPlugin)
  await app.register(sitePlugin)
  await app.register(cranePlugin)
  await app.register(craneProfilePlugin)
  await app.register(organizationOperatorPlugin)
  await app.register(registrationPlugin)

  return app
}

function buildLoggerConfig(env: Env): import('fastify').FastifyServerOptions['logger'] {
  if (env.NODE_ENV === 'test') return false
  if (env.NODE_ENV === 'development') {
    return {
      level: env.LOG_LEVEL,
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss.l',
          ignore: 'pid,hostname',
        },
      },
    }
  }
  return { level: env.LOG_LEVEL }
}

declare module 'fastify' {
  interface FastifyInstance {
    appEnv: Env
    db: DatabaseClient
  }
}
