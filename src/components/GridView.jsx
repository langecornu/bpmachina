// The BPM Grid: where your hands shape every note. The open pattern's tracks as lanes (drum hits are clicked right
// on the lane), and the piano roll for the synth track being edited. Every edit is heard on the next loop and can be
// undone.
import { useCallback, useMemo, useState } from 'react';

import { INSTRUMENTS, instrumentOf } from '../../shared/instruments.js';
import { STEPS_PER_BAR } from '../../shared/music.js';
import { LIMITS } from '../../shared/song.js';
import { addTrack, cycleVelocity, removeTrack, toggleNote, updateTrack } from '../utils/songEdit.js';
import { EmptyState } from './EmptyState.jsx';
import { PatternBar } from './PatternBar.jsx';
import { PianoRoll } from './PianoRoll.jsx';
import { Playhead } from './Playhead.jsx';
import { TrackLane } from './TrackLane.jsx';

const EMPTY = [];

export function GridView({ song, update, transport, patternId, onSelectPattern }) {
  const pattern = song.patterns.find((candidate) => candidate.id === patternId) ?? song.patterns[0];
  const synthTracks = song.tracks.filter((track) => instrumentOf(track.instrument).kind === 'synth');
  const [editingId, setEditingId] = useState(null);
  const editing = synthTracks.find((track) => track.id === editingId) ?? synthTracks[0] ?? null;
  const steps = pattern.bars * STEPS_PER_BAR;
  const { position, preview } = transport;
  const playStep = position && position.patternId === pattern.id ? position.patternStep : null;

  const notesByTrack = useMemo(() => {
    const byTrack = new Map();
    for (const note of pattern.notes) {
      byTrack.set(note.trackId, [...(byTrack.get(note.trackId) ?? []), note]);
    }
    return byTrack;
  }, [pattern.notes]);

  const patternRef = pattern.id;
  const handleToggleStep = useCallback(
    (track, step, isAccent) => {
      const cell = { patternId: patternRef, trackId: track.id, step };
      if (isAccent) {
        update((current) => cycleVelocity(current, cell));
        return;
      }
      const instrument = instrumentOf(track.instrument);
      update((current) => toggleNote(current, { ...cell, pitch: instrument.defaultPitch, velocity: 110 }));
      preview(instrument.id, instrument.defaultPitch);
    },
    [patternRef, preview, update],
  );

  const handleChangeTrack = useCallback(
    (trackId, changes) => update((current) => updateTrack(current, trackId, changes)),
    [update],
  );

  const handleRemove = useCallback(
    (track) => {
      if (window.confirm(`Remove the ${track.name} track and its notes in every pattern? You can undo this.`)) {
        update((current) => removeTrack(current, track.id));
      }
    },
    [update],
  );

  const editingTrackId = editing?.id;
  const editingInstrument = editing?.instrument;
  const handlePianoToggle = useCallback(
    (pitch, step, length) => {
      const cell = { patternId: patternRef, trackId: editingTrackId, step, pitch, length };
      update((current) => toggleNote(current, cell));
      preview(editingInstrument, pitch);
    },
    [editingInstrument, editingTrackId, patternRef, preview, update],
  );
  const handlePreview = useCallback((pitch) => preview(editingInstrument, pitch), [editingInstrument, preview]);

  return (
    <div className="view view-wide">
      <div className="view-header">
        <div>
          <h1 className="view-title">BPM Grid</h1>
          <p className="view-sub">
            Your hands on every note. Click a step to place a hit; Shift-click a hit to make it softer or louder.
          </p>
        </div>
      </div>

      <PatternBar song={song} pattern={pattern} update={update} onSelectPattern={onSelectPattern} />

      {song.tracks.length === 0 ? (
        <EmptyState
          icon="grid"
          title="No tracks yet"
          hint="Add a track below, or ask the Machina to write a song with its own band."
        />
      ) : (
        <section className="card lanes" aria-label={`Pattern ${pattern.name}`}>
          <div className="grid-scroll">
            <div className="grid-body">
              {song.tracks.map((track) => (
                <TrackLane
                  key={track.id}
                  track={track}
                  steps={steps}
                  notes={notesByTrack.get(track.id) ?? EMPTY}
                  isEditing={editing?.id === track.id}
                  onToggleStep={handleToggleStep}
                  onChangeTrack={handleChangeTrack}
                  onEditNotes={setEditingId}
                  onRemove={handleRemove}
                />
              ))}
              <Playhead step={playStep} />
            </div>
          </div>
        </section>
      )}

      <label className="field add-track">
        Add a track
        <select
          className="select"
          value=""
          disabled={song.tracks.length >= LIMITS.tracks}
          onChange={(event) => event.target.value && update((current) => addTrack(current, event.target.value))}
        >
          <option value="">Choose an instrument…</option>
          {INSTRUMENTS.map((instrument) => (
            <option key={instrument.id} value={instrument.id}>
              {instrument.name} ({instrument.kind === 'drum' ? 'drum' : 'synth'})
            </option>
          ))}
        </select>
      </label>

      {editing ? (
        <PianoRoll
          song={song}
          pattern={pattern}
          track={editing}
          playStep={playStep}
          onToggle={handlePianoToggle}
          onPreview={handlePreview}
        />
      ) : null}
    </div>
  );
}
