// One track on the BPM Grid: its name and instrument, mute, volume and mix, and its steps in the open pattern. Drum
// lanes are edited right here; synth lanes open the piano roll below.
import { memo, useState } from 'react';

import { instrumentOf } from '../../shared/instruments.js';
import { isSampled, kitsOf, knobsOf } from '../../shared/sound.js';
import { Icon } from './Icon.jsx';
import { LaneMix } from './LaneMix.jsx';
import { SoundPanel } from './SoundPanel.jsx';
import { StepCells } from './StepCells.jsx';

export const TrackLane = memo(function TrackLane({
  track,
  steps,
  notes,
  isEditing,
  onToggleStep,
  onChangeTrack,
  onChangeMix,
  onEditNotes,
  onRemove,
}) {
  const instrument = instrumentOf(track.instrument);
  const isDrum = instrument.kind === 'drum';
  const [isSoundOpen, setIsSoundOpen] = useState(false);
  const hasKnobs = knobsOf(track.instrument).length > 0 || kitsOf(track.instrument).length > 0;
  let style = '303-style';
  if (isDrum) {
    style = isSampled(track.instrument, track.sound) ? 'sampled' : '909-style';
  }
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
        {hasKnobs ? (
          <button
            type="button"
            className="lane-toggle"
            aria-expanded={isSoundOpen}
            aria-label={`${track.name} sound`}
            title={`Sound: the ${style} ${instrument.name.toLowerCase()}'s ${isDrum ? 'kit and knobs' : 'knobs'}`}
            onClick={() => setIsSoundOpen((isOpen) => !isOpen)}
          >
            <Icon name="sliders" size={14} />
          </button>
        ) : null}
        <input
          type="range"
          className="lane-volume"
          min="0"
          max="100"
          aria-label={`${track.name} volume`}
          value={track.volume}
          onChange={(event) => onChangeTrack(track.id, { volume: Number(event.target.value) })}
        />
        <LaneMix track={track} onChangeMix={onChangeMix} />
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
          onToggle={(step, modifiers) => onToggleStep(track, step, modifiers)}
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
      {isSoundOpen && hasKnobs ? <SoundPanel track={track} onChangeTrack={onChangeTrack} /> : null}
    </div>
  );
});
