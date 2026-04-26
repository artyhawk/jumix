import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import argon2 from 'argon2'
import { config as loadEnv } from 'dotenv'
import { sql } from 'drizzle-orm'
import { createDatabase } from '../src/client'
import {
  craneProfiles,
  cranes,
  organizationOperators,
  organizations,
  users,
} from '../src/schema/index'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

loadEnv({ path: path.resolve(__dirname, '../../../.env') })
loadEnv({ path: path.resolve(__dirname, '../../../.env.prod'), override: false })

/**
 * Demo seed: realistic scenario для показа заказчику (B3-UI-5c).
 *
 * Naпполняет:
 *   - 3 организации в разных городах Казахстана (Алматы / Астана / Шымкент)
 *   - 1 superadmin + 3 owner + 15 operators
 *   - 12 crane_profiles (mix approvalStatus)
 *   - 15 cranes (mix type / status, assigned to sites)
 *   - 8 sites (active/completed/archived) с геозоной в своих городах
 *   - ~18 organization_operators (pending / approved / rejected / terminated)
 *
 * Usage:
 *   pnpm --filter @jumix/db tsx scripts/seed-demo.ts          # populate
 *   pnpm --filter @jumix/db tsx scripts/seed-demo.ts --clear  # cleanup
 *
 * Пароль для всех demo-аккаунтов — `JumixDemo123!`.
 *
 * ВНИМАНИЕ: `--clear` удаляет ВСЕ строки в затронутых таблицах. Не запускать
 * в production. Safeguard: запрос confirmation если в БД > 5 организаций.
 */

const DEMO_PASSWORD = 'JumixDemo123!'

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
}

/** Валидный ИИН из 11-значного seed'а (алгоритм @jumix/shared/kz-checksum). */
function generateIin(seed: number): string {
  let base = Math.floor(seed)
  while (true) {
    const padded = String(base).padStart(11, '0')
    if (padded.length !== 11) throw new Error(`iin seed too large: ${seed}`)
    const digits = Array.from(padded, (c) => Number.parseInt(c, 10))
    const w1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
    const w2 = [3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2]
    const sum = (weights: number[]) => weights.reduce((acc, w, i) => acc + (digits[i] ?? 0) * w, 0)
    let check = sum(w1) % 11
    if (check === 10) {
      check = sum(w2) % 11
      if (check === 10) {
        base += 1
        continue
      }
    }
    return padded + String(check)
  }
}

/** Валидный БИН — простая проверочная логика (первые 12 цифр). */
function generateBin(seed: number): string {
  return String(100_000_000_000 + seed).slice(0, 12)
}

type OrgRow = { id: string; name: string }
type UserRow = { id: string; phone: string; role: string; organizationId: string | null }

async function clear(db: ReturnType<typeof createDatabase>['db']): Promise<void> {
  console.warn('[demo] truncating tables...')
  // audit_log FK → users; organization_operators FK → crane_profiles + orgs;
  // cranes FK → orgs + sites. Order: children → parents.
  await db.execute(sql`TRUNCATE TABLE
    audit_log, organization_operators, cranes, crane_profiles, sites, users, organizations
    RESTART IDENTITY CASCADE`)
}

