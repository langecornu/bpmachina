// Which taste the Machina composes to (ADR 0012): none, or one from the person's library, grouped by style so a library
// of dozens of styles stays easy to pick from. The taste fills in what the direction leaves open; the direction wins.
import { intensityLabel } from '../../shared/taste.js';

/**
 * @param {{
 *   library: { tastes: import('../../shared/taste.js').TasteEntry[] } | null,
 *   value: string | null,
 *   onChange: (tasteId: string | null) => void,
 *   onOpenSettings: () => void,
 *   disabled?: boolean,
 * }} props
 */
export function TastePicker({ library, value, onChange, onOpenSettings, disabled = false }) {
  const tastes = library?.tastes ?? [];
  const byStyle = new Map();
  for (const taste of [...tastes].sort((a, b) => a.style.localeCompare(b.style) || a.name.localeCompare(b.name))) {
    byStyle.set(taste.style, [...(byStyle.get(taste.style) ?? []), taste]);
  }
  const selected = tastes.find((taste) => taste.id === value);
  let note = 'Loading your tastes…';
  if (library && tastes.length === 0) {
    note = 'No tastes yet. Settings says how to make them from tracks you love.';
  } else if (selected) {
    note = 'Fills in what your direction leaves open. Your direction always wins.';
  } else if (library) {
    note = 'Pick one of your tastes, or let the Machina follow your direction alone.';
  }
  return (
    <div className="taste-toggle">
      <label className="field">
        Compose to my taste
        <select
          className="select"
          value={selected ? selected.id : ''}
          disabled={disabled || tastes.length === 0}
          onChange={(event) => onChange(event.target.value || null)}
        >
          <option value="">No taste: my direction only</option>
          {[...byStyle.entries()].map(([style, group]) => (
            <optgroup key={style} label={style}>
              {group.map((taste) => (
                <option key={taste.id} value={taste.id}>
                  {[taste.name, taste.moods.join(', '), intensityLabel(taste.intensity)].filter(Boolean).join(' · ')}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <span className="note-text">{note}</span>
      {library && tastes.length === 0 ? (
        <button type="button" className="btn btn-ghost" onClick={onOpenSettings}>
          Tastes in Settings
        </button>
      ) : null}
    </div>
  );
}
