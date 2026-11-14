// The person's tastes on Settings (ADR 0012): every taste profile in the library, filtered by words, style, mood and
// intensity so a library of dozens of styles stays manageable, with the chosen one shown, editable, copyable and
// deletable. Tastes are made from tracks in a chat with Claude (docs/TASTE.md) or by hand.
import { useState } from 'react';

import { INTENSITY_BANDS, filterTastes, intensityLabel, tasteLabels } from '../../shared/taste.js';
import { useTastes } from '../hooks/useTastes.js';
import { TasteDetails } from './TasteDetails.jsx';

const HOW_TO = 'docs/TASTE.md in the BPMachina folder explains how to make them from folders of tracks you love.';
const NO_FILTERS = { query: '', style: '', mood: '', intensity: '' };

export function TasteLibrary() {
  const { library, error, reload } = useTastes();
  const [filters, setFilters] = useState(NO_FILTERS);
  const [selectedId, setSelectedId] = useState(null);

  const tastes = library?.tastes ?? [];
  const { styles, moods } = tasteLabels(tastes);
  const shown = filterTastes(tastes, filters);
  const setFilter = (changes) => setFilters((current) => ({ ...current, ...changes }));
  const handleChanged = async (selectId) => {
    await reload();
    setSelectedId(selectId);
  };

  return (
    <section className="card card-pad ai-key" aria-labelledby="taste-title">
      <h2 className="section-title" id="taste-title">
        Your tastes
      </h2>
      <p className="view-sub">
        Each taste tells the Machina what you like in one style: tempo, keys, groove, bass, instruments, structure and
        transitions, learnt from tracks you love. Pick one on the Machina screen to compose to it. They are files in
        BPMachina’s data folder, on this computer; your music is never uploaded to make them.
      </p>
      {library === null && !error ? <p className="note-text">Checking…</p> : null}
      {error ? (
        <p className="error-banner" role="alert">
          {error}
        </p>
      ) : null}
      {library && tastes.length === 0 && library.problems.length === 0 ? (
        <p className="view-sub">No tastes yet. {HOW_TO}</p>
      ) : null}
      {tastes.length > 0 ? (
        <>
          <div className="toolbar taste-filters" role="search" aria-label="Find a taste">
            <label className="field">
              Find
              <input
                className="input"
                type="search"
                placeholder="Name, style or mood"
                value={filters.query}
                onChange={(event) => setFilter({ query: event.target.value })}
              />
            </label>
            <label className="field">
              Style
              <select
                className="select"
                value={filters.style}
                onChange={(event) => setFilter({ style: event.target.value })}
              >
                <option value="">Every style</option>
                {styles.map((style) => (
                  <option key={style}>{style}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Mood
              <select
                className="select"
                value={filters.mood}
                onChange={(event) => setFilter({ mood: event.target.value })}
              >
                <option value="">Every mood</option>
                {moods.map((mood) => (
                  <option key={mood}>{mood}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Intensity
              <select
                className="select"
                value={filters.intensity}
                onChange={(event) => setFilter({ intensity: event.target.value })}
              >
                <option value="">Any intensity</option>
                {INTENSITY_BANDS.map((band) => (
                  <option key={band.id} value={band.id}>
                    {band.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="note-text" role="status">
            {shown.length} of {tastes.length} tastes
          </p>
          <ul className="taste-list">
            {shown.map((taste) => (
              <li key={taste.id}>
                <button
                  type="button"
                  className="taste-item"
                  aria-pressed={taste.id === selectedId}
                  onClick={() => setSelectedId(taste.id === selectedId ? null : taste.id)}
                >
                  <span className="taste-item-name">{taste.name}</span>
                  <span className="note-text">
                    {[taste.style, taste.moods.join(', '), intensityLabel(taste.intensity)].filter(Boolean).join(' · ')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {library?.problems.length ? (
        <div className="error-banner" role="alert">
          <p>Some taste files could not be used. Fix them, or make them again:</p>
          <ul>
            {library.problems.map((entry) => (
              <li key={entry.id}>
                {entry.id}.json: {entry.problems.join('; ')}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {selectedId && tastes.some((taste) => taste.id === selectedId) ? (
        <TasteDetails
          key={selectedId}
          id={selectedId}
          ids={tastes.map((taste) => taste.id)}
          styles={styles}
          moods={moods}
          onChanged={handleChanged}
        />
      ) : null}
    </section>
  );
}
