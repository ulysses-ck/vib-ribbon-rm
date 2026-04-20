/**
 * Retardo de wall-clock para ejecutar lógica tras un `linearRampToValueAtTime`
 * de duración `durationMs` (cushion para el hilo de audio).
 */
export function fadeScheduleEndDelayMs(
  durationMs: number,
  cushionMs = 35,
): number {
  return Math.ceil(Math.max(0, durationMs)) + cushionMs
}
