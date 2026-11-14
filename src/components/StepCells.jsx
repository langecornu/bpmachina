// One row of step cells: a drum lane's hits (each a toggle button), or a synth lane's notes seen from above (one
// "Edit notes" button opens the piano roll instead). Accents and slides are drawn as in the piano roll. Memoised: it
// re-renders only when its own notes change.
import { memo } from 'react';

import { STEPS_PER_BAR, STEPS_PER_BEAT } from '../../shared/music.js';

/** @param {number} step */
const gridMark = (step) => (step % STEPS_PER_BAR === 0 ? 'bar' : step % STEPS_PER_BEAT === 0 ? 'beat' : undefined);

/**
 * @param {{ steps: number, notes: any[], trackName: string, isDrum: boolean,
 *   onToggle: (step: number, modifiers: { shiftKey: boolean, altKey: boolean }) => void }} props
 */
export const StepCells = memo(function StepCells({ steps, notes, trackName, isDrum, onToggle }) {
  if (isDrum) {
    const hits = new Map(notes.map((note) => [note.step, note]));
    return (
      <div className="step-cells" style={{ '--steps': steps }}>
        {Array.from({ length: steps }, (_, step) => {
          const hit = hits.get(step);
          return (
            <button
              key={step}
              type="button"
              className="step-cell"
              data-mark={gridMark(step)}
              data-level={hit ? (hit.velocity >= 110 ? 'loud' : hit.velocity >= 80 ? 'mid' : 'soft') : undefined}
              data-accent={hit?.accent || undefined}
              aria-pressed={Boolean(hit)}
              aria-label={`${trackName}, bar ${Math.floor(step / STEPS_PER_BAR) + 1}, step ${(step % STEPS_PER_BAR) + 1}${hit?.accent ? ', accent' : ''}`}
              onClick={(event) => onToggle(step, { shiftKey: event.shiftKey, altKey: event.altKey })}
            />
          );
        })}
      </div>
    );
  }
  const covered = new Array(steps).fill(undefined);
  const accents = new Set();
  const slides = new Set();
  for (const note of notes) {
    const last = Math.min(steps, note.step + note.length) - 1;
    for (let step = note.step; step <= last; step += 1) {
      covered[step] = step === note.step ? 'start' : (covered[step] ?? 'body');
    }
    if (note.accent) {
      accents.add(note.step);
    }
    if (note.slide) {
      slides.add(last);
    }
  }
  return (
    <div className="step-cells step-cells-overview" style={{ '--steps': steps }} aria-hidden="true">
      {covered.map((state, step) => (
        <span
          key={step}
          className="step-cell"
          data-mark={gridMark(step)}
          data-note={state}
          data-accent={accents.has(step) || undefined}
          data-slide={slides.has(step) || undefined}
        />
      ))}
    </div>
  );
});
