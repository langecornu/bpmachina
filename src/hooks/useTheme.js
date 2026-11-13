// Light/dark theme: follows the saved choice, else the system setting, and persists changes.
import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'bpm-theme';

function readInitialTheme() {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

export function useTheme() {
  const [theme, setTheme] = useState(readInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Storage can be blocked (private mode); the theme still changes for this session.
      }
      return next;
    });
  }, []);

  return { theme, toggle };
}
