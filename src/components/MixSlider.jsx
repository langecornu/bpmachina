// One labelled slider for the mix and the effects, showing its value as the person reads it (L 30, 55 %, 1/8d…).
export function MixSlider({ label, value, min, max, format = (shown) => String(shown), onChange }) {
  return (
    <label className="mix-slider">
      <span className="mix-slider-label">
        {label}
        <span className="mix-slider-value">{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

/**
 * @param {number} pan -100 to 100
 * @returns {string} "C", "L 30" or "R 30"
 */
export function formatPan(pan) {
  if (pan === 0) {
    return 'C';
  }
  return `${pan < 0 ? 'L' : 'R'} ${Math.abs(pan)}`;
}
