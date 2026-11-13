# 7. MIDI out through Web MIDI, on the synth's schedule

Status: accepted

## Context

People want to hear their songs on real instruments: a TB-303 through a MIDI interface, a Roland TB-03, TR-8S or
TR-08, a Behringer TD-3 or RD-9, or a DAW. Each instrument listens on its own channel, drum machines expect General
MIDI note numbers, and a drum machine playing its own patterns needs MIDI clock to follow the tempo. The browser already
schedules notes ahead on the audio clock (ADR 0005), and Web MIDI can send a message timestamped for later.

## Decision

- **Each track has an output** in the song: `{ kind: 'synth' }` or `{ kind: 'midi', deviceName, channel, note? }`. A
  device is kept by **name**, because the browser's ids for it change between sessions. `note` is for a drum track
  whose instrument answers to another note than the General MIDI one. The song format moves to version 2, with a
  migration that puts every existing track on the synth.
- **One schedule for both.** The engine's look-ahead decides what plays when; a track sent to MIDI goes to the MIDI
  sink (`src/audio/midiOut.js`) instead of the synth voices. Audio-clock times become `performance.now()` times
  through the browser's output timestamp when it reports one (so MIDI lines up with what the synth is heard to play),
  else through the current audio time. Note-ons are sent with their timestamp; **note-offs are held** until the
  scheduler reaches their time, and released before the note-ons of that step, so stopping never leaves a stale
  note-off to cut a later note and a repeated note is never cut by the one before.
- **Stop** releases held notes and sends all-notes-off (controller 123) on every channel used, timed just after the
  last message already sent ahead.
- **Clock** is optional, to one output chosen in Settings: start (or song position and continue past the top), 6
  pulses a sixteenth (24 PPQN), stop.
- **Velocity is the note's own**; the track's volume stays with the synth, since a hardware instrument has its own
  level. The song has no accent or slide yet; when it does, accent maps to velocity here.
- **Graceful without MIDI.** Access lives in `src/hooks/useMidi.js`, asked only when the person turns MIDI on, without
  system exclusive, and restored on later visits. With no Web MIDI (Safari), a refusal, or a device unplugged, the
  track plays on the synth and the UI says why. Whether MIDI is on and the clock output are kept in this browser, since
  they depend on the gear plugged into this computer; which track goes where is kept in the song.

## Consequences

Hardware and the synth play in time from one scheduler, and the scheduling is tested to the byte and millisecond with
a stand-in Web MIDI. Timing is as good as the browser's MIDI timestamps and the interface: a few milliseconds of
jitter are possible, and a hidden tab's slower timer is absorbed only for short stretches, as for the synth. The clock
runs only while playing, so a drum machine shows its own tempo when stopped. Songs moved to another computer keep
their device names and play on the synth until a device of that name is plugged in.
