// The saved taste profile (ADR 0012), loaded once per screen: `{ status: 'none' }`, `{ status: 'ok', profile }` or
// `{ status: 'invalid', problems }`, or null while it loads. It is written outside the app (docs/TASTE.md), so a screen
// asks again each time it opens.
import { useEffect, useState } from 'react';

import { api } from '../api.js';

export function useTaste() {
  const [taste, setTaste] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isCurrent = true;
    api
      .getTaste()
      .then((loaded) => isCurrent && setTaste(loaded))
      .catch((loadError) => isCurrent && setError(loadError.message));
    return () => {
      isCurrent = false;
    };
  }, []);

  return { taste, error };
}
