// The person's library of taste profiles (ADR 0012), loaded when a screen opens: `{ tastes, problems }`, or null while
// it loads. Tastes are also written outside the app (docs/TASTE.md), so each screen asks again when it opens, and
// `reload` asks again after a change.
import { useCallback, useEffect, useState } from 'react';

import { api } from '../api.js';

export function useTastes() {
  const [library, setLibrary] = useState(null);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    try {
      setLibrary(await api.listTastes());
      setError(null);
    } catch (loadError) {
      setError(loadError.message);
    }
  }, []);

  useEffect(() => {
    let isCurrent = true;
    api
      .listTastes()
      .then((loaded) => isCurrent && setLibrary(loaded))
      .catch((loadError) => isCurrent && setError(loadError.message));
    return () => {
      isCurrent = false;
    };
  }, []);

  return { library, error, reload };
}
