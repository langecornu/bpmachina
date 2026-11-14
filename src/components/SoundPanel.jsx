// A track's sound, opened from its lane header: cutoff, resonance, env mod, decay and waveform for the acid line; for
// a drum, its kit (a recorded sample or the 909-style synth) and the knobs that kit follows: tune and decay for a
// sample, and attack or snappy too for the synth. Each change goes through `update`, so it can be undone.
import { activeKnobsOf, hasWaveform, kitOf, kitsOf, soundOf } from '../../shared/sound.js';

/** @param {{ track: any, onChangeTrack: (trackId: string, changes: object) => void }} props */
export function SoundPanel({ track, onChangeTrack }) {
  const values = soundOf(track.instrument, track.sound);
  const setSound = (changes) => onChangeTrack(track.id, { sound: { ...track.sound, ...changes } });
  return (
    <div className="lane-sound" role="group" aria-label={`${track.name} sound`}>
      {kitsOf(track.instrument).length > 0 ? (
        <label className="sound-knob" title="A recorded sample, or the 909-style synth voice with all its knobs">
          <span>Kit</span>
          <select
            className="select"
            value={kitOf(track.instrument, track.sound) ?? ''}
            onChange={(event) => setSound({ kit: event.target.value })}
          >
            {kitsOf(track.instrument).map((kit) => (
              <option key={kit.id} value={kit.id}>
                {kit.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {activeKnobsOf(track.instrument, track.sound).map((knob) => (
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
