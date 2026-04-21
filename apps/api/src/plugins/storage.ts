import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { InMemoryStorageClient } from '../lib/storage/memory-storage-client'
import { MinioStorageClient } from '../lib/storage/minio-storage-client'
import type { StorageClient } from '../lib/storage/types'

/**
 * StorageClient как Fastify-декоратор. Модули (documents, avatars) не
 * импортируют конкретный клиент — только через `app.storage`.
 *
 * Driver-selection по env (см. config/env.ts):
 *   STORAGE_ENDPOINT задан → MinioStorageClient (minio npm-пакет,
 *     dynamic-import чтобы пакет не тащился в in-memory bundle, как с ioredis)
 *   не задан                → InMemoryStorageClient (test/dev без compose)
 *
 * ensureBucket вызывается при STORAGE_ENSURE_BUCKET=true (default в dev/test).
 * В prod бакет провижинится инфрой, плагин его не трогает.
 *
 * Lifecycle:
 *  - минио-клиент не держит долгоживущих соединений (HTTP keep-alive через
 *    node.http агент), отдельный onClose не нужен
 *  - InMemory — GC'ится вместе с app
 */

type MinioCtor = new (opts: {
  endPoint: string
  port?: number
  useSSL?: boolean
  accessKey?: string
  secretKey?: string
  region?: string
  pathStyle?: boolean
}) => import('minio').Client

const storagePlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  const env = app.appEnv
  let client: StorageClient

  if (env.STORAGE_ENDPOINT) {
    if (!env.STORAGE_ACCESS_KEY || !env.STORAGE_SECRET_KEY) {
      throw new Error(
        'STORAGE_ENDPOINT is set but STORAGE_ACCESS_KEY / STORAGE_SECRET_KEY are missing',
      )
    }
    // Dynamic-import чтобы минио не попадал в тестовый граф (где драйвер InMemory).
    // Та же схема, что в plugins/redis.ts с ioredis.
    const minioModuleName = 'minio'
    const mod = (await import(minioModuleName).catch(() => {
      throw new Error('STORAGE_ENDPOINT set but `minio` is not installed')
    })) as { Client: MinioCtor }

    const { endpoint, port, useSSL } = parseEndpoint(env.STORAGE_ENDPOINT)
    const minioClient = new mod.Client({
      endPoint: endpoint,
      port,
      useSSL,
      accessKey: env.STORAGE_ACCESS_KEY,
      secretKey: env.STORAGE_SECRET_KEY,
      region: env.STORAGE_REGION,
      pathStyle: env.STORAGE_FORCE_PATH_STYLE,
    })

    client = new MinioStorageClient({
      client: minioClient,
      bucket: env.STORAGE_BUCKET,
      region: env.STORAGE_REGION,
      presign: {
        getTtlSeconds: env.STORAGE_PRESIGN_GET_TTL_SECONDS,
        putTtlSeconds: env.STORAGE_PRESIGN_PUT_TTL_SECONDS,
        partTtlSeconds: env.STORAGE_PRESIGN_PART_TTL_SECONDS,
      },
    })
  } else {
    client = new InMemoryStorageClient()
  }

  // Default: в dev/test автоматически создаём бакет, в prod — только
  // если админ явно выставил STORAGE_ENSURE_BUCKET=true (инфра обычно
  // провижинит bucket сама, но self-hosted без Terraform удобно иметь fallback).
  const ensureDefault = env.NODE_ENV !== 'production'
  const shouldEnsure = env.STORAGE_ENSURE_BUCKET ?? ensureDefault
  if (shouldEnsure) {
    await client.ensureBucket()
  }

  app.decorate('storage', client)
}

function parseEndpoint(raw: string): { endpoint: string; port: number; useSSL: boolean } {
  const url = new URL(raw)
  const useSSL = url.protocol === 'https:'
  const port = url.port ? Number(url.port) : useSSL ? 443 : 80
  return { endpoint: url.hostname, port, useSSL }
}

export default fp(storagePlugin, { name: 'storage' })

declare module 'fastify' {
  interface FastifyInstance {
    storage: StorageClient
  }
}
