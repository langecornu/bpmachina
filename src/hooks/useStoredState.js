// State that survives leaving the screen or reloading the page, kept in this browser only. Storage can be blocked
// (private mode); the state then lasts for this visit.
import { useCallback, useState } from 'react';

/**
 * @template T
 * @param {string} key
 * @param {T} initial
 * @returns {[T, (next: T | ((current: T) => T)) => void]}
 */
export function useStoredState(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved === null ? initial : { ...initial, ...JSON.parse(saved) };
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (next) => {
      setValue((current) => {
        const resolved = typeof next === 'function' ? next(current) : next;
        try {
          localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          // Storage blocked or full: the draft lasts for this visit only.
        }
        return resolved;
      });
    },
    [key],
  );
  return [value, set];
}
