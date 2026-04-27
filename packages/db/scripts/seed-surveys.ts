import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import { eq, inArray } from 'drizzle-orm'
import { createDatabase } from '../src/client'
import { surveyQuestions, surveys } from '../src/schema/index'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

loadEnv({ path: path.resolve(__dirname, '../../../.env') })
loadEnv({ path: path.resolve(__dirname, '../../../.env.prod'), override: false })

/**
 * Seed customer development surveys (B3-SURVEY).
 *
 * 4 templates: b2b-ru, b2b-kk, b2c-ru, b2c-kk. Idempotent — upsert по slug.
 * При re-run'е: surveys обновляются по slug; questions полностью перевыдаются
 * (DELETE + INSERT) чтобы избежать duplicate-position конфликтов и упростить
 * правки текстов.
 *
 * Usage:
 *   pnpm --filter @jumix/db tsx scripts/seed-surveys.ts
 *
 * Контент извлечён из castdev docx (WhatsApp-versions, без interviewer hints,
 * group structure preserved). После kk-translation финального полного KZ-
 * landing'а — обновить kk-versions через тот же script (idempotent).
 */

type QuestionSpec = {
  position: number
  groupKey: string
  groupTitle: string
  questionText: string
}

type SurveySpec = {
  slug: string
  title: string
  subtitle: string
  audience: 'b2b' | 'b2c'
  locale: 'ru' | 'kk'
  intro: string
  outro: string
  questions: QuestionSpec[]
}

const B2B_RU: SurveySpec = {
  slug: 'b2b-ru',
  title: 'Помогите нам сделать платформу полезной',
  subtitle: 'Опрос для владельцев кранов и строительных компаний',
  audience: 'b2b',
  locale: 'ru',
  intro:
    'Мы изучаем рынок крановых услуг в Казахстане. Ваши ответы помогут создать инструмент, который реально поможет вашему бизнесу. Опрос займёт 10–15 минут.',
  outro:
    'Спасибо за ваши ответы! Мы свяжемся с вами, когда платформа будет готова к пилотному запуску.',
  questions: [
    {
      position: 1,
      groupKey: 'context',
      groupTitle: 'Контекст бизнеса',
      questionText: 'Сколько кранов и объектов работает у вас сейчас одновременно?',
    },
    {
      position: 2,
      groupKey: 'context',
      groupTitle: 'Контекст бизнеса',
      questionText: 'Крановщики в штате или нанимаете временно под каждый объект?',
    },
    {
      position: 3,
      groupKey: 'context',
      groupTitle: 'Контекст бизнеса',
      questionText: 'Кто в компании отвечает за координацию крановщиков — вы или диспетчер?',
    },
    {
      position: 4,
      groupKey: 'pain',
      groupTitle: 'Где болит',
      questionText: 'Как сейчас находите крановщика, когда нужен новый? Опишите шаги.',
    },
    {
      position: 5,
      groupKey: 'pain',
      groupTitle: 'Где болит',
      questionText: 'Как контролируете, что крановщик вышел на смену? Что используете?',
    },
    {
      position: 6,
      groupKey: 'pain',
      groupTitle: 'Где болит',
      questionText: 'Было такое, что крановщик не пришёл без предупреждения? Что делали?',
    },
    {
      position: 7,
      groupKey: 'pain',
      groupTitle: 'Где болит',
      questionText: 'Как проверяете документы крановщика перед допуском к работе?',
    },
    {
      position: 8,
      groupKey: 'pain',
      groupTitle: 'Где болит',
      questionText: 'Сколько часов в неделю уходит на координацию крановщиков?',
    },
    {
      position: 9,
      groupKey: 'money',
      groupTitle: 'Деньги и решение',
      questionText:
        'Если бы сервис автоматизировал контроль смен и документов — сколько готовы платить в месяц?',
    },
    {
      position: 10,
      groupKey: 'money',
      groupTitle: 'Деньги и решение',
      questionText: 'Что должно быть в нём обязательно, без этого не возьмёте?',
    },
    {
      position: 11,
      groupKey: 'money',
      groupTitle: 'Деньги и решение',
      questionText:
        'Коротко: платформа где компания назначает крановщиков, видит смены и геолокацию, документы хранятся автоматически. Что скажете?',
    },
  ],
}

