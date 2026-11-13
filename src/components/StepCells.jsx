// One row of step cells: a drum lane's hits (each a toggle button), or a synth lane's notes seen from above (one
// "Edit notes" button opens the piano roll instead). Memoised: it re-renders only when its own notes change.
import { memo } from 'react';

import { STEPS_PER_BAR, STEPS_PER_BEAT } from '../../shared/music.js';

/** @param {number} step */
const gridMark = (step) => (step % STEPS_PER_BAR === 0 ? 'bar' : step % STEPS_PER_BEAT === 0 ? 'beat' : undefined);

/**
 * @param {{ steps: number, notes: any[], trackName: string, isDrum: boolean,
 *   onToggle: (step: number, shiftKey: boolean) => void }} props
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
              aria-pressed={Boolean(hit)}
              aria-label={`${trackName}, bar ${Math.floor(step / STEPS_PER_BAR) + 1}, step ${(step % STEPS_PER_BAR) + 1}`}
              onClick={(event) => onToggle(step, event.shiftKey)}
            />
          );
        })}
      </div>
    );
  }
  const covered = new Array(steps).fill(undefined);
  for (const note of notes) {
    for (let step = note.step; step < Math.min(steps, note.step + note.length); step += 1) {
      covered[step] = step === note.step ? 'start' : (covered[step] ?? 'body');
    }
  }
  return (
    <div className="step-cells step-cells-overview" style={{ '--steps': steps }} aria-hidden="true">
      {covered.map((state, step) => (
        <span key={step} className="step-cell" data-mark={gridMark(step)} data-note={state} />
      ))}
    </div>
  );
});
