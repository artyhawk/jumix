import rateLimit from '@fastify/rate-limit'
import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { AppError } from '../../lib/errors'
import {
  idParamSchema,
  listResponsesQuerySchema,
  slugParamSchema,
  submitSurveyResponseSchema,
} from './survey.schemas'

/**
 * Survey REST endpoints (B3-SURVEY).
 *
 * Public (no auth):
 *   GET  /api/v1/surveys/:slug                 fetch active survey + questions
 *   POST /api/v1/surveys/:slug/responses       submit response (rate-limited)
 *
 * Admin (superadmin only):
 *   GET  /api/v1/admin/surveys                              list templates с counts
 *   GET  /api/v1/admin/surveys/:slug                        survey detail (включая inactive)
 *   GET  /api/v1/admin/surveys/:slug/responses              paginated responses
 *   GET  /api/v1/admin/surveys/:slug/responses/:id          single response detail
 */
export const registerSurveyRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Public endpoints — без app.authenticate. Submission rate-limited per IP.
  await app.register(
    async (publicScope) => {
      // Local rate-limit registration (global=false в plugin), включена per-route
      // через config.rateLimit. 3 submissions per IP per 24h — слегка relaxed
      // относительно 1/24h, accounts для legitimate retries / shared offices.
      await publicScope.register(rateLimit, {
        global: false,
      })

      publicScope.get('/:slug', async (request) => {
        const { slug } = slugParamSchema.parse(request.params)
        return app.surveyService.getPublicBySlug(slug)
      })

      publicScope.post(
        '/:slug/responses',
        {
          config: {
            rateLimit: {
              max: 3,
              timeWindow: '24 hours',
              keyGenerator: (req) => req.ip,
              errorResponseBuilder: (_req, context) =>
                new AppError({
                  statusCode: 429,
                  code: 'RATE_LIMIT_EXCEEDED',
                  message: 'Слишком много отправок с этого адреса. Попробуйте позже.',
                  details: { retryAfterMs: context.ttl },
                }),
            },
          },
        },
        async (request, reply) => {
          const { slug } = slugParamSchema.parse(request.params)
          const body = submitSurveyResponseSchema.parse(request.body)
          const result = await app.surveyService.submitResponse(slug, body, {
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'] ?? null,
          })
          return reply.code(201).send(result)
        },
      )
    },
    { prefix: '/api/v1/surveys' },
  )

  // Admin endpoints — superadmin gated через service-policy после authenticate.
  app.register(
    async (scoped) => {
      scoped.addHook('preHandler', app.authenticate)

      scoped.get('/surveys', async (request) => {
        return app.surveyService.listAdmin(request.ctx)
      })

      scoped.get('/surveys/:slug', async (request) => {
        const { slug } = slugParamSchema.parse(request.params)
        return app.surveyService.getAdminBySlug(request.ctx, slug)
      })

      scoped.get('/surveys/:slug/responses', async (request) => {
        const { slug } = slugParamSchema.parse(request.params)
        const query = listResponsesQuerySchema.parse(request.query)
        return app.surveyService.listResponses(request.ctx, slug, query)
      })

      scoped.get('/surveys/:slug/responses/:id', async (request) => {
        const { slug } = slugParamSchema.parse(request.params)
        const { id } = idParamSchema.parse(request.params)
        return app.surveyService.getResponseDetail(request.ctx, slug, id)
      })
    },
    { prefix: '/api/v1/admin' },
  )
}
