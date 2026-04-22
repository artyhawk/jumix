export function formatRuLongDate(date: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
  return fmt.charAt(0).toUpperCase() + fmt.slice(1)
}
