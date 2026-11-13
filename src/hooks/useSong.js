// Loads the song once, then autosaves edits with a short debounce and reports the save status. Every edit can be
// undone and redone, including what the Machina wrote, so trying an idea never costs the work before it.
import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../api.js';

const SAVE_DELAY_MS = 500;
const HISTORY_LIMIT = 60;
const LOAD_RETRY_MS = 1000;

/** @param {{ loadRetries?: number }} [options] how many times a failed first load is retried, a second apart */
export function useSong({ loadRetries = 10 } = {}) {
  const [song, setSong] = useState(null);
  const [saveStatus, setSaveStatus] = useState('saved');
  const [error, setError] = useState(null);
  // The history lives in a ref (undo and redo read and write it in one go); its sizes are state, for the buttons.
  const history = useRef({ past: [], future: [] });
  const [historySize, setHistorySize] = useState({ past: 0, future: 0 });
  const saveTimer = useRef(null);
  const latest = useRef(null);

  useEffect(() => {
    let isCurrent = true;
    let retryTimer = null;
    // The server may still be starting (npm run dev starts both at once), so the first load is retried for a while.
    const load = (attempt) => {
      api
        .getSong()
        .then((loaded) => {
          if (isCurrent) {
            latest.current = loaded;
            setSong(loaded);
            setError(null);
          }
        })
        .catch((loadError) => {
          if (!isCurrent) {
            return;
          }
          if (attempt < loadRetries) {
            retryTimer = setTimeout(() => load(attempt + 1), LOAD_RETRY_MS);
          } else {
            setError(loadError.message);
          }
        });
    };
    load(0);
    return () => {
      isCurrent = false;
      clearTimeout(retryTimer);
      clearTimeout(saveTimer.current);
    };
  }, [loadRetries]);

  const persist = useCallback(async () => {
    setSaveStatus('saving');
    try {
      await api.saveSong(latest.current);
      setSaveStatus('saved');
    } catch (saveError) {
      setSaveStatus('error');
      setError(saveError.message);
    }
  }, []);

  const scheduleSave = useCallback(() => {
    setSaveStatus('pending');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      persist();
    }, SAVE_DELAY_MS);
  }, [persist]);

  /** Saves a pending edit right away, so the server composes from what is on screen. */
  const flush = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      await persist();
    }
  }, [persist]);

  const show = useCallback(
    (next) => {
      latest.current = next;
      setSong(next);
      setError(null);
      scheduleSave();
    },
    [scheduleSave],
  );

  const setHistory = useCallback((next) => {
    history.current = next;
    setHistorySize({ past: next.past.length, future: next.future.length });
  }, []);

  /** @param {(song: any) => any} mutate returns the next song; returning the same song changes nothing */
  const update = useCallback(
    (mutate) => {
      const previous = latest.current;
      const next = mutate(previous);
      if (next === previous) {
        return;
      }
      setHistory({ past: [...history.current.past, previous].slice(-HISTORY_LIMIT), future: [] });
      show(next);
    },
    [setHistory, show],
  );

  const undo = useCallback(() => {
    const { past, future } = history.current;
    if (past.length === 0) {
      return;
    }
    setHistory({ past: past.slice(0, -1), future: [latest.current, ...future] });
    show(past[past.length - 1]);
  }, [setHistory, show]);

  const redo = useCallback(() => {
    const { past, future } = history.current;
    if (future.length === 0) {
      return;
    }
    setHistory({ past: [...past, latest.current], future: future.slice(1) });
    show(future[0]);
  }, [setHistory, show]);

  /** Swaps in a song the server has already saved (a new song), clearing the history. */
  const replace = useCallback(
    (next) => {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      latest.current = next;
      setSong(next);
      setError(null);
      setSaveStatus('saved');
      setHistory({ past: [], future: [] });
    },
    [setHistory],
  );

  return {
    song,
    update,
    undo,
    redo,
    canUndo: historySize.past > 0,
    canRedo: historySize.future > 0,
    flush,
    replace,
    saveStatus,
    error,
  };
}
