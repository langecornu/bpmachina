// The song's shared effects, on the Arrangement screen: the reverb every track can send to, the tempo-synced ping-pong
// delay, and the sidechain that ducks tracks under the kick. Each track's sends and ducking are set on its lane.
import { DELAY_DIVISION_IDS, MIX_RANGES } from '../../shared/mix.js';
import { updateFx } from '../utils/songEdit.js';
import { MixSlider } from './MixSlider.jsx';

const DIVISION_NAMES = { '1/16': '1/16', '1/8': '1/8', '1/8d': '1/8 dotted', '1/4': '1/4' };

export function FxPanel({ song, update }) {
  const { reverb, delay, sidechain } = song.fx;
  const change = (group, changes) => update((current) => updateFx(current, group, changes));
  return (
    <section className="card card-pad fx-panel" aria-labelledby="fx-title">
      <div>
        <h2 id="fx-title" className="fx-title">
          Effects
        </h2>
        <p className="note-text">
          Shared by every track. Set each track’s pan, sends and ducking from its lane on the BPM Grid.
        </p>
      </div>
      <div className="fx-groups">
        <fieldset className="fx-group">
          <legend>Reverb</legend>
          <MixSlider
            label="Size"
            value={reverb.size}
            min={MIX_RANGES.reverbSize[0]}
            max={MIX_RANGES.reverbSize[1]}
            onChange={(size) => change('reverb', { size })}
          />
          <MixSlider
            label="Decay"
            value={reverb.decay}
            min={MIX_RANGES.reverbDecay[0]}
            max={MIX_RANGES.reverbDecay[1]}
            onChange={(decay) => change('reverb', { decay })}
          />
          <MixSlider
            label="Level"
            value={reverb.level}
            min={MIX_RANGES.level[0]}
            max={MIX_RANGES.level[1]}
            onChange={(level) => change('reverb', { level })}
          />
        </fieldset>
        <fieldset className="fx-group">
          <legend>Delay</legend>
          <label className="field">
            Time, at {song.bpm} BPM
            <select
              className="select"
              value={delay.division}
              onChange={(event) => change('delay', { division: event.target.value })}
            >
              {DELAY_DIVISION_IDS.map((division) => (
                <option key={division} value={division}>
                  {DIVISION_NAMES[division]}
                </option>
              ))}
            </select>
          </label>
          <MixSlider
            label="Feedback"
            value={delay.feedback}
            min={MIX_RANGES.feedback[0]}
            max={MIX_RANGES.feedback[1]}
            onChange={(feedback) => change('delay', { feedback })}
          />
          <MixSlider
            label="Tone"
            value={delay.tone}
            min={MIX_RANGES.tone[0]}
            max={MIX_RANGES.tone[1]}
            onChange={(tone) => change('delay', { tone })}
          />
          <MixSlider
            label="Level"
            value={delay.level}
            min={MIX_RANGES.level[0]}
            max={MIX_RANGES.level[1]}
            onChange={(level) => change('delay', { level })}
          />
        </fieldset>
        <fieldset className="fx-group">
          <legend>Sidechain</legend>
          <MixSlider
            label="Amount"
            value={sidechain.amount}
            min={MIX_RANGES.duckAmount[0]}
            max={MIX_RANGES.duckAmount[1]}
            onChange={(amount) => change('sidechain', { amount })}
          />
          <MixSlider
            label="Release"
            value={sidechain.release}
            min={MIX_RANGES.duckRelease[0]}
            max={MIX_RANGES.duckRelease[1]}
            format={(release) => `${(release / 100).toFixed(2)} beat`}
            onChange={(release) => change('sidechain', { release })}
          />
        </fieldset>
      </div>
    </section>
  );
}
