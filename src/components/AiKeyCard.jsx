// The Anthropic API key the Machina runs on. The key is pasted once and checked with Anthropic; after that the page
// only ever knows whether a key is saved. It cannot be read back, only replaced or removed.
import { useEffect, useState } from 'react';

import { api } from '../api.js';
import { Icon } from './Icon.jsx';

export function AiKeyCard() {
  const [status, setStatus] = useState(/** @type {{ hasKey: boolean, source: string | null } | null} */ (null));
  const [key, setKey] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState(/** @type {{ kind: 'ok' | 'error', text: string } | null} */ (null));

  useEffect(() => {
    let isCurrent = true;
    api
      .getAiSettings()
      .then((loaded) => isCurrent && setStatus(loaded))
      .catch((error) => isCurrent && setMessage({ kind: 'error', text: error.message }));
    return () => {
      isCurrent = false;
    };
  }, []);

  const handleSave = async (event) => {
    event.preventDefault();
    setIsBusy(true);
    setMessage(null);
    try {
      setStatus(await api.saveAiKey(key.trim()));
      setKey('');
      setIsEditing(false);
      setMessage({ kind: 'ok', text: 'Key checked with Anthropic and saved. It cannot be shown again.' });
    } catch (error) {
      setMessage({ kind: 'error', text: error.message });
    } finally {
      setIsBusy(false);
    }
  };

  const handleRemove = async () => {
    if (!window.confirm('Remove the saved API key? The Machina stops composing until you add one again.')) {
      return;
    }
    try {
      setStatus(await api.removeAiKey());
      setMessage({ kind: 'ok', text: 'The key was removed.' });
    } catch (error) {
      setMessage({ kind: 'error', text: error.message });
    }
  };

  const showForm = status && (!status.hasKey || isEditing) && status.source !== 'environment';
  return (
    <section className="card card-pad ai-key" aria-labelledby="ai-key-title">
      <h2 className="section-title" id="ai-key-title">
        Anthropic API key
      </h2>
      <p className="view-sub">
        The Machina runs on Claude, by Anthropic, with your own API key: each composition is billed to your Anthropic
        account. Create a key in the Anthropic Console. The key stays on the computer running BPMachina, is only ever
        sent to Anthropic, and cannot be read back here once saved.
      </p>
      {status === null && !message ? <p className="note-text">Checking…</p> : null}
      {status?.hasKey && !isEditing ? (
        <div className="ai-key-saved">
          <span className="badge badge-live">
            <Icon name="check" size={14} />
            Key saved
          </span>
          {status.source === 'environment' ? (
            <span className="note-text">Set on the server with ANTHROPIC_API_KEY; change it there.</span>
          ) : (
            <>
              <span className="note-text">Hidden for your safety.</span>
              <button type="button" className="btn" onClick={() => setIsEditing(true)}>
                Replace key
              </button>
              <button type="button" className="btn btn-ghost" onClick={handleRemove}>
                <Icon name="trash" size={16} />
                Remove key
              </button>
            </>
          )}
        </div>
      ) : null}
      {showForm ? (
        <form className="toolbar" onSubmit={handleSave}>
          <label className="field ai-key-field">
            Paste your API key
            <input
              className="input"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="sk-ant-…"
              value={key}
              onChange={(event) => setKey(event.target.value)}
            />
          </label>
          <button type="submit" className="btn btn-primary" disabled={isBusy || key.trim().length < 20}>
            {isBusy ? 'Checking…' : 'Save key'}
          </button>
          {isEditing ? (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setIsEditing(false);
                setKey('');
              }}
            >
              Cancel
            </button>
          ) : null}
        </form>
      ) : null}
      {message ? (
        <p
          className={message.kind === 'error' ? 'error-banner' : 'view-sub'}
          role={message.kind === 'error' ? 'alert' : 'status'}
        >
          {message.text}
        </p>
      ) : null}
    </section>
  );
}
