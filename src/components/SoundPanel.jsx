// A track's sound knobs, opened from its lane header: cutoff, resonance, env mod, decay and waveform for the acid line,
// tune and decay (and attack or snappy) for the drums. Each change goes through `update`, so it can be undone.
import { hasWaveform, knobsOf, soundOf } from '../../shared/sound.js';

/** @param {{ track: any, onChangeTrack: (trackId: string, changes: object) => void }} props */
export function SoundPanel({ track, onChangeTrack }) {
  const values = soundOf(track.instrument, track.sound);
  const setSound = (changes) => onChangeTrack(track.id, { sound: { ...track.sound, ...changes } });
  return (
    <div className="lane-sound" role="group" aria-label={`${track.name} sound`}>
      {knobsOf(track.instrument).map((knob) => (
        <label key={knob.id} className="sound-knob" title={knob.hint}>
          <span>{knob.label}</span>
          <input
            type="range"
            min="0"
            max="100"
            value={values[knob.id]}
            onChange={(event) => setSound({ [knob.id]: Number(event.target.value) })}
          />
          <output>{values[knob.id]}</output>
        </label>
      ))}
      {hasWaveform(track.instrument) ? (
        <div className="segmented" role="group" aria-label="Waveform">
          {['saw', 'square'].map((waveform) => (
            <button
              key={waveform}
              type="button"
              aria-pressed={values.waveform === waveform}
              onClick={() => setSound({ waveform })}
            >
              {waveform === 'saw' ? 'Saw' : 'Square'}
            </button>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        className="btn btn-ghost"
        disabled={Object.keys(track.sound ?? {}).length === 0}
        onClick={() => onChangeTrack(track.id, { sound: {} })}
      >
        Reset
      </button>
    </div>
  );
}
