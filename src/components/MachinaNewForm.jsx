// Directing a new song: a genre starting point, the brief, tempo and key (or leave them to the Machina), the band,
// and the structure with a cue for each section.
import { INSTRUMENTS } from '../../shared/instruments.js';
import { MAX_BPM, MIN_BPM, NOTE_NAMES, SCALE_NAMES } from '../../shared/music.js';
import { MACHINA_PRESETS } from '../utils/machinaPresets.js';
import { makeId } from '../utils/songEdit.js';
import { StructureEditor } from './StructureEditor.jsx';

/**
 * @param {{ draft: import('../utils/machinaRequest.js').MachinaDraft, change: (changes: object) => void }} props
 */
export function MachinaNewForm({ draft, change }) {
  const applyPreset = (preset) =>
    change({
      brief: preset.brief,
      bpm: preset.bpm,
      key: preset.key,
      instruments: preset.instruments,
      sections: preset.sections.map((section) => ({ ...section, id: makeId() })),
    });
  const toggleInstrument = (id) =>
    change({
      instruments: draft.instruments.includes(id)
        ? draft.instruments.filter((candidate) => candidate !== id)
        : [...draft.instruments, id],
    });

  return (
    <>
      <div className="preset-row" role="group" aria-label="Start from a genre">
        <span className="eyebrow">Start from</span>
        {MACHINA_PRESETS.map((preset) => (
          <button key={preset.id} type="button" className="chip" onClick={() => applyPreset(preset)}>
            {preset.label}
          </button>
        ))}
      </div>

      <label className="field">
        The brief
        <textarea
          className="input"
          rows={3}
          maxLength={2000}
          placeholder="Genre, mood, references in words: for example dark, hypnotic psytrance with a squelchy acid hook"
          value={draft.brief}
          onChange={(event) => change({ brief: event.target.value })}
        />
      </label>

      <div className="toolbar">
        <label className="field">
          Tempo
          <span className="inline-choice">
            <label className="check">
              <input
                type="checkbox"
                checked={draft.bpm === null}
                onChange={(event) => change({ bpm: event.target.checked ? null : 142 })}
              />
              Machina chooses
            </label>
            {draft.bpm === null ? null : (
              <input
                className="input input-narrow"
                type="number"
                min={MIN_BPM}
                max={MAX_BPM}
                aria-label="Tempo for the new song"
                value={draft.bpm}
                onChange={(event) =>
                  change({ bpm: Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(Number(event.target.value)) || 140)) })
                }
              />
            )}
          </span>
        </label>
        <label className="field">
          Key
          <span className="inline-choice">
            <label className="check">
              <input
                type="checkbox"
                checked={draft.key === null}
                onChange={(event) => change({ key: event.target.checked ? null : { root: 'E', scale: 'minor' } })}
              />
              Machina chooses
            </label>
            {draft.key === null ? null : (
              <>
                <select
                  className="select"
                  aria-label="Key root for the new song"
                  value={draft.key.root}
                  onChange={(event) => change({ key: { ...draft.key, root: event.target.value } })}
                >
                  {NOTE_NAMES.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
                <select
                  className="select"
                  aria-label="Scale for the new song"
                  value={draft.key.scale}
                  onChange={(event) => change({ key: { ...draft.key, scale: event.target.value } })}
                >
                  {SCALE_NAMES.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </>
            )}
          </span>
        </label>
        {draft.sections.length === 0 ? (
          <label className="field">
            Length
            <span className="inline-choice">
              about
              <input
                className="input input-narrow"
                type="number"
                min="4"
                max="256"
                aria-label="Song length in bars"
                value={draft.lengthBars}
                onChange={(event) =>
                  change({ lengthBars: Math.max(4, Math.min(256, Math.round(Number(event.target.value)) || 32)) })
                }
              />
              bars
            </span>
          </label>
        ) : null}
      </div>

      <fieldset className="chip-set">
        <legend>Band {draft.instruments.length === 0 ? '(none chosen: the Machina picks)' : ''}</legend>
        {INSTRUMENTS.map((instrument) => (
          <label key={instrument.id} className="chip" data-instrument={instrument.id}>
            <input
              type="checkbox"
              checked={draft.instruments.includes(instrument.id)}
              onChange={() => toggleInstrument(instrument.id)}
            />
            {instrument.name}
          </label>
        ))}
      </fieldset>

      <StructureEditor sections={draft.sections} onChange={(sections) => change({ sections })} />
    </>
  );
}
