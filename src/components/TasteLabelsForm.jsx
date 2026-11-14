// Editing what a taste is called and how it is filed (ADR 0012): its name, style, moods and intensity, and the person's
// own likes and dislikes. The measured music (tempo, groove, structure) is left as it is; it is remade from tracks.
import { useId, useState } from 'react';

import { SUGGESTED_MOODS, TASTE_LIMITS, intensityLabel } from '../../shared/taste.js';

/** @param {string} text @param {number} limit @param {number} length @returns {string[]} */
const listOf = (text, limit, length) =>
  [
    ...new Set(
      text
        .split(/[\n,]/)
        .map((item) => item.trim().slice(0, length))
        .filter(Boolean),
    ),
  ].slice(0, limit);

/**
 * @param {{
 *   profile: import('../../shared/types.js').TasteProfile,
 *   styles: string[],
 *   moods: string[],
 *   onSave: (profile: import('../../shared/types.js').TasteProfile) => Promise<void>,
 *   onCancel: () => void,
 * }} props `styles` and `moods`: those already in the library, offered as suggestions
 */
export function TasteLabelsForm({ profile, styles, moods, onSave, onCancel }) {
  const listId = useId();
  const [name, setName] = useState(profile.name);
  const [style, setStyle] = useState(profile.style);
  const [moodText, setMoodText] = useState((profile.moods ?? []).join(', '));
  const [intensity, setIntensity] = useState(profile.intensity ?? 50);
  const [likes, setLikes] = useState((profile.likes ?? []).join('\n'));
  const [avoid, setAvoid] = useState((profile.avoid ?? []).join('\n'));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  const chosenMoods = listOf(moodText, TASTE_LIMITS.moods, TASTE_LIMITS.shortText);
  const offered = [...new Set([...moods, ...SUGGESTED_MOODS])].filter((mood) => !chosenMoods.includes(mood));
  const addMood = (mood) => setMoodText([...chosenMoods, mood].join(', '));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      await onSave({
        ...profile,
        name: name.trim(),
        style: style.trim(),
        moods: chosenMoods,
        intensity,
        likes: listOf(likes, TASTE_LIMITS.notes, TASTE_LIMITS.text),
        avoid: listOf(avoid, TASTE_LIMITS.notes, TASTE_LIMITS.text),
      });
    } catch (saveError) {
      setError(saveError.message);
      setIsSaving(false);
    }
  };

  return (
    <form className="taste-form" onSubmit={handleSubmit}>
      <label className="field">
        Name
        <input
          className="input"
          maxLength={TASTE_LIMITS.name}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label className="field">
        Style
        <input
          className="input"
          list={listId}
          maxLength={TASTE_LIMITS.shortText}
          value={style}
          onChange={(event) => setStyle(event.target.value)}
        />
        <datalist id={listId}>
          {styles.map((candidate) => (
            <option key={candidate} value={candidate} />
          ))}
        </datalist>
      </label>
      <label className="field">
        Moods, separated by commas
        <input className="input" value={moodText} onChange={(event) => setMoodText(event.target.value)} />
      </label>
      {offered.length > 0 && chosenMoods.length < TASTE_LIMITS.moods ? (
        <div className="preset-row" role="group" aria-label="Add a mood">
          {offered.slice(0, 12).map((mood) => (
            <button key={mood} type="button" className="chip" onClick={() => addMood(mood)}>
              + {mood}
            </button>
          ))}
        </div>
      ) : null}
      <label className="field">
        Intensity: {intensityLabel(intensity)} ({intensity})
        <input
          type="range"
          min="0"
          max="100"
          value={intensity}
          onChange={(event) => setIntensity(Number(event.target.value))}
        />
      </label>
      <label className="field">
        Likes, one per line
        <textarea className="input" rows={3} value={likes} onChange={(event) => setLikes(event.target.value)} />
      </label>
      <label className="field">
        Avoid, one per line
        <textarea className="input" rows={3} value={avoid} onChange={(event) => setAvoid(event.target.value)} />
      </label>
      {error ? (
        <p className="error-banner" role="alert">
          {error}
        </p>
      ) : null}
      <div className="toolbar">
        <button type="submit" className="btn btn-primary" disabled={isSaving || !name.trim() || !style.trim()}>
          {isSaving ? 'Saving…' : 'Save taste'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
