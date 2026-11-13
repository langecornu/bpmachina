// Home: the first screen. It answers "what is this song, and what can I do now?": tempo and key, length and parts,
// the two ways to work (direct the Machina, or shape notes on the BPM Grid), and starting over.
import { useState } from 'react';

import { keyLabel } from '../../shared/music.js';
import { songBars, songSeconds } from '../../shared/song.js';
import { api } from '../api.js';
import { formatDuration } from '../utils/format.js';
import { Icon } from './Icon.jsx';

/** @param {number} count @param {string} word */
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

export function HomeView({ song, transport, navigate, notify, replace }) {
  const [isStarting, setIsStarting] = useState(false);
  const noteCount = song.patterns.reduce((total, pattern) => total + pattern.notes.length, 0);

  const startOver = async (starter) => {
    const message = starter
      ? 'Open the starter song? The song on screen is replaced (it cannot be undone).'
      : 'Start a new, empty song? The song on screen is replaced (it cannot be undone).';
    if (!window.confirm(message)) {
      return;
    }
    setIsStarting(true);
    try {
      transport.stop();
      replace(await api.newSong(starter));
      notify(starter ? 'Opened the starter song' : 'Started a new song');
    } catch (error) {
      notify(error.message);
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div className="view">
      <div className="view-header">
        <div>
          <p className="eyebrow">Now composing</p>
          <h1 className="view-title">{song.name}</h1>
          <p className="view-sub">
            {song.brief || 'You set the pulse; the Machina does the heavy lifting. Then shape every note by hand.'}
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => transport.play({ mode: 'song' })}>
          <Icon name="play" size={16} />
          Play song
        </button>
      </div>

      <div className="stat-row">
        <div className="stat-card">
          <span className="eyebrow">Pulse</span>
          <span className="stat-value">
            {song.bpm} <small>BPM</small>
          </span>
          <span className="stat-note">{keyLabel(song.key)}</span>
        </div>
        <div className="stat-card">
          <span className="eyebrow">Song</span>
          <span className="stat-value">{formatDuration(songSeconds(song))}</span>
          <span className="stat-note">
            {plural(songBars(song), 'bar')} · {plural(song.sections.length, 'section')}
          </span>
        </div>
        <div className="stat-card">
          <span className="eyebrow">Material</span>
          <span className="stat-value">{plural(song.tracks.length, 'track')}</span>
          <span className="stat-note">
            {plural(song.patterns.length, 'pattern')} · {plural(noteCount, 'note')}
          </span>
        </div>
      </div>

      <h2 className="section-title">Two ways to work</h2>
      <div className="home-paths">
        <button type="button" className="card card-pad home-path home-path-machina" onClick={() => navigate('machina')}>
          <span className="home-path-icon">
            <Icon name="machina" size={22} />
          </span>
          <strong>Direct the Machina</strong>
          <span>
            Describe the track, lay out its sections with a cue for each, and let the AI write the basslines, arpeggios
            and layers. Revise one pattern or the whole song, and lock what you want kept.
          </span>
        </button>
        <button type="button" className="card card-pad home-path" onClick={() => navigate('grid')}>
          <span className="home-path-icon">
            <Icon name="grid" size={22} />
          </span>
          <strong>Shape it on the BPM Grid</strong>
          <span>
            Click steps to place drum hits and notes, choose lengths, mute and balance tracks, and loop a pattern while
            you work on it.
          </span>
        </button>
        <button type="button" className="card card-pad home-path" onClick={() => navigate('arrange')}>
          <span className="home-path-icon">
            <Icon name="arrange" size={22} />
          </span>
          <strong>Arrange the song</strong>
          <span>
            Order sections, set how often each pattern repeats, write cues, and export the song for Open DMX Stage so
            the lights follow it.
          </span>
        </button>
      </div>

      <section className="card card-pad home-start" aria-label="Start over">
        <div>
          <h2 className="section-title">Start over</h2>
          <p className="view-sub">Begin from an empty song, or from the starter psytrance roller.</p>
        </div>
        <div className="toolbar">
          <button type="button" className="btn" disabled={isStarting} onClick={() => startOver(false)}>
            <Icon name="plus" size={16} />
            New empty song
          </button>
          <button type="button" className="btn btn-ghost" disabled={isStarting} onClick={() => startOver(true)}>
            <Icon name="music" size={16} />
            Open the starter song
          </button>
        </div>
      </section>
    </div>
  );
}
