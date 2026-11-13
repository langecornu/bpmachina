// The structure you want the Machina to write: sections in order, each with a length and a cue. Left empty, the
// Machina chooses the structure itself. Each draft section has its own id, so rows keep their place while editing.
import { makeId } from '../utils/songEdit.js';
import { Icon } from './Icon.jsx';

const MAX_SECTIONS = 16;

/**
 * @param {{ sections: { id: string, name: string, bars: number, cue: string }[],
 *   onChange: (sections: { id: string, name: string, bars: number, cue: string }[]) => void }} props
 */
export function StructureEditor({ sections, onChange }) {
  const change = (index, changes) =>
    onChange(sections.map((section, at) => (at === index ? { ...section, ...changes } : section)));
  return (
    <fieldset className="structure">
      <legend>Structure and cues</legend>
      {sections.length === 0 ? (
        <p className="note-text">No structure: the Machina chooses one that suits the brief.</p>
      ) : (
        <ol className="structure-list">
          {sections.map((section, index) => (
            <li key={section.id} className="structure-row">
              <input
                className="input"
                aria-label={`Section ${index + 1} name`}
                value={section.name}
                maxLength={60}
                onChange={(event) => change(index, { name: event.target.value })}
              />
              <label className="structure-bars">
                <input
                  className="input input-narrow"
                  type="number"
                  min="1"
                  max="64"
                  aria-label={`Section ${index + 1} length in bars`}
                  value={section.bars}
                  onChange={(event) =>
                    change(index, { bars: Math.max(1, Math.min(64, Number(event.target.value) || 1)) })
                  }
                />
                bars
              </label>
              <input
                className="input structure-cue"
                aria-label={`Section ${index + 1} cue`}
                placeholder="Cue: what happens here"
                value={section.cue}
                maxLength={400}
                onChange={(event) => change(index, { cue: event.target.value })}
              />
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                aria-label={`Remove section ${index + 1}`}
                onClick={() => onChange(sections.filter((_, at) => at !== index))}
              >
                <Icon name="close" size={16} />
              </button>
            </li>
          ))}
        </ol>
      )}
      <button
        type="button"
        className="btn btn-ghost"
        disabled={sections.length >= MAX_SECTIONS}
        onClick={() => onChange([...sections, { id: makeId(), name: `Part ${sections.length + 1}`, bars: 8, cue: '' }])}
      >
        <Icon name="plus" size={16} />
        Add a section
      </button>
    </fieldset>
  );
}
