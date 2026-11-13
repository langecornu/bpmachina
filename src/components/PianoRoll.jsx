// The piano roll for one synth track: a row per pitch in the instrument's range, highest at the top, in the song's
// key by default. Click an empty cell to place a note of the chosen length, click a note to remove it, click a
// pitch's name to hear it. Rows are memoised, so only the row that changed re-renders.
import { memo, useCallback, useMemo, useState } from 'react';

import { instrumentOf } from '../../shared/instruments.js';
import { NOTE_NAMES, STEPS_PER_BAR, STEPS_PER_BEAT, isInKey, noteName } from '../../shared/music.js';
import { Playhead } from './Playhead.jsx';

export const NOTE_LENGTHS = [
  { steps: 1, label: '1/16' },
  { steps: 2, label: '1/8' },
  { steps: 4, label: '1/4' },
  { steps: 8, label: '1/2' },
  { steps: 16, label: '1 bar' },
];

/** @param {number} step */
const gridMark = (step) => (step % STEPS_PER_BAR === 0 ? 'bar' : step % STEPS_PER_BEAT === 0 ? 'beat' : undefined);

const PianoRow = memo(function PianoRow({ pitch, steps, notes, isRoot, isOutOfKey, onToggle, onPreview }) {
  const covered = new Array(steps).fill(undefined);
  for (const note of notes) {
    for (let step = note.step; step < Math.min(steps, note.step + note.length); step += 1) {
      covered[step] = step === note.step ? 'start' : 'body';
    }
  }
  const name = noteName(pitch);
  return (
    <div className="piano-row" data-root={isRoot || undefined} data-out-of-key={isOutOfKey || undefined}>
      <button
        type="button"
        className="piano-key"
        aria-label={`Hear ${name}`}
        title={`Hear ${name}`}
        onClick={() => onPreview(pitch)}
      >
        {name}
      </button>
      <div className="step-cells" style={{ '--steps': steps }}>
        {covered.map((state, step) => (
          <button
            key={step}
            type="button"
            className="step-cell piano-cell"
            data-mark={gridMark(step)}
            data-note={state}
            aria-pressed={Boolean(state)}
            aria-label={`${name}, bar ${Math.floor(step / STEPS_PER_BAR) + 1}, step ${(step % STEPS_PER_BAR) + 1}`}
            onClick={() => onToggle(pitch, step)}
          />
        ))}
      </div>
    </div>
  );
});

/**
 * @param {{ song: any, pattern: any, track: any, playStep: number | null,
 *   onToggle: (pitch: number, step: number, length: number) => void, onPreview: (pitch: number) => void }} props
 */
export function PianoRoll({ song, pattern, track, playStep, onToggle, onPreview }) {
  const [length, setLength] = useState(2);
  const [isKeyOnly, setIsKeyOnly] = useState(true);
  const instrument = instrumentOf(track.instrument);
  const steps = pattern.bars * STEPS_PER_BAR;
  const root = NOTE_NAMES.indexOf(song.key.root);

  const notesByPitch = useMemo(() => {
    /** @type {Map<number, any[]>} */
    const byPitch = new Map();
    for (const note of pattern.notes) {
      if (note.trackId === track.id) {
        byPitch.set(note.pitch, [...(byPitch.get(note.pitch) ?? []), note]);
      }
    }
    return byPitch;
  }, [pattern.notes, track.id]);

  const pitches = [];
  for (let pitch = instrument.high; pitch >= instrument.low; pitch -= 1) {
    // A note already placed out of key stays visible, so it can be found and removed.
    if (!isKeyOnly || isInKey(pitch, song.key) || notesByPitch.has(pitch)) {
      pitches.push(pitch);
    }
  }
  const toggle = useCallback((pitch, step) => onToggle(pitch, step, length), [onToggle, length]);

  return (
    <section className="card piano" data-instrument={track.instrument} aria-label={`${track.name} notes`}>
      <div className="piano-head">
        <h2 className="section-title">
          {track.name}
          {track.name === instrument.name ? null : <span className="piano-sub">{instrument.name}</span>}
        </h2>
        <div className="toolbar">
          <div className="segmented" role="group" aria-label="Note length">
            {NOTE_LENGTHS.map((choice) => (
              <button
                key={choice.steps}
                type="button"
                aria-pressed={length === choice.steps}
                onClick={() => setLength(choice.steps)}
              >
                {choice.label}
              </button>
            ))}
          </div>
          <label className="check">
            <input type="checkbox" checked={isKeyOnly} onChange={(event) => setIsKeyOnly(event.target.checked)} />
            Only notes in {song.key.root} {song.key.scale}
          </label>
        </div>
      </div>
      <div className="grid-scroll">
        <div className="grid-body">
          {pitches.map((pitch) => (
            <PianoRow
              key={pitch}
              pitch={pitch}
              steps={steps}
              notes={notesByPitch.get(pitch) ?? EMPTY}
              isRoot={pitch % 12 === root}
              isOutOfKey={!isInKey(pitch, song.key)}
              onToggle={toggle}
              onPreview={onPreview}
            />
          ))}
          <Playhead step={playStep} />
        </div>
      </div>
    </section>
  );
}

const EMPTY = [];
