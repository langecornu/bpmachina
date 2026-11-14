// Settings: the services BPMachina connects to (the Anthropic API key the Machina runs on) and the taste profile it
// can compose to.
import { AiKeyCard } from './AiKeyCard.jsx';
import { TasteCard } from './TasteCard.jsx';

export function SettingsView() {
  return (
    <section className="view" aria-labelledby="settings-title">
      <div className="view-header">
        <div>
          <h1 className="view-title" id="settings-title">
            Settings
          </h1>
          <p className="view-sub">The services BPMachina connects to, and your taste.</p>
        </div>
      </div>
      <AiKeyCard />
      <TasteCard />
    </section>
  );
}
