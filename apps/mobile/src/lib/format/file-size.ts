/**
 * Human-readable file size (байты → КБ → МБ). Русские unit-метки.
 * Используется в FilePreview/LicenseCurrentCard для отображения размера
 * выбранного файла.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 0 || !Number.isFinite(bytes)) return '0 Б'
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`
}