const B2B_KK: SurveySpec = {
  slug: 'b2b-kk',
  title: 'Платформаны пайдалы ету үшін көмектесіңіз',
  subtitle: 'Кран иелері мен құрылыс компанияларына арналған сауалнама',
  audience: 'b2b',
  locale: 'kk',
  intro:
    'Біз Қазақстандағы крандық қызметтер нарығын зерттеп жатырмыз. Сіздің жауаптарыңыз сіздің бизнесіңізге шынымен пайдалы құрал жасауға көмектеседі. Сауалнама 10–15 минут алады.',
  outro:
    'Жауаптарыңызға рахмет! Платформа пилоттық іске қосуға дайын болғанда сізбен хабарласамыз.',
  questions: [
    {
      position: 1,
      groupKey: 'context',
      groupTitle: 'Бизнес контексті',
      questionText: 'Қазір бір уақытта қанша кран мен объект жұмыс істейді?',
    },
    {
      position: 2,
      groupKey: 'context',
      groupTitle: 'Бизнес контексті',
      questionText: 'Крановщиктер штатта ма, әлде объектіге қарай уақытша жалдайсыз ба?',
    },
    {
      position: 3,
      groupKey: 'context',
      groupTitle: 'Бизнес контексті',
      questionText: 'Крановщиктерді үйлестіруге компанияда кім жауапты?',
    },
    {
      position: 4,
      groupKey: 'pain',
      groupTitle: 'Қазіргі ауыртпалықтар',
      questionText: 'Жаңа крановщик керек болғанда қалай іздейсіз? Қадамдарды сипаттаңыз.',
    },
    {
      position: 5,
      groupKey: 'pain',
      groupTitle: 'Қазіргі ауыртпалықтар',
      questionText: 'Крановщик сменаға шыққанын қалай бақылайсыз? Не қолданасыз?',
    },
    {
      position: 6,
      groupKey: 'pain',
      groupTitle: 'Қазіргі ауыртпалықтар',
      questionText: 'Крановщик ескертусіз келмей қалды ма? Сонда не істедіңіз?',
    },
    {
      position: 7,
      groupKey: 'pain',
      groupTitle: 'Қазіргі ауыртпалықтар',
      questionText: 'Крановщиктің құжаттарын жіберер алдында қалай тексересіз?',
    },
    {
      position: 8,
      groupKey: 'pain',
      groupTitle: 'Қазіргі ауыртпалықтар',
      questionText: 'Аптасына крановщиктерді үйлестіруге қанша уақыт кетеді?',
    },
    {
      position: 9,
      groupKey: 'money',
      groupTitle: 'Ақша және шешім',
      questionText: 'Мұндай сервис айына қанша тұрса төлейсіз?',
    },
    {
      position: 10,
      groupKey: 'money',
      groupTitle: 'Ақша және шешім',
      questionText: 'Бұл сервисте міндетті түрде не болуы керек?',
    },
    {
      position: 11,
      groupKey: 'money',
      groupTitle: 'Ақша және шешім',
      questionText: 'Қысқаша: кран тағайындау, геолокация, смена, автоматты құжаттар. Пікіріңіз?',
    },
  ],
}

