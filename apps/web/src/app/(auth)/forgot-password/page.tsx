'use client'

import { ForgotPasswordForm } from '@/components/auth/forgot-password-form'
import { Logo } from '@/components/layout/logo'
import { useT } from '@/lib/marketing-locale'
import { motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function ForgotPasswordPage() {
  const t = useT()
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 280, damping: 26 }}
      className="w-full max-w-md"
    >
      <Link
        href="/login"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-md"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t('auth.forgotPassword.loginLink')}
      </Link>
      <div className="rounded-xl border border-border-subtle bg-layer-1/70 backdrop-blur p-4 sm:p-5 md:p-8 shadow-2xl shadow-black/30">
        <div className="flex flex-col items-center gap-3 pb-5 sm:pb-6">
          <Logo variant="mark" className="size-12" priority />
          <div className="text-center space-y-1.5">
            <h1 className="text-xl md:text-[24px] font-semibold text-text-primary">
              {t('auth.forgotPassword.title')}
            </h1>
            <p className="text-sm text-text-secondary">{t('auth.forgotPassword.subtitle')}</p>
          </div>
        </div>
        <ForgotPasswordForm />
      </div>
    </motion.div>
  )
}
