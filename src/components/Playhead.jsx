// The playhead over a grid: one thin column that moves with the music, drawn on top so the cells underneath do not
// re-render on every step.

/** @param {{ step: number | null }} props */
export function Playhead({ step }) {
  if (step === null) {
    return null;
  }
  return <div className="playhead" aria-hidden="true" style={{ '--step': step }} />;
}
