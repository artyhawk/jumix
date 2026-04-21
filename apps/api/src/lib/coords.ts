/**
 * Округляет координату (широту/долготу) до 6 знаков после запятой (~11 см).
 *
 * Используется в DTO-слое sites/shifts перед JSON-сериализацией. Причина:
 * PostGIS ST_X/ST_Y возвращают double, и при пути coord → Postgres → JS
 * возникает IEEE754-шум вида 71.43060300000001. 6 знаков — выше реальной
 * точности GPS (3-5 м), поэтому округление не теряет полезного сигнала.
 *
 * toFixed гарантирует ровно 6 знаков (half-to-even), Number(...) убирает
 * trailing zeros в JSON. На NaN/Infinity выбрасывает — вызывающий код
 * не должен передавать такие значения.
 */
export function round6(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error(`round6: non-finite coordinate ${value}`)
  }
  return Number(value.toFixed(6))
}
