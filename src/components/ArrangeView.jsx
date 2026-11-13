// Arrangement: the song as sections in order, each playing a pattern a number of times with a cue (the direction the
// Machina follows when it revises the song). A strip shows the song's shape and where playback is. The export gives
// Open DMX Stage the song's tempo, sections and energy, so the lights can follow it.
import { STEPS_PER_BAR } from '../../shared/music.js';
import { LIMITS, songTimeline } from '../../shared/song.js';
import { buildSongCue } from '../../shared/songCue.js';
import { downloadJson } from '../utils/download.js';
import { addSection, moveSection, removeSection, updateSection } from '../utils/songEdit.js';
import { EmptyState } from './EmptyState.jsx';
import { Icon } from './Icon.jsx';

export function ArrangeView({ song, update, transport, notify, navigate, onOpenPattern }) {
  const timeline = songTimeline(song);
  const totalBars = Math.max(
    1,
    timeline.reduce((total, entry) => total + entry.bars, 0),
  );
  const playingBar = transport.playing?.mode === 'song' && transport.position ? transport.position.bar - 1 : null;
  const cue = buildSongCue(song);
  const energyBySection = new Map(timeline.map((entry, index) => [entry.section.id, cue.sections[index].energy]));

  const exportCue = () => {
    downloadJson(cue, song.name, '.cue.json');
    notify('Exported the song cue for Open DMX Stage');
  };

  const openPattern = (patternId) => {
    onOpenPattern(patternId);
    navigate('grid');
  };

  return (
    <div className="view">
      <div className="view-header">
        <div>
          <h1 className="view-title">Arrangement</h1>
          <p className="view-sub">
            The song in order. Each section repeats a pattern; its cue is the direction the Machina follows.
          </p>
        </div>
        <div className="toolbar">
          <button type="button" className="btn" disabled={timeline.length === 0} onClick={exportCue}>
            <Icon name="download" size={16} />
            Export for DMX-Stage
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={song.sections.length >= LIMITS.sections}
            onClick={() => update((current) => addSection(current, current.patterns[0].id))}
          >
            <Icon name="plus" size={16} />
            Add section
          </button>
        </div>
      </div>

      {timeline.length > 0 ? (
        <div className="arrange-strip" aria-label="Song shape">
          {timeline.map((entry) => (
            <div
              key={entry.section.id}
              className="arrange-block"
              style={{ flexGrow: entry.bars, '--energy': energyBySection.get(entry.section.id) ?? 0 }}
              data-playing={
                playingBar !== null && playingBar >= entry.startBar && playingBar < entry.startBar + entry.bars
                  ? true
                  : undefined
              }
              title={`${entry.section.name}: ${entry.bars} bars`}
            >
              <span>{entry.section.name}</span>
            </div>
          ))}
          {playingBar !== null ? (
            <span
              className="arrange-playhead"
              aria-hidden="true"
              style={{ left: `${(((transport.position?.bar ?? 1) - 1) / totalBars) * 100}%` }}
            />
          ) : null}
        </div>
      ) : null}

      {song.sections.length === 0 ? (
        <EmptyState
          icon="arrange"
          title="No sections yet"
          hint="Add a section to place a pattern in the song, or ask the Machina to arrange one."
        />
      ) : (
        <ol className="section-list">
          {song.sections.map((section, index) => {
            const pattern = song.patterns.find((candidate) => candidate.id === section.patternId);
            const change = (changes) => update((current) => updateSection(current, section.id, changes));
            return (
              <li key={section.id} className="card section-row">
                <span className="section-number">{index + 1}</span>
                <div className="section-fields">
                  <label className="field">
                    Section
                    <input
                      className="input"
                      value={section.name}
                      maxLength={LIMITS.nameLength}
                      onChange={(event) => change({ name: event.target.value || 'Section' })}
                    />
                  </label>
                  <label className="field">
                    Pattern
                    <select
                      className="select"
                      value={section.patternId}
                      onChange={(event) => change({ patternId: event.target.value })}
                    >
                      {song.patterns.map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {candidate.name} ({candidate.bars} {candidate.bars === 1 ? 'bar' : 'bars'})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Repeats
                    <input
                      className="input input-narrow"
                      type="number"
                      min="1"
                      max={LIMITS.repeats}
                      value={section.repeats}
                      onChange={(event) => {
                        const repeats = Math.round(Number(event.target.value));
                        if (repeats >= 1 && repeats <= LIMITS.repeats) {
                          change({ repeats });
                        }
                      }}
                    />
                  </label>
                  <span className="section-length">
                    {pattern ? pattern.bars * section.repeats : 0} bars
                    <span className="section-energy" style={{ '--energy': energyBySection.get(section.id) ?? 0 }}>
                      energy
                    </span>
                  </span>
                  <label className="field section-cue">
                    Cue for the Machina
                    <textarea
                      className="input"
                      rows={2}
                      maxLength={LIMITS.cueLength}
                      placeholder="For example: the bass drops out, only the acid line and a riser"
                      value={section.cue}
                      onChange={(event) => change({ cue: event.target.value })}
                    />
                  </label>
                </div>
                <div className="section-actions">
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon"
                    aria-label={`Open ${pattern?.name ?? 'pattern'} on the BPM Grid`}
                    title="Open on the BPM Grid"
                    onClick={() => openPattern(section.patternId)}
                  >
                    <Icon name="grid" size={16} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon"
                    aria-label={`Move ${section.name} up`}
                    disabled={index === 0}
                    onClick={() => update((current) => moveSection(current, section.id, -1))}
                  >
                    <Icon name="up" size={16} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon"
                    aria-label={`Move ${section.name} down`}
                    disabled={index === song.sections.length - 1}
                    onClick={() => update((current) => moveSection(current, section.id, 1))}
                  >
                    <Icon name="down" size={16} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon btn-danger"
                    aria-label={`Remove ${section.name}`}
                    onClick={() => update((current) => removeSection(current, section.id))}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <p className="note-text">
        {totalBars} bars at {song.bpm} BPM. The export lists each section with its start bar and energy for Open DMX
        Stage; {Math.round((totalBars * STEPS_PER_BAR) / 4)} beats in all.
      </p>
    </div>
  );
}
