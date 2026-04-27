import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { registerSurveyRoutes } from './survey.routes'
import { SurveyService } from './survey.service'

const surveyPlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  const service = new SurveyService(app.db, app.log)
  app.decorate('surveyService', service)
  await app.register(registerSurveyRoutes)
}

export default fp(surveyPlugin, {
  name: 'survey',
  dependencies: ['authenticate'],
})

declare module 'fastify' {
  interface FastifyInstance {
    surveyService: SurveyService
  }
}
