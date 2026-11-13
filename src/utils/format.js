// Small formatters shared by the screens.

/**
 * @param {number} seconds
 * @returns {string} for example "3:05"
 */
export function formatDuration(seconds) {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
