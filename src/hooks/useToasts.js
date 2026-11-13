// Brief confirmations ("Playing Ocean") that appear for a moment and go away by themselves.
import { useCallback, useEffect, useRef, useState } from 'react';

const SHOW_MS = 2400;
const MAX_TOASTS = 3;

/** @returns {{ toasts: { id: number, text: string }[], notify: (text: string) => void }} */
export function useToasts() {
  const [toasts, setToasts] = useState(/** @type {{ id: number, text: string }[]} */ ([]));
  const nextId = useRef(1);
  const timers = useRef(/** @type {Set<ReturnType<typeof setTimeout>>} */ (new Set()));

  const notify = useCallback((text) => {
    const id = nextId.current;
    nextId.current += 1;
    setToasts((current) => [...current.slice(-(MAX_TOASTS - 1)), { id, text }]);
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, SHOW_MS);
    timers.current.add(timer);
  }, []);

  useEffect(() => {
    const active = timers.current;
    return () => {
      for (const timer of active) {
        clearTimeout(timer);
      }
    };
  }, []);

  return { toasts, notify };
}
