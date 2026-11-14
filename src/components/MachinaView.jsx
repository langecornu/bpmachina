// Machina: direct the AI composer. You set the pulse (a brief, a structure with cues, tempo, key, the band) and the
// Machina does the heavy lifting; or you hand it what you have and say what to change, locking what you want kept.
// Its answer replaces the song on screen at once, and one Undo brings back what was there.
import { useEffect, useState } from 'react';

import { costOf, formatPrice } from '../../shared/aiModels.js';
import { api } from '../api.js';
import { useStoredState } from '../hooks/useStoredState.js';
import { useTastes } from '../hooks/useTastes.js';
import { EMPTY_DRAFT, buildComposeRequest, estimateRequest } from '../utils/machinaRequest.js';
import { AiModelPicker } from './AiModelPicker.jsx';
import { Icon } from './Icon.jsx';
import { MachinaNewForm } from './MachinaNewForm.jsx';
import { MachinaReviseForm } from './MachinaReviseForm.jsx';
import { TastePicker } from './TastePicker.jsx';

const DRAFT_KEY = 'bpm-machina-draft';

export function MachinaView({ song, update, undo, flush, transport, navigate, notify, patternId }) {
  const [draft, setDraft] = useStoredState(DRAFT_KEY, EMPTY_DRAFT);
  const [keyStatus, setKeyStatus] = useState(null);
  const [isComposing, setIsComposing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const { library: tasteLibrary } = useTastes();

  useEffect(() => {
    let isCurrent = true;
    api
      .getAiSettings()
      .then((status) => isCurrent && setKeyStatus(status))
      .catch((loadError) => isCurrent && setError(loadError.message));
    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    if (!isComposing) {
      return undefined;
    }
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [isComposing]);

  const change = (changes) => setDraft((current) => ({ ...current, ...changes }));
  const tasteIds = (tasteLibrary?.tastes ?? []).map((taste) => taste.id);
  const request = buildComposeRequest(draft, song, patternId, tasteIds);
  const canCompose =
    Boolean(keyStatus?.hasKey) &&
    !isComposing &&
    (draft.mode === 'revise' ? request.brief.length > 0 : request.brief.length > 0 || request.sections.length > 0);

  const handleCompose = async () => {
    setIsComposing(true);
    setElapsed(0);
    setError(null);
    setResult(null);
    try {
      // The server revises the saved song, so a pending edit is saved first.
      await flush();
      const answer = await api.compose(request);
      transport.stop();
      update(() => answer.song);
      setResult(answer);
      notify(draft.mode === 'new' ? 'The Machina wrote a new song' : 'The Machina revised the song');
    } catch (composeError) {
      setError(composeError.message);
    } finally {
      setIsComposing(false);
    }
  };

  const handleUndo = () => {
    undo();
    setResult(null);
    notify('Put back the song from before');
  };

  return (
    <div className="view">
      <div className="view-header">
        <div>
          <p className="eyebrow">The Machina Engine</p>
          <h1 className="view-title">Direct the Machina</h1>
          <p className="view-sub">
            You set the pulse; the Machina does the heavy lifting. Undo always brings back your work.
          </p>
        </div>
      </div>

      {keyStatus && !keyStatus.hasKey ? (
        <div className="notice" role="note">
          <Icon name="help" size={18} />
          <span>
            The Machina runs on Claude with your own Anthropic API key. Add it in Settings to start composing.
          </span>
          <button type="button" className="btn" onClick={() => navigate('settings')}>
            Open Settings
          </button>
        </div>
      ) : null}

      <div className="segmented segmented-large" role="group" aria-label="What the Machina does">
        <button type="button" aria-pressed={draft.mode === 'new'} onClick={() => change({ mode: 'new' })}>
          Compose a new song
        </button>
        <button type="button" aria-pressed={draft.mode === 'revise'} onClick={() => change({ mode: 'revise' })}>
          Revise this song
        </button>
      </div>

      <section className="card card-pad machina-form" aria-label="Your direction">
        {draft.mode === 'new' ? (
          <MachinaNewForm draft={draft} change={change} />
        ) : (
          <MachinaReviseForm draft={draft} change={change} song={song} patternId={patternId} />
        )}
        <TastePicker
          library={tasteLibrary}
          value={draft.tasteId ?? null}
          onChange={(tasteId) => change({ tasteId })}
          onOpenSettings={() => navigate('settings')}
          disabled={isComposing}
        />
        <AiModelPicker
          value={draft.model}
          onChange={(model) => change({ model })}
          request={estimateRequest(draft, song, patternId)}
          disabled={isComposing}
        />
        <div className="machina-go">
          <button type="button" className="btn btn-primary btn-large" disabled={!canCompose} onClick={handleCompose}>
            <Icon name="machina" size={18} />
            {isComposing ? 'The Machina is writing…' : draft.mode === 'new' ? 'Compose' : 'Revise'}
          </button>
          {isComposing ? (
            <span className="note-text" role="status">
              {elapsed} s. A full song can take a minute or two.
            </span>
          ) : null}
          {draft.mode === 'new' && !isComposing ? (
            <span className="note-text">Replaces the song on screen; Undo puts it back.</span>
          ) : null}
        </div>
      </section>

      {error ? (
        <div className="error-banner" role="alert">
          {error}
        </div>
      ) : null}

      {result ? (
        <section className="card card-pad machina-result" aria-label="What the Machina wrote">
          <p className="eyebrow">The Machina says</p>
          <p className="machina-summary">{result.summary}</p>
          <p className="note-text">
            {result.song.patterns.length} patterns · {result.song.sections.length} sections · cost about{' '}
            {formatPrice(costOf(result.usage, result.model))}
          </p>
          <div className="toolbar">
            <button type="button" className="btn btn-primary" onClick={() => transport.play({ mode: 'song' })}>
              <Icon name="play" size={16} />
              Play it
            </button>
            <button type="button" className="btn" onClick={() => navigate('grid')}>
              <Icon name="grid" size={16} />
              Shape it on the BPM Grid
            </button>
            <button type="button" className="btn btn-ghost" aria-label="Undo the Machina’s change" onClick={handleUndo}>
              <Icon name="undo" size={16} />
              Undo
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
