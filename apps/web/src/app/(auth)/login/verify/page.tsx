'use client'

import { OtpForm } from '@/components/auth/otp-form'
import { Logo } from '@/components/layout/logo'
import { t } from '@/lib/i18n'
import { motion } from 'framer-motion'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect } from 'react'

/**
 * Next.js 15: useSearchParams() требует Suspense boundary при static
 * prerender — иначе page.tsx не может быть statically generated и build
 * падает. Оборачиваем содержимое в <Suspense> чтобы prerender'у было
 * за чем "ждать", в runtime ничего не меняется.
 */
function VerifyContent() {
  const params = useSearchParams()
  const router = useRouter()
  const phone = params.get('phone') ?? ''

  useEffect(() => {
    // Защита от прямого входа на /login/verify без phone в query
    if (!/^\+7\d{10}$/.test(phone)) {
      router.replace('/login')
    }
  }, [phone, router])

  if (!/^\+7\d{10}$/.test(phone)) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 280, damping: 26 }}
      className="w-full max-w-md"
    >
      <div className="rounded-xl border border-border-subtle bg-layer-1/70 backdrop-blur p-5 md:p-8 shadow-2xl shadow-black/30">
        <div className="flex flex-col items-center gap-3 pb-6">
          <Logo variant="mark" className="size-12" priority />
          <div className="text-center space-y-1.5">
            <h1 className="text-xl md:text-[24px] font-semibold text-text-primary">
              {t('auth.verify.title')}
            </h1>
          </div>
        </div>
        <OtpForm phone={phone} />
      </div>
    </motion.div>
  )
}

export default function VerifyPage() {
  return (
    <Suspense fallback={null}>
      <VerifyContent />
    </Suspense>
  )
}
