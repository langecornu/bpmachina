// The transport bar: always visible, on every screen. It says what is playing and where, and gives the one obvious
// button to play or stop. Space does the same from anywhere.
import { Icon } from './Icon.jsx';

/**
 * @param {{
 *   song: any,
 *   transport: ReturnType<typeof import('../hooks/useTransport.js').useTransport>,
 *   patternId: string | null,
 * }} props `patternId`: the pattern open on the BPM Grid, which "Loop pattern" plays
 */
export function TransportBar({ song, transport, patternId }) {
  const { playing, position } = transport;
  const pattern = song.patterns.find((candidate) => candidate.id === (playing?.patternId ?? patternId));
  const title = !playing
    ? 'Stopped'
    : playing.mode === 'song'
      ? (position?.sectionName ?? song.name)
      : `Pattern ${pattern?.name ?? ''}`;
  const detail =
    playing && position
      ? `Bar ${position.bar} of ${position.totalBars} · beat ${position.beat} · ${song.bpm} BPM`
      : `${song.name} · ${song.bpm} BPM · Space to play`;
  const progress = playing && position ? (position.bar - 1 + (position.beat - 1) / 4) / position.totalBars : 0;

  return (
    <section className={`stage-bar transport${playing ? ' is-playing' : ''}`} aria-label="Transport">
      <div className="stage-main">
        <span className={`stage-icon${playing ? ' is-live' : ''}`}>
          <Icon name={playing ? 'music' : 'play'} size={20} />
        </span>
        <div className="stage-text" role="status" aria-live="polite">
          <span className="stage-eyebrow">{playing ? 'Playing' : 'Ready'}</span>
          <span className="stage-title">{title}</span>
          <span className="stage-detail">{detail}</span>
        </div>
      </div>
      <div className="transport-progress" aria-hidden="true">
        <span style={{ width: `${Math.min(100, progress * 100)}%` }} />
      </div>
      <div className="stage-actions">
        {playing ? (
          <button type="button" className="btn btn-stage-stop" onClick={transport.stop}>
            <Icon name="stop" size={16} />
            Stop
          </button>
        ) : (
          <>
            <button
              type="button"
              className="btn"
              disabled={!patternId}
              onClick={() => transport.play({ mode: 'pattern', patternId })}
            >
              <Icon name="refresh" size={16} />
              Loop pattern
            </button>
            <button type="button" className="btn btn-primary" onClick={() => transport.play({ mode: 'song' })}>
              <Icon name="play" size={16} />
              Play song
            </button>
          </>
        )}
      </div>
    </section>
  );
}
