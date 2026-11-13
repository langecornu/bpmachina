// One track on the BPM Grid: its name and instrument, mute and volume, and its steps in the open pattern. Drum
// lanes are edited right here; synth lanes open the piano roll below.
import { memo } from 'react';

import { instrumentOf } from '../../shared/instruments.js';
import { Icon } from './Icon.jsx';
import { StepCells } from './StepCells.jsx';

export const TrackLane = memo(function TrackLane({
  track,
  steps,
  notes,
  isEditing,
  onToggleStep,
  onChangeTrack,
  onEditNotes,
  onRemove,
}) {
  const instrument = instrumentOf(track.instrument);
  const isDrum = instrument.kind === 'drum';
  return (
    <div className="lane" data-instrument={track.instrument} data-muted={track.muted || undefined}>
      <div className="lane-head">
        <span className="lane-swatch" aria-hidden="true" />
        <div className="lane-name">
          <strong>{track.name}</strong>
          <span>{instrument.name}</span>
        </div>
        <button
          type="button"
          className="lane-toggle"
          aria-pressed={track.muted}
          aria-label={`Mute ${track.name}`}
          title="Mute"
          onClick={() => onChangeTrack(track.id, { muted: !track.muted })}
        >
          M
        </button>
        <input
          type="range"
          className="lane-volume"
          min="0"
          max="100"
          aria-label={`${track.name} volume`}
          value={track.volume}
          onChange={(event) => onChangeTrack(track.id, { volume: Number(event.target.value) })}
        />
        <button
          type="button"
          className="lane-toggle lane-remove"
          aria-label={`Remove ${track.name}`}
          title="Remove track"
          onClick={() => onRemove(track)}
        >
          <Icon name="close" size={14} />
        </button>
      </div>
      {isDrum ? (
        <StepCells
          steps={steps}
          notes={notes}
          trackName={track.name}
          isDrum
          onToggle={(step, shiftKey) => onToggleStep(track, step, shiftKey)}
        />
      ) : (
        <button
          type="button"
          className="lane-overview"
          aria-pressed={isEditing}
          aria-label={`Edit ${track.name} notes`}
          title="Edit notes in the piano roll"
          onClick={() => onEditNotes(track.id)}
        >
          <StepCells steps={steps} notes={notes} trackName={track.name} isDrum={false} onToggle={() => {}} />
        </button>
      )}
    </div>
  );
});
