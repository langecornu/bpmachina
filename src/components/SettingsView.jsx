// Settings: the services and gear BPMachina connects to (the Anthropic API key the Machina runs on, and MIDI out), and
// the library of taste profiles the Machina can compose to.
import { AiKeyCard } from './AiKeyCard.jsx';
import { MidiCard } from './MidiCard.jsx';
import { TasteLibrary } from './TasteLibrary.jsx';

/** @param {{ midi: import('../hooks/useMidi.js').Midi }} props */
export function SettingsView({ midi }) {
  return (
    <section className="view" aria-labelledby="settings-title">
      <div className="view-header">
        <div>
          <h1 className="view-title" id="settings-title">
            Settings
          </h1>
          <p className="view-sub">The services and gear BPMachina connects to, and your tastes.</p>
        </div>
      </div>
      <AiKeyCard />
      <MidiCard midi={midi} />
      <TasteLibrary />
    </section>
  );
}