const B2C_RU: SurveySpec = {
  slug: 'b2c-ru',
  title: 'Расскажите о вашей работе крановщиком',
  subtitle: 'Опрос для крановщиков',
  audience: 'b2c',
  locale: 'ru',
  intro:
    'Мы делаем приложение для крановщиков — смены, зарплата, документы в одном месте. Расскажите о вашей работе, чтобы мы сделали приложение реально полезным. Опрос займёт 5–10 минут.',
  outro: 'Спасибо! Мы свяжемся, когда приложение будет готово к тесту.',
  questions: [
    {
      position: 1,
      groupKey: 'work_now',
      groupTitle: 'Работа сейчас',
      questionText: 'Сколько лет работаете крановщиком? Где сейчас работаете?',
    },
    {
      position: 2,
      groupKey: 'work_now',
      groupTitle: 'Работа сейчас',
      questionText: 'Как нашли эту работу — через кого или где искали?',
    },
    {
      position: 3,
      groupKey: 'work_now',
      groupTitle: 'Работа сейчас',
      questionText: 'Вы всегда в одной компании или работаете на разных объектах?',
    },
    {
      position: 4,
      groupKey: 'pain',
      groupTitle: 'Где неудобно',
      questionText: 'Как вам платят — наличными, на карту? Бывали задержки?',
    },
    {
      position: 5,
      groupKey: 'pain',
      groupTitle: 'Где неудобно',
      questionText:
        'Бывало, что работодатель говорил «ты не отработал», а вы отработали? Как решали?',
    },
    {
      position: 6,
      groupKey: 'pain',
      groupTitle: 'Где неудобно',
      questionText: 'Где храните документы — удостоверение, медсправку? Кто следит за сроками?',
    },
    {
      position: 7,
      groupKey: 'pain',
      groupTitle: 'Где неудобно',
      questionText: 'Что сейчас самое неудобное в работе — что больше всего раздражает?',
    },
    {
      position: 8,
      groupKey: 'phone',
      groupTitle: 'Телефон и приложение',
      questionText: 'Каким телефоном пользуетесь? Какими приложениями кроме WhatsApp?',
    },
    {
      position: 9,
      groupKey: 'phone',
      groupTitle: 'Телефон и приложение',
      questionText:
        'Если бы в телефоне было приложение где видно смены, сколько заработал, документы — пользовались бы?',
    },
    {
      position: 10,
      groupKey: 'phone',
      groupTitle: 'Телефон и приложение',
      questionText: 'Что обязательно должно быть в таком приложении чтобы открывали каждый день?',
    },
  ],
}

const B2C_KK: SurveySpec = {
  slug: 'b2c-kk',
  title: 'Крановщик жұмысыңыз туралы айтып беріңіз',
  subtitle: 'Крановщиктерге арналған сауалнама',
  audience: 'b2c',
  locale: 'kk',
  intro:
    'Біз крановщиктерге арналған қосымша жасап жатырмыз — смена, жалақы, құжаттар бір жерде. Қосымшаны шынымен пайдалы ету үшін жұмысыңыз туралы айтып беріңіз. Сауалнама 5–10 минут алады.',
  outro: 'Рахмет! Қосымша тестке дайын болғанда хабарласамыз.',
  questions: [
    {
      position: 1,
      groupKey: 'work_now',
      groupTitle: 'Қазіргі жұмыс',
      questionText: 'Қанша жыл крановщик болып жұмыс жасадыңыз? Қазір қайда жұмыс жасайсыз?',
    },
    {
      position: 2,
      groupKey: 'work_now',
      groupTitle: 'Қазіргі жұмыс',
      questionText: 'Бұл жұмысты қалай таптыңыз?',
    },
    {
      position: 3,
      groupKey: 'work_now',
      groupTitle: 'Қазіргі жұмыс',
      questionText: 'Бір компанияда тұрақты жұмыс жасайсыз ба, әлде әр жерде объектіге барасыз ба?',
    },
    {
      position: 4,
      groupKey: 'pain',
      groupTitle: 'Не ыңғайсыз',
      questionText: 'Жалақыны қалай аласыз? Кешіктіру болды ма?',
    },
    {
      position: 5,
      groupKey: 'pain',
      groupTitle: 'Не ыңғайсыз',
      questionText: '«Сен жұмыс жасамадың» деді ал сен жасадың — болды ма? Не істедіңіз?',
    },
    {
      position: 6,
      groupKey: 'pain',
      groupTitle: 'Не ыңғайсыз',
      questionText: 'Құжаттарыңызды қайда сақтайсыз? Мерзімін кім бақылайды?',
    },
    {
      position: 7,
      groupKey: 'pain',
      groupTitle: 'Не ыңғайсыз',
      questionText: 'Жұмыста қазір ең ыңғайсыз не?',
    },
    {
      position: 8,
      groupKey: 'phone',
      groupTitle: 'Телефон және қосымша',
      questionText: 'Қандай телефон қолданасыз? WhatsApp-тан басқа не қолданасыз?',
    },
    {
      position: 9,
      groupKey: 'phone',
      groupTitle: 'Телефон және қосымша',
      questionText: 'Телефонда смена, жалақы, құжаттар болса — пайдаланар едіңіз бе?',
    },
    {
      position: 10,
      groupKey: 'phone',
      groupTitle: 'Телефон және қосымша',
      questionText: 'Осындай қосымшада міндетті түрде не болуы керек?',
    },
  ],
}

