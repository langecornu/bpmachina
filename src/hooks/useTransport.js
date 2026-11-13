// The transport: play and stop the song or one pattern, follow the song as it is edited, and report where playback
// is, once per step, for the transport bar and the grid's playhead.
import { useCallback, useEffect, useMemo, useState } from 'react';

import { AudioEngine } from '../audio/engine.js';
import { buildPlayback, positionAt } from '../utils/playback.js';

/**
 * @param {any} song
 * @param {{ createEngine?: () => AudioEngine }} [options] `createEngine` replaces the sound engine, for tests
 */
export function useTransport(song, { createEngine = () => new AudioEngine() } = {}) {
  // One engine for the life of the app, made on the first render only.
  const [engine] = useState(createEngine);
  const [playing, setPlaying] = useState(null);
  const [step, setStep] = useState(0);
  const [volume, setVolume] = useState(0.8);

  useEffect(() => {
    if (song) {
      engine.setSong(song);
    }
  }, [engine, song]);

  useEffect(() => () => engine.stop(), [engine]);

  // Follows the audio clock once per frame, and re-renders only when the step heard changes.
  useEffect(() => {
    if (!playing) {
      return undefined;
    }
    let frame = 0;
    const follow = () => {
      setStep(engine.heardStep());
      frame = requestAnimationFrame(follow);
    };
    frame = requestAnimationFrame(follow);
    return () => cancelAnimationFrame(frame);
  }, [engine, playing]);

  const play = useCallback(
    (options) => {
      if (song && engine.start(song, options)) {
        setStep(0);
        setPlaying(options);
      }
    },
    [engine, song],
  );

  const stop = useCallback(() => {
    engine.stop();
    setPlaying(null);
    setStep(0);
  }, [engine]);

  const changeVolume = useCallback(
    (level) => {
      setVolume(level);
      engine.setMasterVolume(level);
    },
    [engine],
  );

  const preview = useCallback(
    (instrument, pitch, trackId = null) => engine.preview(instrument, pitch, undefined, trackId),
    [engine],
  );

  const playback = useMemo(() => (playing && song ? buildPlayback(song, playing) : null), [playing, song]);
  const position = playback ? positionAt(playback, step) : null;

  return { playing, position, play, stop, volume, setVolume: changeVolume, preview };
}
