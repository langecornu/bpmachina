// App shell: loads the song, owns the transport, and routes between screens. Space plays and stops, and Ctrl or
// Command + Z undoes, from anywhere outside a text field.
import { useEffect, useEffectEvent, useRef, useState } from 'react';

import { ArrangeView } from './components/ArrangeView.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { GridView } from './components/GridView.jsx';
import { HomeView } from './components/HomeView.jsx';
import { MachinaView } from './components/MachinaView.jsx';
import { SettingsView } from './components/SettingsView.jsx';
import { Sidebar } from './components/Sidebar.jsx';
import { ToastRegion } from './components/ToastRegion.jsx';
import { TopBar } from './components/TopBar.jsx';
import { TransportBar } from './components/TransportBar.jsx';
import { useMidi } from './hooks/useMidi.js';
import { useSong } from './hooks/useSong.js';
import { useTheme } from './hooks/useTheme.js';
import { useToasts } from './hooks/useToasts.js';
import { useTransport } from './hooks/useTransport.js';
import { isTypingTarget } from './utils/keys.js';

const NO_OUTPUTS = [];

/**
 * @param {{ createEngine?: () => import('./audio/engine.js').AudioEngine }} [props] `createEngine` replaces the sound
 *   engine, for tests
 */
export function App({ createEngine } = {}) {
  const [view, setView] = useState('home');
  const [patternId, setPatternId] = useState(null);
  const mainRef = useRef(null);
  const songState = useSong();
  const { song, update, undo, redo, error } = songState;
  const midi = useMidi();
  const transport = useTransport(song, {
    ...(createEngine ? { createEngine } : {}),
    midiAccess: midi.access,
    clockOutput: midi.clockOutput || null,
  });
  const { toasts, notify } = useToasts();
  const { theme, toggle: toggleTheme } = useTheme();

  // The BPM Grid opens on the first pattern, and moves off a pattern that was deleted or replaced by the Machina.
  const openPatternId = song?.patterns.some((pattern) => pattern.id === patternId)
    ? patternId
    : (song?.patterns[0]?.id ?? null);

  // Each screen opens at its top, not at the scroll position of the screen before.
  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
  }, [view]);

  const { playing, play, stop } = transport;
  // An effect event always sees the latest screen, song and transport, so the listener is added once rather than again
  // after every edit.
  const handleKeyDown = useEffectEvent((event) => {
    if (isTypingTarget(event.target)) {
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) {
        redo();
      } else {
        undo();
      }
      return;
    }
    if (event.key === ' ' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      // A focused button would also take the space as a click.
      event.preventDefault();
      if (playing) {
        stop();
      } else if (view === 'grid' && openPatternId) {
        play({ mode: 'pattern', patternId: openPatternId });
      } else {
        play({ mode: 'song' });
      }
    }
  });
  useEffect(() => {
    const listener = (event) => handleKeyDown(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  if (!song) {
    return error ? (
      <div className="splash" role="alert">
        <p>Could not load the song: {error}. Is the server running? Start it with npm run dev.</p>
      </div>
    ) : (
      <div className="splash" role="status">
        <div className="splash-mark" aria-hidden="true" />
        <p>Loading…</p>
      </div>
    );
  }

  const liveViews = playing ? [playing.mode === 'pattern' ? 'grid' : 'arrange'] : [];
  const shared = { song, update, transport, notify, navigate: setView };
  const midiOutputs = midi.status === 'ready' ? midi.outputNames : NO_OUTPUTS;

  return (
    <div className="shell">
      <Sidebar current={view} onSelect={setView} liveViews={liveViews} />
      <TopBar
        song={song}
        update={update}
        history={songState}
        saveStatus={songState.saveStatus}
        volume={transport.volume}
        onVolume={transport.setVolume}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
      <main className="main" ref={mainRef}>
        {error ? (
          <div className="error-banner" role="alert">
            {error}
          </div>
        ) : null}
        <ErrorBoundary key={view} label="this screen">
          {view === 'home' ? <HomeView {...shared} replace={songState.replace} /> : null}
          {view === 'machina' ? (
            <MachinaView {...shared} undo={undo} flush={songState.flush} patternId={openPatternId} />
          ) : null}
          {view === 'grid' ? (
            <GridView {...shared} patternId={openPatternId} onSelectPattern={setPatternId} midiOutputs={midiOutputs} />
          ) : null}
          {view === 'arrange' ? <ArrangeView {...shared} onOpenPattern={setPatternId} /> : null}
          {view === 'settings' ? <SettingsView midi={midi} /> : null}
        </ErrorBoundary>
      </main>
      <div className="dock">
        <TransportBar song={song} transport={transport} patternId={openPatternId} />
      </div>
      <ToastRegion toasts={toasts} />
    </div>
  );
}
