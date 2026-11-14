// MIDI in Settings: turn it on (the browser asks permission), see the outputs it found, and choose where MIDI clock
// goes so a drum machine's own patterns follow the tempo. Says plainly when the browser has no MIDI or refused it;
// every track then plays on the built-in synth.
import { Icon } from './Icon.jsx';

const NO_MIDI = 'Every track plays on the built-in synth.';

/** @param {{ midi: import('../hooks/useMidi.js').Midi }} props */
export function MidiCard({ midi }) {
  const { status, outputNames, clockOutput, enable, disable, setClockOutput } = midi;
  const isClockMissing = clockOutput !== '' && !outputNames.includes(clockOutput);
  return (
    <section className="card card-pad midi-card" aria-labelledby="midi-title">
      <h2 className="section-title" id="midi-title">
        MIDI out
      </h2>
      <p className="view-sub">
        Play a track on a hardware synth or drum machine (through a MIDI interface or USB), or in another app. Choose
        each track&rsquo;s output on the BPM Grid. Notes leave on the same schedule as the built-in synth.
      </p>

      {status === 'unsupported' ? (
        <p className="notice" role="status">
          This browser cannot send MIDI. Use Chrome or Edge on a computer to play your gear. {NO_MIDI}
        </p>
      ) : null}

      {status === 'off' ? (
        <div className="toolbar">
          <button type="button" className="btn btn-primary" onClick={enable}>
            <Icon name="usb" size={16} />
            Turn on MIDI
          </button>
          <span className="note-text">The browser asks your permission once.</span>
        </div>
      ) : null}

      {status === 'requesting' ? (
        <p className="note-text" role="status">
          Waiting for the browser&rsquo;s permission…
        </p>
      ) : null}

      {status === 'denied' ? (
        <>
          <p className="error-banner" role="alert">
            The browser did not allow MIDI. Allow it for this site in the browser&rsquo;s site settings, then try again.{' '}
            {NO_MIDI}
          </p>
          <div className="toolbar">
            <button type="button" className="btn" onClick={enable}>
              Try again
            </button>
          </div>
        </>
      ) : null}

      {status === 'ready' ? (
        <>
          <div className="midi-outputs">
            <span className="badge badge-live">
              <Icon name="check" size={14} />
              MIDI on
            </span>
            {outputNames.length === 0 ? (
              <span className="note-text" role="status">
                No MIDI outputs found. Plug in your interface or instrument; the list updates by itself.
              </span>
            ) : (
              <ul className="midi-output-list" aria-label="MIDI outputs">
                {outputNames.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="toolbar">
            <label className="field">
              Send MIDI clock to
              <select className="select" value={clockOutput} onChange={(event) => setClockOutput(event.target.value)}>
                <option value="">No clock</option>
                {outputNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
                {isClockMissing ? <option value={clockOutput}>{clockOutput} (not connected)</option> : null}
              </select>
            </label>
            <button type="button" className="btn btn-ghost" onClick={disable}>
              Turn off MIDI
            </button>
          </div>
          <p className="note-text">
            Clock sends 24 pulses a beat with start and stop, so a drum machine set to follow MIDI clock plays its own
            patterns in time. A track whose output is not connected plays on the built-in synth.
          </p>
        </>
      ) : null}
    </section>
  );
}
