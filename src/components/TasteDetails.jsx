// One taste from the library (ADR 0012): what it says, and editing its labels, copying it into a new taste to vary it,
// or deleting it (the file is moved aside, so it can be brought back).
import { useEffect, useState } from 'react';

import { api } from '../api.js';
import { slugify } from '../utils/slugify.js';
import { Icon } from './Icon.jsx';
import { TasteLabelsForm } from './TasteLabelsForm.jsx';
import { TasteSummary } from './TasteSummary.jsx';

/**
 * @param {string} name
 * @param {string[]} taken ids already in the library
 * @returns {string} a new id from the name, unique in the library
 */
function newIdFor(name, taken) {
  const base = slugify(name) || 'taste';
  let id = base;
  for (let count = 2; taken.includes(id); count += 1) {
    id = `${base}-${count}`;
  }
  return id;
}

/** @returns {string} today as YYYY-MM-DD */
const today = () => new Date().toISOString().slice(0, 10);

/**
 * @param {{
 *   id: string,
 *   ids: string[],
 *   styles: string[],
 *   moods: string[],
 *   onChanged: (selectId: string | null) => Promise<void>,
 * }} props `onChanged` reloads the library and selects a taste (or none). The parent keys this by `id`, so another
 *   taste starts fresh.
 */
export function TasteDetails({ id, ids, styles, moods, onChanged }) {
  const [state, setState] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isCurrent = true;
    api
      .getTaste(id)
      .then((loaded) => isCurrent && setState(loaded))
      .catch((loadError) => isCurrent && setError(loadError.message));
    return () => {
      isCurrent = false;
    };
  }, [id]);

  const handleSave = async (profile) => {
    const saved = await api.saveTaste(id, { ...profile, updated: today() });
    setState(saved);
    setIsEditing(false);
    await onChanged(id);
  };

  const handleDuplicate = async () => {
    const name = `${state.profile.name} (copy)`.slice(0, 80);
    const copyId = newIdFor(name, ids);
    try {
      await api.saveTaste(copyId, { ...state.profile, name, updated: today() });
      await onChanged(copyId);
    } catch (copyError) {
      setError(copyError.message);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete the taste “${state.profile.name}”? Its file is moved to tastes/deleted.`)) {
      return;
    }
    try {
      await api.deleteTaste(id);
      await onChanged(null);
    } catch (deleteError) {
      setError(deleteError.message);
    }
  };

  if (error) {
    return (
      <p className="error-banner" role="alert">
        {error}
      </p>
    );
  }
  if (!state) {
    return <p className="note-text">Loading…</p>;
  }
  if (state.status !== 'ok') {
    return (
      <p className="error-banner" role="alert">
        This taste cannot be used: {state.status === 'none' ? 'it is no longer there.' : state.problems.join('; ')}
      </p>
    );
  }
  return (
    <section className="taste-details" aria-label={`Taste: ${state.profile.name}`}>
      <h3 className="taste-name">{state.profile.name}</h3>
      {isEditing ? (
        <TasteLabelsForm
          profile={state.profile}
          styles={styles}
          moods={moods}
          onSave={handleSave}
          onCancel={() => setIsEditing(false)}
        />
      ) : (
        <>
          <TasteSummary profile={state.profile} />
          <div className="toolbar">
            <button type="button" className="btn" onClick={() => setIsEditing(true)}>
              Edit labels
            </button>
            <button type="button" className="btn" onClick={handleDuplicate}>
              Duplicate
            </button>
            <button type="button" className="btn btn-ghost" onClick={handleDelete}>
              <Icon name="trash" size={16} />
              Delete
            </button>
          </div>
        </>
      )}
    </section>
  );
}
