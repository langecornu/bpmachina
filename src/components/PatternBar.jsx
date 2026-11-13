// The patterns of the song as tabs, and the open pattern's name, length, copy and delete.
import { LIMITS } from '../../shared/song.js';
import { addPattern, removePattern, renamePattern, setPatternBars } from '../utils/songEdit.js';
import { Icon } from './Icon.jsx';

const BAR_CHOICES = Array.from({ length: LIMITS.barsPerPattern }, (_, index) => index + 1);

export function PatternBar({ song, pattern, update, onSelectPattern }) {
  const usedBy = song.sections.filter((section) => section.patternId === pattern.id).length;

  const add = (copyOf) => {
    let created = null;
    update((current) => {
      const result = addPattern(current, copyOf);
      created = result.patternId;
      return result.song;
    });
    if (created) {
      onSelectPattern(created);
    }
  };

  const remove = () => {
    const warning = usedBy > 0 ? ` It is played by ${usedBy} section${usedBy === 1 ? '' : 's'}, which go too.` : '';
    if (window.confirm(`Delete pattern "${pattern.name}"?${warning} You can undo this.`)) {
      update((current) => removePattern(current, pattern.id));
    }
  };

  return (
    <div className="pattern-bar">
      <div className="pattern-tabs">
        <div className="pattern-tablist" role="tablist" aria-label="Patterns">
          {song.patterns.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              role="tab"
              className="pattern-tab"
              aria-selected={candidate.id === pattern.id}
              onClick={() => onSelectPattern(candidate.id)}
            >
              {candidate.name}
              <span className="pattern-tab-bars">{candidate.bars}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          aria-label="New pattern"
          title="New pattern"
          disabled={song.patterns.length >= LIMITS.patterns}
          onClick={() => add(null)}
        >
          <Icon name="plus" size={16} />
        </button>
      </div>
      <div className="toolbar pattern-tools">
        <label className="field">
          Name
          <input
            className="input"
            value={pattern.name}
            maxLength={LIMITS.nameLength}
            onChange={(event) =>
              update((current) => renamePattern(current, pattern.id, event.target.value || 'Pattern'))
            }
          />
        </label>
        <label className="field">
          Length
          <select
            className="select"
            value={pattern.bars}
            onChange={(event) => update((current) => setPatternBars(current, pattern.id, Number(event.target.value)))}
          >
            {BAR_CHOICES.map((bars) => (
              <option key={bars} value={bars}>
                {bars} {bars === 1 ? 'bar' : 'bars'}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn"
          disabled={song.patterns.length >= LIMITS.patterns}
          onClick={() => add(pattern.id)}
        >
          <Icon name="copy" size={16} />
          Duplicate
        </button>
        <button type="button" className="btn btn-danger" disabled={song.patterns.length <= 1} onClick={remove}>
          <Icon name="trash" size={16} />
          Delete
        </button>
      </div>
    </div>
  );
}
