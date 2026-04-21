import { defineConfig } from 'drizzle-kit'

const databaseUrl =
  process.env.DATABASE_URL ?? 'postgresql://jumix:jumix_dev_pwd@localhost:5432/jumix'

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  casing: 'snake_case',
  strict: true,
  verbose: true,
  dbCredentials: {
    url: databaseUrl,
  },
})
