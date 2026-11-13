// Top bar: the song's name, whether it is saved, its tempo and key, undo and redo, the master volume and the theme.
import { MAX_BPM, MIN_BPM, NOTE_NAMES, SCALE_NAMES } from '../../shared/music.js';
import { Icon } from './Icon.jsx';
import { ThemeToggle } from './ThemeToggle.jsx';

const SAVE_LABELS = { saved: 'Saved', saving: 'Saving…', pending: 'Unsaved', error: 'Save failed' };

export function TopBar({ song, update, history, saveStatus, volume, onVolume, theme, onToggleTheme }) {
  const setTempo = (value) => {
    const bpm = Math.round(Number(value));
    if (Number.isFinite(bpm) && bpm >= MIN_BPM && bpm <= MAX_BPM) {
      update((current) => (current.bpm === bpm ? current : { ...current, bpm }));
    }
  };
  return (
    <header className="topbar">
      <input
        className="show-name"
        value={song.name}
        maxLength={80}
        aria-label="Song name"
        onChange={(event) => update((current) => ({ ...current, name: event.target.value || 'Untitled song' }))}
      />
      <span className={`pill pill-save pill-save-${saveStatus}`}>
        {saveStatus === 'saved' ? <Icon name="check" size={14} /> : null}
        {SAVE_LABELS[saveStatus]}
      </span>
      <div className="topbar-spacer" />
      <label className="tempo">
        <input
          className="input tempo-input"
          type="number"
          min={MIN_BPM}
          max={MAX_BPM}
          aria-label="Tempo in beats per minute"
          value={song.bpm}
          onChange={(event) => setTempo(event.target.value)}
        />
        <span className="tempo-unit">BPM</span>
      </label>
      <div className="key-picker" role="group" aria-label="Key">
        <select
          className="select select-compact"
          aria-label="Key root"
          value={song.key.root}
          onChange={(event) => update((current) => ({ ...current, key: { ...current.key, root: event.target.value } }))}
        >
          {NOTE_NAMES.map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
        <select
          className="select select-compact"
          aria-label="Scale"
          value={song.key.scale}
          onChange={(event) =>
            update((current) => ({ ...current, key: { ...current.key, scale: event.target.value } }))
          }
        >
          {SCALE_NAMES.map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
      </div>
      <div className="history-buttons">
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          aria-label="Undo"
          title="Undo (Ctrl or ⌘ Z)"
          disabled={!history.canUndo}
          onClick={history.undo}
        >
          <Icon name="undo" />
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          aria-label="Redo"
          title="Redo (Ctrl or ⌘ Shift Z)"
          disabled={!history.canRedo}
          onClick={history.redo}
        >
          <Icon name="redo" />
        </button>
      </div>
      <label className="master">
        <span className="master-label">Volume</span>
        <input
          type="range"
          aria-label="Master volume"
          min="0"
          max="100"
          value={Math.round(volume * 100)}
          onChange={(event) => onVolume(Number(event.target.value) / 100)}
        />
        <span className="master-value">{Math.round(volume * 100)}%</span>
      </label>
      <ThemeToggle theme={theme} onToggle={onToggleTheme} />
    </header>
  );
}
