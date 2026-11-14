// Where one track sounds, under its lane on the BPM Grid: the built-in synth, or a MIDI output the browser lists with
// a channel, and for a drum track the note its instrument answers to. A device that is not connected is kept in the
// song and shown as such; the track plays on the synth until it is back.
import { instrumentOf } from '../../shared/instruments.js';
import { MIDI_CHANNELS } from '../../shared/song.js';

const CHANNELS = Array.from({ length: MIDI_CHANNELS }, (_, index) => index + 1);
/** General MIDI puts drums on channel 10, and drum machines follow it out of the box. */
const DRUM_CHANNEL = 10;
const SYNTH = 'synth';
const DEVICE_PREFIX = 'midi:';

/**
 * @param {import('../../shared/types.js').TrackOutput} output
 * @param {string[]} outputNames
 * @returns {string} a short label for the lane: "Synth", or the device and channel
 */
export function outputLabel(output, outputNames) {
  if (output.kind !== 'midi') {
    return 'Synth';
  }
  const label = `${output.deviceName} · ch ${output.channel}`;
  return outputNames.includes(output.deviceName) ? label : `${label} (not connected)`;
}

/**
 * @param {{
 *   track: import('../../shared/types.js').Track,
 *   outputNames: string[],
 *   onChange: (output: import('../../shared/types.js').TrackOutput) => void,
 * }} props
 */
export function TrackOutput({ track, outputNames, onChange }) {
  const instrument = instrumentOf(track.instrument);
  const isDrum = instrument.kind === 'drum';
  const output = track.output;
  const midi = output.kind === 'midi' ? output : null;
  const isConnected = midi ? outputNames.includes(midi.deviceName) : true;

  const handleDevice = (value) => {
    if (value === SYNTH) {
      onChange({ kind: 'synth' });
      return;
    }
    const deviceName = value.slice(DEVICE_PREFIX.length);
    const channel = midi?.channel ?? (isDrum ? DRUM_CHANNEL : 1);
    onChange(midi?.note === undefined ? { kind: 'midi', deviceName, channel } : { ...midi, deviceName, channel });
  };

  const handleNote = (text) => {
    if (!midi) {
      return;
    }
    const rest = { kind: midi.kind, deviceName: midi.deviceName, channel: midi.channel };
    const number = Number(text);
    if (text === '') {
      onChange(rest);
    } else if (Number.isInteger(number) && number >= 0 && number <= 127) {
      onChange({ ...rest, note: number });
    }
  };

  return (
    <div className="lane-output" role="group" aria-label={`${track.name} output`}>
      <label className="field">
        Sound
        <select
          className="select"
          value={midi ? `${DEVICE_PREFIX}${midi.deviceName}` : SYNTH}
          onChange={(event) => handleDevice(event.target.value)}
        >
          <option value={SYNTH}>Built-in synth</option>
          {outputNames.map((name) => (
            <option key={name} value={`${DEVICE_PREFIX}${name}`}>
              MIDI: {name}
            </option>
          ))}
          {midi && !isConnected ? (
            <option value={`${DEVICE_PREFIX}${midi.deviceName}`}>MIDI: {midi.deviceName} (not connected)</option>
          ) : null}
        </select>
      </label>
      {midi ? (
        <label className="field">
          Channel
          <select
            className="select"
            value={midi.channel}
            onChange={(event) => onChange({ ...midi, channel: Number(event.target.value) })}
          >
            {CHANNELS.map((channel) => (
              <option key={channel} value={channel}>
                {channel}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {midi && isDrum ? (
        <label className="field">
          Note
          <input
            className="input input-narrow"
            type="number"
            min="0"
            max="127"
            placeholder={String(instrument.defaultPitch)}
            value={midi.note ?? ''}
            onChange={(event) => handleNote(event.target.value)}
          />
        </label>
      ) : null}
      <p className="note-text lane-output-note" role="status">
        {midi && !isConnected
          ? `${midi.deviceName} is not connected, so this track plays on the built-in synth. Turn MIDI on in Settings and plug it in.`
          : null}
        {midi && isConnected && isDrum
          ? `Sends note ${midi.note ?? instrument.defaultPitch}${midi.note === undefined ? ' (General MIDI)' : ''}.`
          : null}
        {!midi && outputNames.length === 0 ? 'Turn MIDI on in Settings to play this track on your gear.' : null}
      </p>
    </div>
  );
}
