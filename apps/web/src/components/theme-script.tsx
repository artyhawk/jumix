/**
 * Inline script в <head> для FOUC prevention (B3-THEME).
 *
 * Проблема: без mitigation страница рендерится с default theme → React
 * hydrate → useEffect fires → ThemeProvider applies user's preference →
 * пользователь видит мгновенный flicker.
 *
 * Решение: blocking inline `<script>` в <head> (до React hydrate). Читает
 * localStorage, ставит class на <html>. Browser применяет CSS до first paint.
 *
 * `dangerouslySetInnerHTML` использован умышленно: контент — статическая
 * строка без user input'а, XSS-вектора нет, и это единственный способ
 * получить inline-script через Next.js без deferred execution.
 *
 * Skill `nonce` — backlog. Сейчас CSP relaxed, inline-scripts разрешены;
 * когда CSP затянем — переедем на runtime-script через `Script id strategy`.
 */
const SCRIPT = /* javascript */ `
(function() {
  try {
    var STORAGE_KEY = 'jumix-theme-mode';
    var stored = localStorage.getItem(STORAGE_KEY);
    var mode = (stored === 'light' || stored === 'dark' || stored === 'system') ? stored : 'system';
    var theme = mode;
    if (mode === 'system') {
      theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    var root = document.documentElement;
    root.classList.remove('theme-light', 'theme-dark');
    root.classList.add('theme-' + theme);
    root.style.colorScheme = theme;
  } catch (e) {
    document.documentElement.classList.add('theme-light');
  }
})();
`.trim()

export function ThemeScript() {
  // biome-ignore lint/security/noDangerouslySetInnerHtml: статическая константа без user input — единственный способ inline blocking-script в <head> (FOUC prevention)
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />
}

/** Экспорт raw-строки для unit-тестов (не для production использования). */
export const __THEME_SCRIPT_BODY = SCRIPT
