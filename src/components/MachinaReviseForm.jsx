// Directing a revision: one pattern or the whole song, the direction, and the tracks to keep exactly as they are.
// The cues written on the Arrangement screen go along with the song.

/**
 * @param {{ draft: import('../utils/machinaRequest.js').MachinaDraft, change: (changes: object) => void,
 *   song: any, patternId: string | null }} props
 */
export function MachinaReviseForm({ draft, change, song, patternId }) {
  const pattern = song.patterns.find((candidate) => candidate.id === patternId);
  const toggleLock = (id) =>
    change({
      lockedTrackIds: draft.lockedTrackIds.includes(id)
        ? draft.lockedTrackIds.filter((candidate) => candidate !== id)
        : [...draft.lockedTrackIds, id],
    });

  return (
    <>
      <fieldset className="scope">
        <legend>What to revise</legend>
        <label className="check">
          <input
            type="radio"
            name="machina-scope"
            checked={draft.scope === 'pattern'}
            disabled={!pattern}
            onChange={() => change({ scope: 'pattern' })}
          />
          Pattern {pattern ? <strong>{pattern.name}</strong> : null}
          <span className="note-text">(the one open on the BPM Grid)</span>
        </label>
        <label className="check">
          <input
            type="radio"
            name="machina-scope"
            checked={draft.scope === 'song'}
            onChange={() => change({ scope: 'song' })}
          />
          The whole song <span className="note-text">(following each section’s cue from the Arrangement)</span>
        </label>
      </fieldset>

      <label className="field">
        Direction
        <textarea
          className="input"
          rows={3}
          maxLength={2000}
          placeholder="For example: make it harder, double-time hats, the acid line rising an octave in the last bar"
          value={draft.direction}
          onChange={(event) => change({ direction: event.target.value })}
        />
      </label>

      <fieldset className="chip-set">
        <legend>Lock tracks the Machina must not touch</legend>
        {song.tracks.map((track) => (
          <label key={track.id} className="chip" data-instrument={track.instrument}>
            <input
              type="checkbox"
              checked={draft.lockedTrackIds.includes(track.id)}
              onChange={() => toggleLock(track.id)}
            />
            {track.name}
          </label>
        ))}
      </fieldset>
    </>
  );
}