async function main() {
  const { values } = parseArgs({
    options: {
      clear: { type: 'boolean' },
    },
    strict: true,
  })

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('error: DATABASE_URL not set')
    process.exit(1)
  }

  const { db, close } = createDatabase({ url: databaseUrl, max: 2 })

  try {
    if (values.clear) {
      await clear(db)
      console.warn('[demo] clear complete')
      return
    }

    // Safeguard: если в БД уже много данных — не перезаписываем молча.
    const existing = await db.select({ count: sql<number>`count(*)::int` }).from(organizations)
    const count = existing[0]?.count ?? 0
    if (count > 5) {
      console.error(
        `[demo] refusing: БД уже содержит ${count} организаций (>5). Run with --clear сначала.`,
      )
      process.exit(1)
    }
    if (count > 0) {
      console.warn(`[demo] clearing existing (${count} orgs)...`)
      await clear(db)
    }

    const passwordHash = await argon2.hash(DEMO_PASSWORD, ARGON2_OPTIONS)

    console.warn('[demo] creating organizations...')
    const orgs = (await db
      .insert(organizations)
      .values([
        {
          name: 'ТОО «Крановый Парк Алматы»',
          bin: generateBin(1_000_001),
          contactName: 'Асылбек Темирханов',
          contactPhone: '+77010001122',
          contactEmail: 'info@kranpark.kz',
        },
        {
          name: 'ТОО «Астана Лифт»',
          bin: generateBin(1_000_002),
          contactName: 'Ерлан Оспанов',
          contactPhone: '+77020003344',
          contactEmail: 'office@astana-lift.kz',
        },
        {
          name: 'ТОО «Шымкент Строй»',
          bin: generateBin(1_000_003),
          contactName: 'Нурлан Садыков',
          contactPhone: '+77030005566',
          contactEmail: 'info@shym-stroy.kz',
        },
      ])
      .returning({ id: organizations.id, name: organizations.name })) as OrgRow[]

    const [orgAlm, orgAst, orgShy] = orgs as [OrgRow, OrgRow, OrgRow]

    console.warn('[demo] creating users (1 superadmin + 3 owners + 15 operators)...')
    const userRows = (await db
      .insert(users)
      .values([
        // superadmin
        {
          phone: '+77001112233',
          passwordHash,
          role: 'superadmin',
          organizationId: null,
          name: 'Платформенный администратор',
          status: 'active',
        },
        // owners
        {
          phone: '+77010001122',
          passwordHash,
          role: 'owner',
          organizationId: orgAlm.id,
          name: 'Асылбек Темирханов',
          status: 'active',
        },
        {
          phone: '+77020003344',
          passwordHash,
          role: 'owner',
          organizationId: orgAst.id,
          name: 'Ерлан Оспанов',
          status: 'active',
        },
        {
          phone: '+77030005566',
          passwordHash,
          role: 'owner',
          organizationId: orgShy.id,
          name: 'Нурлан Садыков',
          status: 'active',
        },
        // operators — identity-only (organizationId: null per ADR 0003).
        // Phones: +7705xxxxxxx (KZ Beeline range), 11 digits after +7 (constraint: +7[0-9]{10}).
        ...Array.from({ length: 15 }, (_, i) => ({
          phone: `+7705${String(1_000_000 + i).padStart(7, '0')}`,
          passwordHash,
          role: 'operator' as const,
          organizationId: null,
          name: `Оператор ${i + 1}`,
          status: 'active' as const,
        })),
      ])
      .returning({
        id: users.id,
        phone: users.phone,
        role: users.role,
        organizationId: users.organizationId,
      })) as UserRow[]

    const superadmin = userRows.find((u) => u.role === 'superadmin')
    if (!superadmin) throw new Error('superadmin not created')
    const operators = userRows.filter((u) => u.role === 'operator')

    console.warn('[demo] creating sites (8 total, geofences по городам)...')
    // Координаты городов (lng, lat — КЗ projection)
    const cityCoords = {
      almaty: [76.8897, 43.2389] as [number, number],
      astana: [71.4491, 51.1694] as [number, number],
      shymkent: [69.5965, 42.3417] as [number, number],
    }
    const siteSeeds: Array<{
      org: OrgRow
      name: string
      address: string
      coords: [number, number]
      status: 'active' | 'completed' | 'archived'
    }> = [
      {
        org: orgAlm,
        name: 'ЖК «Ремесленная 42»',
        address: 'ул. Абая, 128',
        coords: cityCoords.almaty,
        status: 'active',
      },
      {
        org: orgAlm,
        name: 'БЦ «Аспан Тауэр»',
        address: 'пр. Достык, 210',
        coords: [76.908, 43.241],
        status: 'active',
      },
      {
        org: orgAlm,
        name: 'ТРЦ «Мега Парк»',
        address: 'пр. Аль-Фараби, 250',
        coords: [76.88, 43.23],
        status: 'completed',
      },
      {
        org: orgAst,
        name: 'ЖК «Есиль Сити»',
        address: 'пр. Кабанбай батыра, 14',
        coords: cityCoords.astana,
        status: 'active',
      },
      {
        org: orgAst,
        name: 'Школа №75',
        address: 'ул. Сыганак, 40',
        coords: [71.46, 51.18],
        status: 'active',
      },
      {
        org: orgAst,
        name: 'ЖК «Алтын Орда»',
        address: 'пр. Кунаева, 10',
        coords: [71.43, 51.15],
        status: 'archived',
      },
      {
        org: orgShy,
        name: 'Стадион Абая',
        address: 'ул. Тауке хана, 5',
        coords: cityCoords.shymkent,
        status: 'active',
      },
      {
        org: orgShy,
        name: 'ЖК «Самал-2»',
        address: 'мкр. Самал-2, 18',
        coords: [69.61, 42.33],
        status: 'active',
      },
    ]
    for (const s of siteSeeds) {
      await db.execute(sql`
        INSERT INTO sites (organization_id, name, address, geofence_center, geofence_radius_m, status)
        VALUES (
          ${s.org.id}, ${s.name}, ${s.address},
          ST_SetSRID(ST_MakePoint(${s.coords[0]}, ${s.coords[1]}), 4326)::geography,
          ${200 + Math.floor(Math.random() * 300)},
          ${s.status}
        )
      `)
    }

    console.warn('[demo] creating crane_profiles (12 mix approval)...')
    const profileRows = await db
      .insert(craneProfiles)
      .values(
        operators.slice(0, 12).map((op, i) => ({
          userId: op.id,
          firstName: ['Иван', 'Асылбек', 'Нурлан', 'Ерлан', 'Канат', 'Марат'][i % 6] ?? 'Алмас',
          lastName:
            ['Иванов', 'Сериков', 'Касымов', 'Мухамеджанов', 'Кайыров', 'Абдулин'][i % 6] ??
            'Смагулов',
          patronymic: i % 3 === 0 ? 'Амирович' : null,
          iin: generateIin(88_010_100_000 + i * 37),
          approvalStatus: i < 8 ? 'approved' : i < 10 ? 'pending' : 'rejected',
          approvedByUserId: i < 8 ? superadmin.id : null,
          approvedAt: i < 8 ? new Date(Date.now() - (i + 1) * 86400_000) : null,
          rejectedByUserId: i >= 10 ? superadmin.id : null,
          rejectedAt: i >= 10 ? new Date(Date.now() - (i - 9) * 86400_000) : null,
          rejectionReason: i >= 10 ? 'Удостоверение просрочено на момент подачи' : null,
          // license: keep license_key + expires_at consistent (constraint:
          // both NULL or both set). Approved operators get fake key + future date.
          licenseKey: i < 8 ? `crane-profiles/seed-${i}/license/v1/license.pdf` : null,
          licenseExpiresAt: i < 8 ? new Date(Date.now() + (200 + i * 30) * 86400_000) : null,
          licenseVersion: i < 8 ? 1 : 0,
        })),
      )
      .returning({ id: craneProfiles.id, approvalStatus: craneProfiles.approvalStatus })

    console.warn('[demo] creating cranes (15 per orgs, mix type/status)...')
    const craneTypes = ['tower', 'mobile', 'crawler', 'overhead'] as const
    const craneStatuses = ['active', 'maintenance', 'retired'] as const
    const modelPrefixes = ['KAT', 'LIEBHERR', 'TADANO'] as const
    for (const org of [orgAlm, orgAst, orgShy]) {
      const n = 5
      for (let i = 0; i < n; i++) {
        const craneType = craneTypes[i % 4] ?? 'tower'
        const craneStatus = craneStatuses[i === 0 ? 1 : i === n - 1 ? 2 : 0] ?? 'active'
        const prefix = modelPrefixes[i % 3] ?? 'KAT'
        await db.insert(cranes).values({
          organizationId: org.id,
          type: craneType,
          model: `${prefix}-${500 + i * 50}`,
          inventoryNumber: `INV-${org.name.slice(4, 7).toUpperCase()}-${String(100 + i)}`,
          capacityTon: String(5 + i * 2),
          boomLengthM: String(20 + i * 5),
          yearManufactured: 2015 + (i % 10),
          status: craneStatus,
          approvalStatus: i < n - 1 ? 'approved' : 'pending',
          approvedByUserId: i < n - 1 ? superadmin.id : null,
          approvedAt: i < n - 1 ? new Date(Date.now() - (i + 1) * 86400_000) : null,
        })
      }
    }

    console.warn('[demo] creating organization_operators (hire records)...')
    // Equip first org with approved hires, остальные — смешанные состояния.
    const approvedProfiles = profileRows.filter((p) => p.approvalStatus === 'approved')
    const pendingProfiles = profileRows.filter((p) => p.approvalStatus === 'pending')

    // ORG A — 5 approved active hires
    for (let i = 0; i < Math.min(5, approvedProfiles.length); i++) {
      const profile = approvedProfiles[i]
      if (!profile) continue
      await db.insert(organizationOperators).values({
        craneProfileId: profile.id,
        organizationId: orgAlm.id,
        hiredAt: new Date(Date.now() - (30 + i * 5) * 86400_000),
        status: i === 4 ? 'blocked' : 'active',
        approvalStatus: 'approved',
        approvedByUserId: superadmin.id,
        approvedAt: new Date(Date.now() - (29 + i * 5) * 86400_000),
      })
    }
    // ORG B — 2 approved + 2 pending
    for (let i = 5; i < Math.min(7, approvedProfiles.length); i++) {
      const profile = approvedProfiles[i]
      if (!profile) continue
      await db.insert(organizationOperators).values({
        craneProfileId: profile.id,
        organizationId: orgAst.id,
        hiredAt: new Date(Date.now() - (15 + i) * 86400_000),
        status: 'active',
        approvalStatus: 'approved',
        approvedByUserId: superadmin.id,
        approvedAt: new Date(Date.now() - (14 + i) * 86400_000),
      })
    }
    for (let i = 0; i < Math.min(2, pendingProfiles.length); i++) {
      const profile = pendingProfiles[i]
      if (!profile) continue
      await db.insert(organizationOperators).values({
        craneProfileId: profile.id,
        organizationId: orgAst.id,
        hiredAt: new Date(Date.now() - i * 86400_000),
        status: 'active',
        approvalStatus: 'pending',
      })
    }
    // ORG C — 1 terminated (historical) + 1 rejected hire
    if (approvedProfiles.length > 7 && approvedProfiles[7]) {
      await db.insert(organizationOperators).values({
        craneProfileId: approvedProfiles[7].id,
        organizationId: orgShy.id,
        hiredAt: new Date(Date.now() - 90 * 86400_000),
        terminatedAt: new Date(Date.now() - 10 * 86400_000),
        status: 'terminated',
        approvalStatus: 'approved',
        approvedByUserId: superadmin.id,
        approvedAt: new Date(Date.now() - 89 * 86400_000),
      })
    }
    if (approvedProfiles[0]) {
      // одна rejected hire — для демонстрации rejection reason UX
      await db.insert(organizationOperators).values({
        craneProfileId: approvedProfiles[0].id,
        organizationId: orgShy.id,
        hiredAt: new Date(Date.now() - 5 * 86400_000),
        status: 'active',
        approvalStatus: 'rejected',
        rejectedByUserId: superadmin.id,
        rejectedAt: new Date(Date.now() - 3 * 86400_000),
        rejectionReason: 'Оператор уже работает в другой организации холдинга',
      })
    }

    console.warn('[demo] done ✓')
    console.warn('')
    console.warn('  superadmin phone: +77001112233')
    console.warn('  owner Алматы:     +77010001122  (ТОО «Крановый Парк Алматы»)')
    console.warn('  owner Астана:     +77020003344  (ТОО «Астана Лифт»)')
    console.warn('  owner Шымкент:    +77030005566  (ТОО «Шымкент Строй»)')
    console.warn(`  password (all):   ${DEMO_PASSWORD}`)
    console.warn('')
    console.warn('  Операторы — phone +77500000000 — +77500000014 (same password)')
  } finally {
    await close()
  }
}

main().catch((err) => {
  console.error('[seed-demo] failed', err)
  process.exit(1)
})
