// "Compose to my taste": the Machina reads the person's taste profile (ADR 0010) with the direction, when one is saved
// and valid. Otherwise the box is off and says why, with the way to Settings.

/**
 * @param {{
 *   taste: { status: 'none' | 'ok' | 'invalid', profile?: { name: string } } | null,
 *   checked: boolean,
 *   onChange: (checked: boolean) => void,
 *   onOpenSettings: () => void,
 *   disabled?: boolean,
 * }} props
 */
export function TasteToggle({ taste, checked, onChange, onOpenSettings, disabled = false }) {
  const isReady = taste?.status === 'ok';
  let note = 'Checking for a taste profile…';
  if (taste?.status === 'ok') {
    note = `Uses “${taste.profile.name}” where your direction leaves things open. Your direction always wins.`;
  } else if (taste?.status === 'none') {
    note = 'No taste profile yet. Settings says how to make one from tracks you love.';
  } else if (taste?.status === 'invalid') {
    note = 'Your taste profile has a problem. Settings shows what to fix.';
  }
  return (
    <div className="taste-toggle">
      <label className="check">
        <input
          type="checkbox"
          checked={isReady && checked}
          disabled={!isReady || disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        Compose to my taste
      </label>
      <span className="note-text">{note}</span>
      {taste && !isReady ? (
        <button type="button" className="btn btn-ghost" onClick={onOpenSettings}>
          Taste in Settings
        </button>
      ) : null}
    </div>
  );
}
