// A track's place in the mix, from its lane on the BPM Grid: a button opens a small panel with its pan, its sends to
// the reverb and the delay, and whether it ducks under the kick. The panel is a native popover, so it sits above the
// scrolling grid and closes with Escape or a click elsewhere.
import { useId } from 'react';

import { MIX_RANGES } from '../../shared/mix.js';
import { Icon } from './Icon.jsx';
import { MixSlider, formatPan } from './MixSlider.jsx';

export function LaneMix({ track, onChangeMix }) {
  const id = useId();
  const { mix } = track;
  const change = (changes) => onChangeMix(track.id, changes);
  return (
    <>
      <button
        type="button"
        className="lane-toggle"
        popoverTarget={id}
        aria-label={`${track.name} mix: pan and effects`}
        title={`Mix: pan ${formatPan(mix.pan)}, reverb ${mix.reverb}, delay ${mix.delay}${mix.duck ? ', ducks' : ''}`}
      >
        <Icon name="knob" size={14} />
      </button>
      <div id={id} popover="auto" className="lane-mix" role="dialog" aria-label={`${track.name} mix`}>
        <h2 className="lane-mix-title">{track.name}</h2>
        <MixSlider
          label="Pan"
          value={mix.pan}
          min={MIX_RANGES.pan[0]}
          max={MIX_RANGES.pan[1]}
          format={formatPan}
          onChange={(pan) => change({ pan })}
        />
        <MixSlider
          label="Reverb"
          value={mix.reverb}
          min={MIX_RANGES.send[0]}
          max={MIX_RANGES.send[1]}
          onChange={(reverb) => change({ reverb })}
        />
        <MixSlider
          label="Delay"
          value={mix.delay}
          min={MIX_RANGES.send[0]}
          max={MIX_RANGES.send[1]}
          onChange={(delay) => change({ delay })}
        />
        <label className="mix-check">
          <input type="checkbox" checked={mix.duck} onChange={(event) => change({ duck: event.target.checked })} />
          Duck under the kick
        </label>
      </div>
    </>
  );
}