const ALL_SURVEYS: SurveySpec[] = [B2B_RU, B2B_KK, B2C_RU, B2C_KK]

export async function seedSurveys(db: ReturnType<typeof createDatabase>['db']): Promise<void> {
  for (const spec of ALL_SURVEYS) {
    const existing = (
      await db.select({ id: surveys.id }).from(surveys).where(eq(surveys.slug, spec.slug)).limit(1)
    )[0]

    let surveyId: string
    if (existing) {
      await db
        .update(surveys)
        .set({
          title: spec.title,
          subtitle: spec.subtitle,
          audience: spec.audience,
          locale: spec.locale,
          intro: spec.intro,
          outro: spec.outro,
          questionCount: spec.questions.length,
          isActive: true,
        })
        .where(eq(surveys.id, existing.id))
      surveyId = existing.id
      // Drop existing questions to avoid stale data when text/order changes.
      await db.delete(surveyQuestions).where(eq(surveyQuestions.surveyId, surveyId))
    } else {
      const inserted = await db
        .insert(surveys)
        .values({
          slug: spec.slug,
          title: spec.title,
          subtitle: spec.subtitle,
          audience: spec.audience,
          locale: spec.locale,
          intro: spec.intro,
          outro: spec.outro,
          questionCount: spec.questions.length,
          isActive: true,
        })
        .returning({ id: surveys.id })
      const row = inserted[0]
      if (!row) throw new Error(`failed to insert survey ${spec.slug}`)
      surveyId = row.id
    }

    await db.insert(surveyQuestions).values(
      spec.questions.map((q) => ({
        surveyId,
        position: q.position,
        groupKey: q.groupKey,
        groupTitle: q.groupTitle,
        questionText: q.questionText,
        isRequired: true,
      })),
    )
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('error: DATABASE_URL not set')
    process.exit(1)
  }

  const { db, close } = createDatabase({ url: databaseUrl, max: 2 })
  try {
    console.warn('[surveys] seeding 4 templates + 42 questions...')
    await seedSurveys(db)

    const totalSurveys = (await db.select({ id: surveys.id }).from(surveys)).length
    const totalQuestions = (
      await db
        .select({ id: surveyQuestions.id })
        .from(surveyQuestions)
        .where(
          inArray(
            surveyQuestions.surveyId,
            (await db.select({ id: surveys.id }).from(surveys)).map((r) => r.id),
          ),
        )
    ).length
    console.warn(`[surveys] done — ${totalSurveys} surveys, ${totalQuestions} questions`)
  } finally {
    await close()
  }
}

const isMain = (() => {
  if (typeof process === 'undefined' || !process.argv[1]) return false
  return process.argv[1] === fileURLToPath(import.meta.url)
})()

if (isMain) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
