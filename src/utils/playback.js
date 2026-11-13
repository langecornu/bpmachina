// What plays when: the song (or one pattern, looped) laid out as segments of steps, with the notes that start on any
// step and where a step falls in the song (section, bar, beat). Pure, so the scheduler's musical logic is tested
// without audio.
import { instrumentOf } from '../../shared/instruments.js';
import { STEPS_PER_BAR, STEPS_PER_BEAT } from '../../shared/music.js';
import { songTimeline } from '../../shared/song.js';

/**
 * @typedef {{ deviceName: string, channel: number, pitch: number, velocity: number }} MidiNote what a track sent to a
 *   MIDI output sends: on that device and channel (1 to 16), the note number and the note's own velocity
 * @typedef {{ trackId: string, instrument: string, pitch: number, gain: number, lengthSteps: number,
 *   midi: MidiNote | null }} PlayEvent `gain` 0 to 1: the note's velocity times its track's volume, for the synth;
 *   `midi` set when the track sounds through a MIDI output
 * @typedef {{ startStep: number, steps: number, patternSteps: number, patternId: string, sectionName: string | null }}
 *   Segment
 * @typedef {{ totalSteps: number, segments: Segment[], eventsAt: (step: number) => PlayEvent[] }} Playback
 */

/**
 * What a note sends over MIDI, or null for a track on the built-in synth. A drum track sends one note: the one its
 * output names, or else its instrument's General MIDI note, whatever pitch the note was drawn at. A synth track sends
 * the note's pitch. Velocity is the note's own; the track's volume is left to the instrument's own level.
 * @param {Pick<import('../../shared/types.js').Track, 'instrument' | 'output'>} track
 * @param {Pick<import('../../shared/types.js').Note, 'pitch' | 'velocity'>} note
 * @returns {MidiNote | null}
 */
export function midiNoteFor(track, note) {
  const output = track.output;
  if (output?.kind !== 'midi') {
    return null;
  }
  const instrument = instrumentOf(track.instrument);
  const pitch = instrument.kind === 'drum' ? (output.note ?? instrument.defaultPitch) : note.pitch;
  return { deviceName: output.deviceName, channel: output.channel, pitch, velocity: note.velocity };
}

/**
 * @param {import('../../shared/types.js').Pattern} pattern
 * @param {Map<string, import('../../shared/types.js').Track>} tracks audible tracks only
 * @returns {Map<number, PlayEvent[]>} notes by the step they start on
 */
function eventsByStep(pattern, tracks) {
  /** @type {Map<number, PlayEvent[]>} */
  const byStep = new Map();
  for (const note of pattern.notes) {
    const track = tracks.get(note.trackId);
    if (!track) {
      continue;
    }
    const event = {
      trackId: track.id,
      instrument: instrumentOf(track.instrument).id,
      pitch: note.pitch,
      gain: (note.velocity / 127) * (track.volume / 100),
      lengthSteps: note.length,
      midi: midiNoteFor(track, note),
    };
    byStep.set(note.step, [...(byStep.get(note.step) ?? []), event]);
  }
  return byStep;
}

/**
 * @param {import('../../shared/types.js').Song} song
 * @param {{ mode: 'song' | 'pattern', patternId?: string | null, soloTrackId?: string | null }} options `pattern`
 *   loops one pattern; `soloTrackId` plays that track alone
 * @returns {Playback}
 */
export function buildPlayback(song, { mode, patternId = null, soloTrackId = null }) {
  const tracks = new Map(
    song.tracks
      .filter((track) => (soloTrackId ? track.id === soloTrackId : !track.muted))
      .map((track) => [track.id, track]),
  );
  const patterns = new Map(song.patterns.map((pattern) => [pattern.id, pattern]));
  /** @type {Segment[]} */
  const segments = [];
  if (mode === 'pattern') {
    const pattern = patterns.get(patternId ?? '') ?? song.patterns[0];
    if (pattern) {
      const steps = pattern.bars * STEPS_PER_BAR;
      segments.push({ startStep: 0, steps, patternSteps: steps, patternId: pattern.id, sectionName: null });
    }
  } else {
    for (const entry of songTimeline(song)) {
      segments.push({
        startStep: entry.startBar * STEPS_PER_BAR,
        steps: entry.bars * STEPS_PER_BAR,
        patternSteps: entry.pattern.bars * STEPS_PER_BAR,
        patternId: entry.pattern.id,
        sectionName: entry.section.name,
      });
    }
  }
  const events = new Map(
    [...new Set(segments.map((segment) => segment.patternId))].map((id) => [
      id,
      eventsByStep(/** @type {import('../../shared/types.js').Pattern} */ (patterns.get(id)), tracks),
    ]),
  );
  const totalSteps = segments.reduce((total, segment) => total + segment.steps, 0);
  return {
    totalSteps,
    segments,
    eventsAt: (step) => {
      const segment = segmentAt(segments, step);
      if (!segment) {
        return [];
      }
      const local = (step - segment.startStep) % segment.patternSteps;
      return events.get(segment.patternId)?.get(local) ?? [];
    },
  };
}

/**
 * @param {Segment[]} segments
 * @param {number} step
 * @returns {Segment | null}
 */
function segmentAt(segments, step) {
  return segments.find((segment) => step >= segment.startStep && step < segment.startStep + segment.steps) ?? null;
}

/**
 * Where a step falls, for the transport display and the grid's playhead.
 * @param {Playback} playback
 * @param {number} step
 * @returns {{ bar: number, beat: number, sectionName: string | null, patternId: string | null, patternStep: number,
 *   totalBars: number }} `bar` and `beat` from 1; `patternStep` the step within the pattern playing
 */
export function positionAt(playback, step) {
  const segment = segmentAt(playback.segments, step);
  return {
    bar: Math.floor(step / STEPS_PER_BAR) + 1,
    beat: Math.floor((step % STEPS_PER_BAR) / STEPS_PER_BEAT) + 1,
    sectionName: segment?.sectionName ?? null,
    patternId: segment?.patternId ?? null,
    patternStep: segment ? (step - segment.startStep) % segment.patternSteps : 0,
    totalBars: Math.ceil(playback.totalSteps / STEPS_PER_BAR),
  };
}
