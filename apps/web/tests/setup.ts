import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// matchMedia мок: jsdom не реализует window.matchMedia, но наши
// responsive-hook'и и компоненты (use-media-query, sidebar-drawer) им пользуются.
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

// scrollIntoView — не реализован в jsdom, нужен для Radix menus/popovers.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

// ResizeObserver — jsdom его нет, Radix его использует.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}

// IntersectionObserver — jsdom не реализует, но framer-motion `useInView`
// (marketing landing scroll-triggered анимации) требует его.
if (typeof globalThis.IntersectionObserver === 'undefined') {
  globalThis.IntersectionObserver = class {
    root = null
    rootMargin = ''
    thresholds = []
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return []
    }
  } as unknown as typeof IntersectionObserver
}

// URL.createObjectURL — jsdom не реализует, но maplibre-gl вызывает его
// на module-load для Worker'а. Мы всё равно мокаем карту в тестах, но
// сам import пакета должен пройти без throw.
if (typeof globalThis.URL !== 'undefined' && !globalThis.URL.createObjectURL) {
  globalThis.URL.createObjectURL = () => 'blob:mock'
}
if (typeof globalThis.URL !== 'undefined' && !globalThis.URL.revokeObjectURL) {
  globalThis.URL.revokeObjectURL = () => {}
}
