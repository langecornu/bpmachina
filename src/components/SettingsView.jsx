// Settings: the services BPMachina connects to. For now, the Anthropic API key the Machina runs on.
import { AiKeyCard } from './AiKeyCard.jsx';

export function SettingsView() {
  return (
    <section className="view" aria-labelledby="settings-title">
      <div className="view-header">
        <div>
          <h1 className="view-title" id="settings-title">
            Settings
          </h1>
          <p className="view-sub">The services BPMachina connects to.</p>
        </div>
      </div>
      <AiKeyCard />
    </section>
  );
}
